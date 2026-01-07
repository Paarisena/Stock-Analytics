import { NextRequest, NextResponse } from 'next/server';
import * as TOML from '@iarna/toml';
import * as fs from 'fs';
import * as path from 'path';
import { fetchAnnualReportFromPDF, fetchScreenerAnnualReport } from '../../utils/screenerScraper';
import { normalizeFiscalYear, getLatestFiscalYear } from '../../utils/fiscalYearMapper';

// Import AI functions from existing route
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Cache directory
const CACHE_DIR = path.join(process.cwd(), '.cache', 'deep-analysis');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Helper: Call Gemini Search
async function callGeminiSearch(prompt: string): Promise<string | null> {
    if (!GEMINI_API_KEY) return null;
    
    try {
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + GEMINI_API_KEY,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 8000
                    }
                })
            }
        );
        
        const data = await response.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        console.error('Gemini API error:', error);
        return null;
    }
}

// Helper: Call Groq API
async function callGroqAPI(prompt: string): Promise<string | null> {
    if (!GROQ_API_KEY) return null;
    
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 4000
            })
        });
        
        const data = await response.json();
        return data?.choices?.[0]?.message?.content || null;
    } catch (error) {
        console.error('Groq API error:', error);
        return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        const { symbol, fiscalYear: rawFiscalYear, forceRefresh } = await request.json();
        
        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        }
        
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        const fiscalYear = rawFiscalYear ? normalizeFiscalYear(rawFiscalYear) : getLatestFiscalYear();
        const cacheFile = path.join(CACHE_DIR, `${cleanSymbol}.json`);
        
        console.log(`🔍 [Deep Analysis] Request for ${cleanSymbol} ${fiscalYear}${forceRefresh ? ' (force refresh)' : ''}`);
        
        // Check json cache (skip if forceRefresh)
        if (!forceRefresh && fs.existsSync(cacheFile)) {
            try {
                const jsonContent = fs.readFileSync(cacheFile, 'utf-8');
                const cached = JSON.parse(jsonContent) as any;
                
                if (cached.metadata?.fiscalYear === fiscalYear) {
                    console.log(`✅ [Cache Hit] Returning cached analysis for ${cleanSymbol} ${fiscalYear}`);
                    return NextResponse.json({
                        success: true,
                        fromCache: true,
                        data: cached
                    });
                } else {
                    console.log(`🔄 [Cache Miss] Fiscal year mismatch: cached=${cached.metadata?.fiscalYear}, requested=${fiscalYear}`);
                }
            } catch (parseError) {
                console.warn(`⚠️ Corrupted cache file, deleting: ${parseError}`);
                fs.unlinkSync(cacheFile);
            }
        } else if (forceRefresh) {
            console.log(`🔄 [Force Refresh] Bypassing JSON cache`);
        }
        
        console.log(`🆕 [Deep Analysis] Starting fresh analysis for ${cleanSymbol} ${fiscalYear}...`);
        
        // Data fetching: PDF -> Gemini Search (HTML scraping removed - PDF only)
        let rawContent: string = '';
        let dataSource = 'Unknown';
        let pdfUrl: string | undefined;
        
        // Step 1: Try PDF from BSE India
        console.log(`📄 [Step 1] Attempting PDF extraction from BSE India...`);
        const pdfReport = await fetchAnnualReportFromPDF(symbol, fiscalYear, forceRefresh);
        
        if (pdfReport && pdfReport.content.length > 30000) {
            console.log(`✅ [BSE PDF] Retrieved ${pdfReport.content.length.toLocaleString()} characters`);
            rawContent = pdfReport.content.substring(0, 80000); // Use first 80k chars (exec summary, financials, strategy)
            dataSource = pdfReport.source;
            pdfUrl = pdfReport.url;
        } else {
            console.log(`⚠️ [BSE PDF] Insufficient data (${pdfReport?.content.length || 0} chars), falling back to Gemini Search...`);
            
            // Step 2: Last resort - Gemini Search (skipping HTML scraping)
            console.log(`🔍 [Step 2] Falling back to Gemini Search...`);
                const searchPrompt = `Extract COMPREHENSIVE ${cleanSymbol} ${fiscalYear} annual report with maximum detail. 

Search all these sources:
1. BSE India annual report section
2. NSE India corporate filings
3. Company investor relations website
4. MoneyControl annual reports
5. Screener.in financial statements

Provide 4 COMPREHENSIVE sections with MINIMUM 400 words each:

1. **Business Model**: How company makes money - revenue streams, customer segments, key products/services, value proposition (350+ words)
2. **Current Year Plans**: What company is going to do this year - new projects, expansions, product launches, strategic initiatives with timelines (350+ words)
3. "balance_sheet_brief": "Extract ACTUAL numbers from  Consolidated balance sheet, Consolidated statement of profit and loss, Consolidated Statement of changes in equity, Summary of Consolidated Income Statement(This heading is common in all balance sheet check the heading). Format: Consider these sub heading in consolidated balace sheet comparison of  Total non-current assets, total current assets, total assets, total current liablities, total equity and liablities, total income, total expenses, profit before tax, total tax expenses, profit of the year. Minimum 350 words.",
4. **Remuneration Analysis**: Executive compensation breakdown - CEO, MD, CFO, and top management salaries with total amounts in ₹ crore. Calculate % of profit. RED FLAG if >5% of net profit goes to top 5 executives (400+ words)

CRITICAL: Extract ACTUAL data from the report, not generic statements. Include specific numbers, percentages, amounts in ₹ crores, growth rates, and timelines. Aim for 2000+ total words across all 4 sections.`;

                const geminiResult = await callGeminiSearch(searchPrompt);
                
                if (!geminiResult || geminiResult.length < 1000) {
                    throw new Error(`All data sources failed - no content available for ${cleanSymbol} ${fiscalYear}`);
                }
                
                rawContent = geminiResult;
                dataSource = 'Gemini Search (Fallback)';
                console.log(`✅ [Gemini Search] Retrieved ${rawContent.length.toLocaleString()} characters`);
        }
        
        console.log(`📋 [Data Source] Using: ${dataSource}`);

        // Timeout wrapper
        const timeoutPromise = new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('Analysis timeout after 90 seconds')), 90000)
        );
        
        const analysisPromise = (async () => {
            // Parse with Gemini into 4 structured sections (Gemini has 8000 token output, better than Groq's 4000)
            console.log(`🤖 [Gemini] Parsing into structured sections...`);
            
            const parsePrompt = `Parse this annual report content into structured JSON with 4 sections. Extract REAL data, not placeholders.

Content:
${rawContent}

Return ONLY valid JSON in this exact format with ACTUAL extracted content (minimum 300 words per section):
{
  "business_model": "Detailed explanation of how company makes money. Break down revenue streams with percentages (e.g., Product Sales: 60%, Services: 30%, Licensing: 10%). Describe customer segments (B2B vs B2C split), distribution channels (direct sales, e-commerce, distributors), key value propositions, and competitive advantages in business model. Include specific business units and their contribution to total revenue. Minimum 350 words.",
  "current_year_plans": "What company plans to do THIS FISCAL YEAR. List specific projects with names, timelines, and budgets. Include: 1) New product launches with dates, 2) Facility expansions with locations and ₹ crore investments, 3) Market entry plans, 4) Technology initiatives, 5) Acquisition targets if mentioned, 6) Revenue/profit guidance for current FY. Extract from Chairman's letter, MD&A section, and forward-looking statements. Be very specific with numbers and dates. Minimum 400 words.",
  "balance_sheet_brief": "Extract ACTUAL numbers from  Consolidated balance sheet, Consolidated statement of profit and loss, Consolidated Statement of changes in equity, Summary of Consolidated 
Income Statement(This heading is common in all balance sheet check the heading). Format: Consider these sub heading in consolidated balace sheet Total non-current assets, total current assets, total assets, total current liablities, total equity and liablities, total income, total expenses, profit before tax, total tax expenses, profit of the year. Minimum 350 words.",
  "remuneration_analysis": "Extract from Remuneration Report / Directors Report section. List each top executive: CEO Name: ₹X.XX crore (Salary: ₹A, Bonus: ₹B, Stock Options: ₹C), MD Name: ₹Y.YY crore, CFO Name: ₹Z.ZZ crore, Executive Director 1: ₹P crore, Executive Director 2: ₹Q crore. Calculate TOTAL top 5 management compensation: ₹XYZ crore. Get Net Profit: ₹ABC crore. Calculate percentage: (Total Compensation / Net Profit) * 100 = D.D%. CRITICAL: If percentage > 5%, add in BOLD RED FLAG: '⚠️ RED FLAG: Top management taking E.E% of net profit - EXCESSIVE COMPENSATION! Total pay of ₹XYZ crore vs profit of ₹ABC crore indicates management priorities may not align with shareholders.' If <5%, state 'Compensation is reasonable at D.D% of net profit.' Include comparison with industry average if available. Minimum 450 words."
}

Do NOT use placeholder text. Extract ACTUAL data from the content provided.`;
            
            const geminiResponse = await callGeminiSearch(parsePrompt);
            
            if (!geminiResponse) {
                console.error('❌ [Gemini] Empty response');
                throw new Error('Gemini parsing failed - empty response');
            }
            
            console.log(`📝 [Gemini] Response length: ${geminiResponse.length} characters`);
            
            // Extract JSON(w: string)
            const jsonMatch = geminiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('❌ [Gemini] No JSON found in response:', geminiResponse.substring(0, 500));
                throw new Error('No valid JSON in Gemini response');
            }
            
            const sections = JSON.parse(jsonMatch[0]);
            const sectionKeys = Object.keys(sections);
            console.log(`🔑 [Gemini] Parsed ${sectionKeys.length} sections:`, sectionKeys);
            
            // Calculate metrics
            const sectionData = Object.keys(sections).map(key => {
                const content = typeof sections[key] === 'string' ? sections[key] : sections[key]?.content || '';
                const words = content.trim().split(/\s+/);
                const wordCount = words.filter((w: string) => w.length > 0).length;
                return {
                    id: key,
                    content: content,
                    wordCount: wordCount
                };
            });
            
            // Log each section's word count
            sectionData.forEach(s => {
                console.log(`  📄 ${s.id}: ${s.wordCount} words`);
            });
            
            const totalWords = sectionData.reduce((sum, s) => sum + s.wordCount, 0);
            const validSections = sectionData.filter(s => s.wordCount >= 150);
            const qualityScore = Math.min(100, Math.round((validSections.length / 4) * 100));
            
            console.log(`✅ [Analysis Complete] ${totalWords} words, ${validSections.length}/4 sections, quality: ${qualityScore}/100`);
            
            // Warn if quality is too low
            if (qualityScore < 50) {
                console.warn(`⚠️ [Quality Warning] Only ${validSections.length}/4 sections have sufficient content`);
            }
            
            return {
                sections: sectionData,
                totalWords,
                validSections: validSections.length,
                qualityScore
            };
        })();
        
        // Race between analysis and timeout
        const result = await Promise.race([analysisPromise, timeoutPromise]);
        
        if (!result) {
            return NextResponse.json({
                success: false,
                error: 'Analysis timed out after 90 seconds'
            }, { status: 408 });
        }
        
        // Build TOML structure
        const tomlData: any = {
            metadata: {
                symbol: cleanSymbol,
                fiscalYear: fiscalYear,
                analyzedAt: new Date().toISOString(),
                dataSource: dataSource,
                pdfUrl: pdfUrl,
                totalWords: result.totalWords,
                validSections: result.validSections,
                qualityScore: result.qualityScore,
                isDeepAnalyzed: true
            },
            sections: {}
        };
        
        // Add sections
        result.sections.forEach(section => {
            tomlData.sections[section.id] = {
                content: section.content,
                wordCount: section.wordCount
            };
        });
        
        // Save to JSON cache
        const jsonString = JSON.stringify(tomlData, null, 2);
        fs.writeFileSync(cacheFile, jsonString, 'utf-8');
        
        console.log(`💾 [Cache] Saved deep analysis to ${cacheFile}`);
        
        return NextResponse.json({
            success: true,
            fromCache: false,
            data: tomlData
        });
        
    } catch (error: any) {
        console.error('❌ [Deep Analysis Error]:', error.message);
        
        if (error.message.includes('timeout')) {
            return NextResponse.json({
                success: false,
                error: 'Limited data available - analysis incomplete',
                message: '⏳ Analysis took longer than expected. Please try again.'
            }, { status: 408 });
        }
        
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
