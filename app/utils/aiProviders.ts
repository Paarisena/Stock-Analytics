/**
 * AI Provider Wrappers
 * Abstracts API calls to Perplexity, Groq, and other AI services
 */

import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';



export const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');


// ========================
// GEMINI SEARCH WRAPPER
// ========================

interface GeminiSearchOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

interface GeminiSearchResult {
    content: string;
    citations: Array<{ url: string; title?: string; text?: string }>;
}

export async function callGeminiSearch(
    prompt: string,
    options: GeminiSearchOptions = {}
): Promise<GeminiSearchResult> {
    const {
        model = 'gemini-2.5-flash',
        temperature = 0.2,
        maxTokens = 30000,
    } = options;

    try {
        const genModel = gemini.getGenerativeModel({
            model,
            tools: [{ googleSearch: {} } as any],
        });

        const result = await genModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        });

        const rawContent = result.response.text();
        
        // Extract URLs from the response text using regex
        const urlRegex = /https?:\/\/[^\s)\]]+/g;
        const urls = rawContent.match(urlRegex) || [];
        
        // Extract citations with basic title extraction
        const citations = urls.map((url, index) => {
            // Try to find title near the URL (look for text before the URL)
            const urlIndex = rawContent.indexOf(url);
            const beforeText = rawContent.substring(Math.max(0, urlIndex - 100), urlIndex);
            const titleMatch = beforeText.match(/([A-Z][^.!?]*[.!?]?)$/);
            
            return {
                url: url.replace(/[\)\]\.,;]+$/, ''), // Remove trailing punctuation
                title: titleMatch ? titleMatch[1].trim() : `Source ${index + 1}`,
                text: ''
            };
        });
        
        console.log(`✅ [Gemini Search] Response received (${rawContent.length} chars, ${citations.length} citations)`);
        
        return {
            content: rawContent,
            citations
        };
    } catch (error: any) {
        console.error('❌ [Gemini Search API] Error:', error.message);
        throw error;
    }
}

// ========================
// GEMINI AI WRAPPER (General Analysis - No Search)
// ========================

interface GeminiAIOptions<T = string> {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    parser?: (content: string) => T;
}

export async function callGeminiAPI<T = string>(
    prompt: string,
    options: GeminiAIOptions<T> = {}
): Promise<T> {
    const {
        model = 'gemini-2.5-flash',
        temperature = 0.2,
        maxTokens = 30000,
        parser
    } = options;

    try {
        const genModel = gemini.getGenerativeModel({ model });

        const result = await genModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            },
        });

        const rawContent = result.response.text();
        const content = parser ? parser(rawContent) : rawContent as T;
        
        console.log(`✅ [Gemini AI] Response received (${rawContent.length} chars)`);
        
        return content;
    } catch (error: any) {
        console.error('❌ [Gemini AI] Error:', error.message);
        throw error;
    }
}

// ========================
// GEMINI PDF ANALYSIS (For Transcripts)
// ========================

interface GeminiPDFOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

/**
 * Analyze PDF directly with Gemini 2.5 Flash
 * Uses native PDF reading - no extraction needed
 * Perfect for earnings call transcripts - eliminates OCR data mismatches
 */
export async function callGeminiWithPDF(
    pdfUrl: string,
    prompt: string,
    options: GeminiPDFOptions = {}
): Promise<string> {
    const {
        model = 'gemini-2.5-flash',
        temperature = 0.2,
        maxTokens = 30000,
    } = options;

    try {
        console.log(`📄 [Gemini PDF] Downloading PDF from ${pdfUrl.substring(0, 80)}...`);
        
        // Download PDF
        const pdfResponse = await fetch(pdfUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        if (!pdfResponse.ok) {
            throw new Error(`Failed to download PDF: HTTP ${pdfResponse.status}`);
        }

        const arrayBuffer = await pdfResponse.arrayBuffer();
        const base64Pdf = Buffer.from(arrayBuffer).toString('base64');
        const fileSizeMB = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(2);
        
        console.log(`✅ [Gemini PDF] Downloaded ${fileSizeMB} MB`);
        console.log(`🤖 [Gemini PDF] Analyzing with ${model}...`);

        // Create model instance
        const genModel = gemini.getGenerativeModel({ model });

        // Send PDF with prompt using inline data
        const result = await genModel.generateContent([
            { text: prompt },
            {
                inlineData: {
                    data: base64Pdf,
                    mimeType: 'application/pdf'
                }
            }
        ]);

        const content = result.response.text();
        
        console.log(`✅ [Gemini PDF] Analysis complete (${content.length} chars)`);
        
        return content;
        
    } catch (error: any) {
        console.error('❌ [Gemini PDF] Error:', error.message);
        throw new Error(`Failed to analyze PDF: ${error.message}`);
    }
}



