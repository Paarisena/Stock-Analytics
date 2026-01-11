/**
 * AI Provider Wrappers
 * Abstracts API calls to Perplexity, Groq, and other AI services
 */

import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize and export clients
export const perplexity = new OpenAI({
    apiKey: process.env.PERPLEXITY_API || '',
    baseURL: 'https://api.perplexity.ai',
});

export const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || '',
});

export const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ========================
// PERPLEXITY API WRAPPER
// ========================

interface PerplexityOptions<T = string> {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    parser?: (content: string) => T;
}

interface PerplexityResult<T = string> {
    content: T;
    tokensUsed?: number;
    citations?: any[];
}

export async function callPerplexityAPI<T = string>(
    prompt: string,
    options: PerplexityOptions<T> = {}
): Promise<PerplexityResult<T>> {
    const {
        model = 'sonar',
        temperature = 0.3,
        maxTokens = 2500,
        parser
    } = options;

    try {
        const completion = await perplexity.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: maxTokens
        });

        const rawContent = completion.choices[0]?.message?.content || '';
        const content = parser ? parser(rawContent) : rawContent as T;
        
        console.log(`✅ [Perplexity] Response received (${rawContent.length} chars)`);

        return {
            content,
            tokensUsed: (completion.usage?.total_tokens || 0)
        };
    } catch (error: any) {
        console.error('❌ [Perplexity API] Error:', error.message);
        throw error;
    }
}

// ========================
// GROQ API WRAPPER
// ========================

interface GroqOptions<T = string> {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    parser?: (content: string) => T;
}

export async function callGroqAPI<T = string>(
    prompt: string,
    options: GroqOptions<T> = {}
): Promise<T> {
    const {
        model = 'llama-3.3-70b-versatile',
        temperature = 0.2,
        maxTokens = 2000,
        parser
    } = options;

    try {
        const completion = await groq.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: maxTokens
        });

        const rawContent = completion.choices[0]?.message?.content || '';
        const content = parser ? parser(rawContent) : rawContent as T;
        
        console.log(`✅ [Groq] Response received (${rawContent.length} chars)`);
        
        return content;
    } catch (error: any) {
        console.error('❌ [Groq API] Error:', error.message);
        throw error;
    }
}

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
        maxTokens = 10000,
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
        maxTokens = 10000,
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
// BATCH PERPLEXITY CALL
// ========================

interface BatchPerplexityResult {
    transcript: string;
    annualReport: string;
    quarter?: string;
}

export async function callPerplexityBatch(
    symbol: string,
    prompt: string
): Promise<BatchPerplexityResult | null> {
    try {
        console.log(`📦 [Perplexity Batch] Fetching data for ${symbol}...`);
        
        const result = await callPerplexityAPI(prompt, { maxTokens: 2500 });
        const content = result.content;

        // Split response into sections
        const transcriptSection = content.match(/===\s*EARNINGS TRANSCRIPT\s*===([\s\S]*?)===\s*ANNUAL REPORT\s*===/)?.[1] || content;
        const annualSection = content.match(/===\s*ANNUAL REPORT\s*===([\s\S]*?)$/)?.[1] || '';

        // Extract quarter for cache invalidation
        const quarterMatch = transcriptSection.match(/QUARTER:\s*(.+)/);
        const quarter = quarterMatch ? quarterMatch[1].trim() : 'Latest';

        console.log(`✅ [Perplexity Batch] Data fetched - SAVED 50% COST ($0.005 instead of $0.010)!`);

        return {
            transcript: transcriptSection.trim(),
            annualReport: annualSection.trim(),
            quarter
        };
    } catch (error) {
        console.error('❌ [Perplexity Batch] Error:', error);
        return null;
    }
}
