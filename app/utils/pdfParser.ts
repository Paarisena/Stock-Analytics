/**
 * PDF Parser Utility
 * Downloads and extracts text from PDF files using pdf2json (Node.js-native)
 */

import PDFParser from 'pdf2json';
import { Readable } from 'stream';

export interface PDFParseResult {
    text: string;
    pageCount: number;
    isImageBased: boolean;
}

/**
 * Download and parse a PDF from a URL
 * @param url - PDF URL (BSE India, NSE India, etc.)
 * @param cookies - Optional session cookies for authenticated access
 * @returns Extracted text and metadata
 */
export async function downloadAndParsePDF(url: string, cookies?: string): Promise<PDFParseResult> {
    console.log(`📥 [PDF Parser] Downloading PDF from ${url.substring(0, 60)}...`);
    
    try {
        // Download PDF with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.screener.in/',
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
        
        // Parse PDF with pdf2json
        console.log(`🔍 [PDF Parser] Extracting text from PDF...`);
        const startTime = Date.now();
        
        const pdfParser = new PDFParser(null, true); // true = verbose mode off
        
        // Parse PDF from buffer
        const parsePromise = new Promise<string>((resolve, reject) => {
            let fullText = '';
            let pageCount = 0;
            
            pdfParser.on('pdfParser_dataReady', (pdfData: any) => {

                
                try {
                    // Extract text from all pages
                    if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
                        pageCount = pdfData.Pages.length;
                        
                        for (const page of pdfData.Pages) {
                            if (page.Texts && Array.isArray(page.Texts)) {
                                for (const text of page.Texts) {
                                    if (text.R && Array.isArray(text.R)) {
                                        for (const run of text.R) {
                                            if (run.T) {
                                                // Decode URI-encoded text, handle malformed URIs
                                                try {
                                                    fullText += decodeURIComponent(run.T) + ' ';
                                                } catch {
                                                    // If URI is malformed, use raw text
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
            
            // Parse the buffer
            pdfParser.parseBuffer(buffer);
        });
        
        const fullText = await parsePromise;
        const parseTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const textLength = fullText.length;
        const isImageBased = textLength < 1000;
        
        // Get page count from parsed data
        const pageCount = (pdfParser as any).data?.Pages?.length || 0;
        
        console.log(`✅ [PDF Parser] Extracted ${textLength.toLocaleString()} characters from ${pageCount} pages in ${parseTime}s`);
        
        if (isImageBased) {
            console.warn(`⚠️ [PDF Parser] PDF appears to be image-based (${textLength} chars) - OCR required`);
        }
        
        return {
            text: fullText,
            pageCount,
            isImageBased,
        };
        
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new Error('PDF download timeout after 60 seconds');
        }
        
        console.error(`❌ [PDF Parser] Error:`, error.message);
        throw new Error(`Failed to parse PDF: ${error.message}`);
    }
}
