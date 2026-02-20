/**
 * PDF Parser Utility - Dual library approach
 * Primary: pdf2json (for annual reports)
 * Fallback: pdf-parse (for problematic transcripts)
 */

import PDFParser from 'pdf2json';
import * as pdfParse from 'pdf-parse';

export interface PDFParseResult {
    text: string;
    pageCount: number;
    isImageBased: boolean;
}

/**
 * Download and parse a PDF from a URL
 * @param url - PDF URL (BSE India, NSE India, etc.)
 * @param cookies - Optional session cookies for authenticated access
 * @param useFallback - Use pdf-parse instead of pdf2json (for problematic PDFs)
 * @returns Extracted text and metadata
 */
export async function downloadAndParsePDF(
    url: string, 
    cookies?: string,
    useFallback: boolean = false
): Promise<PDFParseResult> {
    console.log(`📥 [PDF Parser] Downloading PDF from ${url.substring(0, 1200)}...`);
    
    try {
        // Download PDF with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);
        
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': `${process.env.O_URL}`,
            'Accept': 'application/pdf,*/*',
        };

        if (cookies) {
            headers['Cookie'] = cookies;
        }
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers,
            redirect: 'follow',
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            console.error(`❌ [PDF Parser] Failed URL: ${url}`);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Get PDF as buffer (limit to 50MB)
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
        console.log(`📄 [PDF Parser] Downloaded ${fileSizeMB} MB`);
        
        if (buffer.length > 50 * 1024 * 1024) {
            throw new Error(`PDF too large: ${fileSizeMB} MB (max 50 MB)`);
        }
        
        // ============================================
        // FALLBACK: Use pdf-parse for problematic PDFs
        // ============================================
        if (useFallback) {
            console.log(`🔄 [PDF Parser] Using pdf-parse (fallback method)...`);
            const startTime = Date.now();
            
            const data = await (pdfParse as any).default(buffer);
            
            const parseTime = ((Date.now() - startTime) / 1000).toFixed(1);
            const textLength = data.text.length;
            const isImageBased = textLength < 1000;
            
            console.log(`✅ [PDF Parse] Extracted ${textLength.toLocaleString()} characters from ${data.numpages} pages in ${parseTime}s`);
            
            if (isImageBased) {
                console.warn(`⚠️ [PDF Parse] PDF appears to be image-based (${textLength} chars) - OCR required`);
            }
            
            return {
                text: data.text,
                pageCount: data.numpages,
                isImageBased,
            };
        }
        
        // ============================================
        // PRIMARY: Use pdf2json (default)
        // ============================================
        console.log(`🔍 [PDF Parser] Extracting text with pdf2json (primary method)...`);
        const startTime = Date.now();
        
        const pdfParser = new PDFParser(null, true);
        
        const parsePromise = new Promise<string>((resolve, reject) => {
            let fullText = '';
            
            pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
                try {
                    if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
                        for (const page of pdfData.Pages) {
                            if (page.Texts && Array.isArray(page.Texts)) {
                                for (const text of page.Texts) {
                                    if (text.R && Array.isArray(text.R)) {
                                        for (const run of text.R) {
                                            if (run.T) {
                                                try {
                                                    fullText += decodeURIComponent(run.T) + ' ';
                                                } catch {
                                                    fullText += run.T + ' ';
                                                }
                                            }
                                        }
                                    }
                                }
                                fullText += '\n\n';
                            }
                        }
                    }
                    resolve(fullText);
                } catch (error: any) {
                    reject(new Error(`Failed to extract text: ${error.message}`));
                }
            });
            
            pdfParser.on('pdfParser_dataError', (error: any) => {
                reject(new Error(error.parserError || 'PDF parsing failed'));
            });
            
            setTimeout(() => {
                reject(new Error('PDF parsing timeout after 120s'));
            }, 120000);
            
            pdfParser.parseBuffer(buffer);
        });
        
        const fullText = await parsePromise;
        const parseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const textLength = fullText.length;
        const isImageBased = textLength < 1000;
        const pageCount = (pdfParser as any).data?.Pages?.length || 0;
        
        console.log(`✅ [PDF2JSON] Extracted ${textLength.toLocaleString()} characters from ${pageCount} pages in ${parseTime}s`);
        
        if (isImageBased) {
            console.warn(`⚠️ [PDF2JSON] PDF appears to be image-based (${textLength} chars) - OCR required`);
        }
        
        return {
            text: fullText,
            pageCount,
            isImageBased,
        };
        
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('PDF download timeout after 120 seconds');
        }
        
        console.error(`❌ [PDF Parser] Error:`, error.message);
        throw new Error(`Failed to parse PDF: ${error.message}`);
    }
}
