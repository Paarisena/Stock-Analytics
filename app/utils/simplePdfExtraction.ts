import * as pdfParse from 'pdf-parse';

/**
 * Simple PDF to text converter - no complex parsing
 * Works for earnings call transcripts
 */
export async function extractPdfText(pdfUrl: string, cookies?: string): Promise<string> {
    try {
        console.log(`📄 [PDF] Downloading from: ${pdfUrl}`);
        
        // Download PDF as buffer
        const response = await fetch(pdfUrl, {
            headers: cookies ? { Cookie: cookies } : {},
        });
        
        if (!response.ok) {
            throw new Error(`Failed to download PDF: ${response.status}`);
        }
        
        // Get PDF as array buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        console.log(`📊 [PDF] File size: ${(buffer.length / 1024).toFixed(2)} KB`);
        
        // Extract text using pdf-parse (simple mode)
        // @ts-ignore - pdf-parse has typing issues
        const data = await pdfParse(buffer, {
            max: 0, // Parse all pages
        });
        
        const text = data.text.trim();
        
        console.log(`✅ [PDF] Extracted ${text.length.toLocaleString()} characters from ${data.numpages} pages`);
        
        // Validate extracted text
        if (text.length < 500) {
            throw new Error('Extracted text too short (might be scanned PDF)');
        }
        
        // Check ONLY the beginning for PDF markers (not the whole content)
        // pdf-parse sometimes includes metadata at the start
        const first1000Chars = text.substring(0, 1000);
        
        // More lenient binary check - only fail if we have A LOT of binary chars
        const binaryCharMatches = first1000Chars.match(/[\x00-\x08\x0E-\x1F]/g);
        const binaryCharCount = binaryCharMatches ? binaryCharMatches.length : 0;
        const binaryPercentage = (binaryCharCount / 1000) * 100;
        
        if (binaryPercentage > 50) {
            console.warn(`⚠️ [PDF] High binary content detected (${binaryPercentage.toFixed(1)}% in first 1000 chars)`);
            throw new Error('Binary content detected - PDF might be image-based');
        }
        
        // Check if text starts with PDF marker (bad extraction)
        if (text.trimStart().startsWith('%PDF')) {
            console.warn(`⚠️ [PDF] Text starts with %PDF marker - extraction failed`);
            throw new Error('Binary content detected - PDF might be image-based');
        }
        
        // Check if we got actual readable text (contains common English words)
        const hasReadableText = /\b(the|and|to|of|a|in|is|for|on|with|as|by|this|that)\b/i.test(text.substring(0, 5000));
        if (!hasReadableText) {
            console.warn(`⚠️ [PDF] No common English words found in first 5000 chars`);
            throw new Error('No readable text found - PDF might be image-based or corrupted');
        }
        
        console.log(`✅ [PDF] Validation passed - readable text extracted`);
        console.log(`📝 [Preview] ${text.substring(0, 200).replace(/\s+/g, ' ')}...`);
        
        return text;
        
    } catch (error: any) {
        console.error(`❌ [PDF] Extraction failed: ${error.message}`);
        throw error;
    }
}