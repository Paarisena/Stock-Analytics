/**
 * Google Cloud Vision API Utility
 * Extracts text from image-based PDFs using OCR
 * Reference: https://docs.cloud.google.com/vision/docs/reference/rest
 */

const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY || process.env.GEMINI_API_KEY;

/**
 * Extract text from a PDF using Google Cloud Vision API (OCR)
 * Uses documentTextDetection for optimal PDF/document OCR
 * @param pdfUrl - URL of the PDF to process
 * @returns Extracted text content
 */
export async function extractTextFromPDF(pdfUrl: string): Promise<string> {
    if (!GOOGLE_CLOUD_API_KEY) {
        throw new Error('GOOGLE_CLOUD_API_KEY not configured');
    }
    
    console.log(`🔍 [Cloud Vision] Processing PDF with document OCR...`);
    
    try {
        // Download PDF
        const response = await fetch(pdfUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });
        
        if (!response.ok) {
            throw new Error(`Failed to download PDF: HTTP ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const base64Pdf = Buffer.from(arrayBuffer).toString('base64');
        
        const startTime = Date.now();
        
        // Call Cloud Vision API - Document Text Detection
        const apiResponse = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requests: [{
                        image: {
                            content: base64Pdf
                        },
                        features: [{
                            type: 'DOCUMENT_TEXT_DETECTION',
                            maxResults: 1
                        }]
                    }]
                })
            }
        );
        
        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            throw new Error(`Cloud Vision API error ${apiResponse.status}: ${JSON.stringify(errorData)}`);
        }
        
        const data = await apiResponse.json();
        console.log(`📄 [Cloud Vision] Response:`, JSON.stringify(data, null, 2).substring(0, 500));
        
        const extractedText = data?.responses?.[0]?.fullTextAnnotation?.text || '';
        const ocrTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (!extractedText || extractedText.length < 1000) {
            throw new Error(`OCR extraction failed: ${extractedText.length} characters extracted`);
        }
        
        console.log(`✅ [Cloud Vision] OCR completed: ${extractedText.length.toLocaleString()} characters in ${ocrTime}s`);
        
        return extractedText;
        
    } catch (error: any) {
        console.error(`❌ [Cloud Vision] OCR error:`, error.message);
        throw new Error(`Cloud Vision OCR failed: ${error.message}`);
    }
}

// Removed extractBalanceSheetFromPDF - using single OCR pass in extractTextFromPDF instead
// The OCR'd text from extractTextFromPDF includes properly formatted tables that AI can parse directly

