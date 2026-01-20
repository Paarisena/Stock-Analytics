import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/DB/MongoDB";
import {AnnualReportCache,QuarterlyReportCache} from "@/DB/Model";
import OpenAI from "openai";

import Groq from "groq-sdk";
import { CacheManager } from '@/app/utils/cache';
import { gemini,  callGeminiAPI } from '@/app/utils/aiProviders';
import { 
    parseKeyValueText, 
    parseValue, 
    parseFloat as parseFloatUtil, 
    extractJSON, 
    cleanAIText,
    parseListSection,
    parseSegments,
    parseDate,
    parseQuarter,
    parseSentiment,
    categorizeRisks,
    type ParsedSegment,
    type CategorizedRisks
} from '@/app/utils/textParsing';

// ? GROQ CLIENT (imported from utils/aiProviders.ts)
// ? PERPLEXITY CLIENT (imported from utils/aiProviders.ts)
// ? GEMINI CLIENT (imported from utils/aiProviders.ts)

// ? OPENAI CLIENT (Fallback for Groq)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// ========================
// GEMINI JSON MODE HELPER
// ========================

/**
 * Call Gemini with Google Search grounding (TEXT mode) - LEGACY FUNCTION
 * Returns raw text that will be parsed by Groq (same flow as Perplexity)
 * FREE tier: 15 requests/min, 1M token context
 * Note: Cannot use JSON mode with Search grounding - API limitation
 * 
 * @deprecated Use callGeminiSearch from aiProviders.ts instead
 */
async function callGeminiSearchRaw(prompt: string): Promise<string | null> {
  try {
    const model = gemini.getGenerativeModel({
      model: 'Gemini 2.5 Flash Image',
      tools: [{ googleSearch: {} } as any], // Enable Google Search grounding (using type assertion for experimental API)
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    console.log(`? [Gemini Search] Got ${text.length} chars of data (FREE)`);
    return text;
  } catch (error: any) {
    console.error(`? [Gemini Search] Failed:`, error.message);
    return null;
  }
}

// ========================
// PREDICTION CACHE SYSTEM
// ========================
interface PredictionData {
  data: any;
  previousPrediction?: any;
}

const predictionCache = new CacheManager<PredictionData>('Prediction');
// COST OPTIMIZATION: Different cache durations for different data types
const CACHE_DURATION_PRICE = 5 * 60 * 1000; // 5 minutes for price data (Yahoo - free)
const CACHE_DURATION_AI = 24 * 60 * 60 * 1000; // 24 HOURS for AI analysis (100% FREE with Groq, but STABILITY for long-term investors)
const CACHE_DURATION_FUNDAMENTALS = 24 * 60 * 60 * 1000; // 24 hours for fundamentals (changes slowly)
const CACHE_DURATION_TRANSCRIPT = 90 * 24 * 60 * 60 * 1000; // 90 DAYS for quarterly transcripts (smart invalidation on new earnings)
const CACHE_DURATION_ANNUAL_REPORT = 6 * 30 * 24 * 60 * 60 * 1000; // 6 MONTHS for annual reports (updated yearly)
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes default (for backward compatibility)

// Transcript Cache with metadata (using CacheManager utility)
const transcriptCache = new CacheManager<any>('Transcript');

// Annual Report Cache (using CacheManager utility)
const annualReportCache = new CacheManager<any>('Annual Report');

// Batch Data Cache (transcript + annual report combined) - 90 days
const batchDataCache = new CacheManager<{
    annualReportInsights: any; transcript: string; annualReport: string; quarter: string 
}>('Batch Data');

// Perplexity Search Cache (24 hours) - Prevents duplicate searches
const perplexitySearchCache = new CacheManager<{ content: string; citations: any[]; tokensUsed: number; cost: number }>('Perplexity Search');
const CACHE_DURATION_SEARCH = 24 * 60 * 60 * 1000; // 24 hours for search results

function getCachedPrediction(symbol: string, dataType: 'full' | 'price' | 'ai' = 'full') {
  // Select appropriate cache duration based on data type
  let cacheDuration: number;
  switch (dataType) {
    case 'price':
      cacheDuration = CACHE_DURATION_PRICE; // 5 minutes (free Yahoo data)
      break;
    case 'ai':
      cacheDuration = CACHE_DURATION_AI; // 4 hours (expensive Perplexity)
      break;
    default:
      cacheDuration = CACHE_DURATION; // 15 minutes (default)
  }
  
  const cached = predictionCache.get(symbol, cacheDuration);
  if (!cached) return null;
  
  // Don't use cache if S/R data is invalid (all zeros)
  if (cached.data.data.supportResistance && cached.data.data.supportResistance.pivot === 0) {
    console.log(`?? [Cache] Cached data has invalid S/R, refetching...`);
    return null;
  }
  const ageSeconds = Math.round((Date.now() - cached.timestamp) / 1000);
  const ageMinutes = Math.round(ageSeconds / 60);
  console.log(`?? [Cache:${dataType}] Using cached prediction for ${symbol} (${ageMinutes}m ${ageSeconds % 60}s old)`);
  return {
    data: cached.data.data,
    timestamp: cached.timestamp,
    previousPrediction: cached.data.previousPrediction
  };
}

function setCachedPrediction(symbol: string, data: any, previous?: any) {
  predictionCache.set(symbol, {
    data,
    previousPrediction: previous
  });
  console.log(`?? [Cache] Stored prediction for ${symbol}`);
}

// ========================
// MCP TOOL: INDIAN STOCKS - NSE API
// ========================

async function mcpGetIndianFundamentals(symbol: string, skipAI: boolean = false) {
    try {
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        console.log(`?? [Indian Fundamentals] Fetching for ${cleanSymbol}...`);
        
        let fundamentals: any = {
            symbol: cleanSymbol,
            marketCap: null,
            peRatio: null,
            roe: null,
            roa: null,
            roce: null,
            operatingMargin: null,
            profitMargin: null,
            debtToEquity: null,
            totalDebt: null,
            operatingCashFlow: null,
            freeCashFlow: null,
            revenue: null,
            netProfit: null,
            eps: null,
            revenueGrowth: null,
            source: 'Unknown'
        };
        
        // ============================================
        // PHASE 1: TRY SCREENER.IN AUTHENTICATED (BEST - Your Login)
        // ============================================
        if (process.env.SCREENER_EMAIL && process.env.SCREENER_PASSWORD) {
            console.log(`?? [Screener.in] Attempting direct fetch with your account...`);
            
            try {
                const { fetchScreenerFundamentals } = await import('../../utils/screenerScraper');
                const screenerData = await fetchScreenerFundamentals(cleanSymbol);
                
                
                
                if (screenerData && screenerData.peRatio) {
                    console.log(`? [Screener.in] Got fundamentals from authenticated account (HIGHEST QUALITY)`);
                    console.log(`?? [Sample] PE=${screenerData.peRatio}, ROE=${screenerData.roe}, D/E=${screenerData.debtToEquity}, OPM=${screenerData.operatingMargin}`);
                    
                    // Convert crores to actual numbers (1 crore = 10 million) - preserve all new fields
                    fundamentals = {
                        symbol: cleanSymbol,
                        // Valuation metrics
                        marketCap: screenerData.marketCap ? screenerData.marketCap * 10000000 : null,
                        peRatio: screenerData.peRatio,
                        pegRatio: screenerData.pegRatio,
                        priceToBook: screenerData.priceToBook,
                        dividendYield: screenerData.dividendYield,
                        bookValue: screenerData.bookValue,
                        faceValue: screenerData.faceValue,
                        // Profitability metrics
                        roe: screenerData.roe,
                        roa: screenerData.roa,
                        roce: screenerData.roce,
                        operatingMargin: screenerData.operatingMargin,
                        profitMargin: screenerData.profitMargin,
                        // Financial health
                        debtToEquity: screenerData.debtToEquity,
                        totalDebt: screenerData.totalDebt ? screenerData.totalDebt * 10000000 : null,
                        currentRatio: screenerData.currentRatio,
                        quickRatio: screenerData.quickRatio,
                        interestCoverage: screenerData.interestCoverage,
                        // Cash flow
                        operatingCashFlow: screenerData.operatingCashFlow ? screenerData.operatingCashFlow * 10000000 : null,
                        freeCashFlow: screenerData.freeCashFlow ? screenerData.freeCashFlow * 10000000 : null,
                        capex: screenerData.capex ? screenerData.capex * 10000000 : null,
                        // Income statement
                        revenue: screenerData.revenue ? screenerData.revenue * 10000000 : null,
                        netProfit: screenerData.netProfit ? screenerData.netProfit * 10000000 : null,
                        eps: screenerData.eps,
                        // Growth metrics
                        salesGrowth3Y: screenerData.salesGrowth3Y,
                        salesGrowth5Y: screenerData.salesGrowth5Y,
                        profitGrowth3Y: screenerData.profitGrowth3Y,
                        profitGrowth5Y: screenerData.profitGrowth5Y,
                        roe3Y: screenerData.roe3Y,
                        roe5Y: screenerData.roe5Y,
                        // Efficiency ratios
                        debtorDays: screenerData.debtorDays,
                        cashConversionCycle: screenerData.cashConversionCycle,
                        workingCapitalDays: screenerData.workingCapitalDays,
                        // Shareholding
                        promoterHolding: screenerData.promoterHolding,
                        fiiHolding: screenerData.fiiHolding,
                        diiHolding: screenerData.diiHolding,
                        pledgedPercentage: screenerData.pledgedPercentage,
                        revenueGrowth: null,
                        source: 'Screener.in Direct (Authenticated)'
                    };
                    
                    console.log(`?? [DEBUG] RAW Screener Data:`, screenerData);
                    console.log(`?? [DEBUG] Converted Fundamentals:`, fundamentals);
                    console.log(`?? [DEBUG] Non-null fields: ${Object.entries(fundamentals).filter(([k,v]) => v !== null).map(([k]) => k).join(', ')}`);
                    return fundamentals;
                }
            } catch (screenerError: any) {
                console.log(`?? [Screener.in] Direct fetch failed: ${screenerError.message}`);
            }
        } else {
            console.log(`?? [Screener.in] No credentials found in .env (SCREENER_EMAIL, SCREENER_PASSWORD)`);
        }
        
        // ============================================
        // PHASE 2: MONEYCONTROL + SCREENER PUBLIC (Current Method)
        // ============================================
        console.log(`?? [MoneyControl] Attempting public scraping...`);
        
        try {
            const mcUrl = `https://www.moneycontrol.com/india/stockpricequote/${cleanSymbol}`;
            const mcResponse = await fetch(mcUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (mcResponse.ok) {
                const mcHtml = await mcResponse.text();
                const { load } = await import('cheerio');
                const $ = load(mcHtml);
                
                // Extract PE, Market Cap, etc.
                fundamentals.peRatio = parseFloat($('div:contains("P/E Ratio")').next().text()) || null;
                fundamentals.debtToEquity = parseFloat($('div:contains("Debt to Equity")').next().text()) || null;
                fundamentals.roe = parseFloat($('div:contains("ROE")').next().text().replace('%', '')) / 100 || null;
                
                if (fundamentals.peRatio || fundamentals.debtToEquity) {
                    console.log(`? [MoneyControl] Got some fundamentals`);
                    fundamentals.source = 'MoneyControl Public Scraping';
                }
            }
        } catch (mcError: any) {
            console.log(`?? [MoneyControl] Scraping failed: ${mcError.message}`);
        }
        
        // Try Screener.in public (no auth) to supplement
        try {
            const screenerUrl = `https://www.screener.in/company/${cleanSymbol}/`;
            const screenerResponse = await fetch(screenerUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (screenerResponse.ok) {
                const screenerHtml = await screenerResponse.text();
                const { load } = await import('cheerio');
                const $ = load(screenerHtml);
                
                // Extract from top ratios section
                $('.top-ratios li').each((i, elem) => {
                    const text = $(elem).text();
                    if (text.includes('Market Cap')) {
                        const matchedValue = text.match(/[\d,.]+/)?.[0];
                        fundamentals.marketCap = matchedValue ? parseFloat(matchedValue.replace(',', '')) * 10000000 : null;
                    }
                    if (text.includes('P/E') && !fundamentals.peRatio) {
                        fundamentals.peRatio = parseFloat(text.match(/[\d.]+/)?.[0] || '0') || null;
                    }
                    if (text.includes('ROE') && !fundamentals.roe) {
                        fundamentals.roe = parseFloat(text.match(/[\d.]+/)?.[0] || '0') / 100 || null;
                    }
                });
                
                if (fundamentals.marketCap || fundamentals.peRatio) {
                    console.log(`? [Screener.in Public] Supplemented with additional data`);
                    fundamentals.source = fundamentals.source === 'MoneyControl Public Scraping' 
                        ? 'MoneyControl + Screener.in Public' 
                        : 'Screener.in Public';
                }
            }
        } catch (screenerError: any) {
            console.log(`?? [Screener.in Public] Failed: ${screenerError.message}`);
        }
        
        // ============================================
        // PHASE 3: NSE API (Supplementary)
        // ============================================
        console.log(`?? [NSE API] Attempting official API...`);
        
        try {
            const nseUrl = `https://www.nseindia.com/api/quote-equity?symbol=${cleanSymbol}`;
            const nseResponse = await fetch(nseUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.nseindia.com/'
                }
            });
            
            if (nseResponse.ok) {
                const nseData = await nseResponse.json();
                
                // NSE provides limited fundamental data
                if (nseData.priceInfo && !fundamentals.marketCap) {
                    fundamentals.marketCap = nseData.priceInfo.marketCap || null;
                }
                if (nseData.metadata?.pdSymbolPe && !fundamentals.peRatio) {
                    fundamentals.peRatio = parseFloat(nseData.metadata.pdSymbolPe) || null;
                }
                
                if (fundamentals.marketCap || fundamentals.peRatio) {
                    console.log(`? [NSE API] Supplemented with official exchange data`);
                    fundamentals.source = fundamentals.source !== 'Unknown' 
                        ? `${fundamentals.source} + NSE API` 
                        : 'NSE API';
                }
            }
        } catch (nseError: any) {
            console.log(`?? [NSE API] Failed: ${nseError.message}`);
        }
        
        // ============================================
        // FINAL CHECK - DO NOT USE AI FALLBACK
        // ============================================
        if (!fundamentals.peRatio && !fundamentals.roe && !fundamentals.debtToEquity) {
            console.warn(`?? [Indian Fundamentals] All sources failed for ${cleanSymbol}`);
            return null;
        }
        
        console.log(`? [Indian Fundamentals] Final data source: ${fundamentals.source}`);
        return fundamentals;
        
    } catch (error) {
        console.error('? [MCP Tool] Fundamentals fetch error:', error);
        return null;
    }
}

// ========================
// MCP TOOL: FUNDAMENTAL DATA (Alpha Vantage for US/Global)
// ========================

async function mcpGetFundamentals(symbol: string, skipAI: boolean = false) {
    try {
        console.log(`?? [MCP Tool] Fetching fundamentals for ${symbol}... ${skipAI ? '(skipAI - cached only)' : ''}`);
        
        // Check if it's an Indian stock
        if (symbol.includes('.NS') || symbol.includes('.BO')) {
            return await mcpGetIndianFundamentals(symbol, skipAI);
        }
        
        // ?? COST OPTIMIZATION: If skipAI=true, return cached data only
        if (skipAI) {
            const cached = getCachedPrediction(symbol, 'full');
            if (cached && cached.data?.fundamentals) {
                console.log(`?? [Cached] Returning cached fundamentals for ${symbol}`);
                return cached.data.fundamentals;
            }
            console.log(`?? [Cache Miss] No cached fundamentals for ${symbol}, skipping fetch`);
            return null;
        }
        
        // Check if it's an Indian stock (redundant check after skipAI logic)
        if (symbol.includes('.NS') || symbol.includes('.BO')) {
            return await mcpGetIndianFundamentals(symbol);
        }
        
        // Remove exchange suffix for Alpha Vantage
        const cleanSymbol = symbol.replace(/\.(NS|BO|T|L|TO|HK|SS|SZ|AX|SI|KS|KQ|DE|PA|AS|MI|US)$/, '');
        const apiKey = process.env.ALPHAVANTAGE_API;
        
        // Fetch Overview (P/E, PEG, Market Cap, etc.)
        const overviewResponse = await fetch(
            `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${cleanSymbol}&apikey=${apiKey}`
        );
        const overview = await overviewResponse.json();
        
        // Fetch Balance Sheet (Cash, Debt, etc.)
        const balanceSheetResponse = await fetch(
            `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=${cleanSymbol}&apikey=${apiKey}`
        );
        const balanceSheet = await balanceSheetResponse.json();
        
        // Fetch Cash Flow (CAPEX, Free Cash Flow)
        const cashFlowResponse = await fetch(
            `https://www.alphavantage.co/query?function=CASH_FLOW&symbol=${cleanSymbol}&apikey=${apiKey}`
        );
        const cashFlow = await cashFlowResponse.json();
        
        // Fetch Income Statement (Revenue, Operating Margin)
        const incomeResponse = await fetch(
            `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${cleanSymbol}&apikey=${apiKey}`
        );
        const income = await incomeResponse.json();
        
        // Extract latest data
        const latestBalance = balanceSheet.quarterlyReports?.[0];
        const latestCashFlow = cashFlow.quarterlyReports?.[0];
        const latestIncome = income.quarterlyReports?.[0];
        
        console.log(`? [MCP Tool] Fundamentals retrieved for ${cleanSymbol}`);
        
        return {
            // Valuation Metrics
            peRatio: parseFloat(overview.PERatio) || null,
            pegRatio: parseFloat(overview.PEGRatio) || null,
            priceToBook: parseFloat(overview.PriceToBookRatio) || null,
            marketCap: parseFloat(overview.MarketCapitalization) || null,
            
            // Financial Health
            cash: parseFloat(latestBalance?.cashAndCashEquivalentsAtCarryingValue) || null,
            totalDebt: parseFloat(latestBalance?.shortLongTermDebtTotal) || null,
            debtToEquity: parseFloat(overview.DebtToEquity) || null,
            
            // Profitability
            operatingMargin: parseFloat(overview.OperatingMarginTTM) || null,
            profitMargin: parseFloat(overview.ProfitMargin) || null,
            roe: parseFloat(overview.ReturnOnEquityTTM) || null,
            roa: parseFloat(overview.ReturnOnAssetsTTM) || null,
            
            // Cash Flow & CAPEX
            capex: Math.abs(parseFloat(latestCashFlow?.capitalExpenditures)) || null,
            freeCashFlow: parseFloat(latestCashFlow?.operatingCashflow) - Math.abs(parseFloat(latestCashFlow?.capitalExpenditures) || 0) || null,
            operatingCashFlow: parseFloat(latestCashFlow?.operatingCashflow) || null,
            
            // Revenue & Growth
            revenue: parseFloat(latestIncome?.totalRevenue) || null,
            revenueGrowth: parseFloat(overview.QuarterlyRevenueGrowthYOY) || null,
            earningsPerShare: parseFloat(overview.EPS) || null,
            
            // Additional
            beta: parseFloat(overview.Beta) || null,
            dividendYield: parseFloat(overview.DividendYield) || null,
            fiscalQuarter: latestIncome?.fiscalDateEnding || null,
        };
    } catch (error) {
        console.error('? [MCP Tool] Fundamentals fetch error:', error);
        return null;
    }
}

// ========================
// HELPER: EXTRACT QUARTERLY INSIGHTS (FOR SCREENER.IN)
// ========================
async function extractQuarterlyInsights(
    cleanSymbol: string,
    rawTranscript: string,
    quarter: string,
    fiscalYear?: string
): Promise<any> {
    console.log(`🔍 [AI Quarterly] Extracting insights for ${quarter}...`);
    
    // Parse the JSON data from table extraction
    let parsedData: any;
    try {
        parsedData = JSON.parse(rawTranscript);
    } catch (parseError) {
        console.error(`❌ [Quarterly] Failed to parse table data:`, parseError);
        return null;
    }
    
    // Calculate expense ratio for context
    const expenseRatio = parsedData.expenses.total > 0 
        ? ((parsedData.expenses.total / parsedData.keyMetrics.revenue.value) * 100).toFixed(2)
        : 'N/A';
    
    const interestCoverage = parsedData.expenses.interest > 0 
        ? (parsedData.keyMetrics.operatingProfit.value / parsedData.expenses.interest).toFixed(2)
        : 'N/A';
    
    const quarterlyPrompt = `You are analyzing CONSOLIDATED quarterly financial data from Screener.in for ${cleanSymbol}.

**CRITICAL CONTEXT:**
- Data Source: Screener.in Quarterly Results Table (CONSOLIDATED FIGURES ONLY)
- Latest Quarter: ${parsedData.quarter}
- Historical Period: ${parsedData.quarters.length} quarters (${parsedData.quarters[0]} to ${parsedData.quarters[parsedData.quarters.length - 1]})
- All values in ₹ Crores

**QUARTERLY PERFORMANCE SERIES:**
${parsedData.quarters.map((q: string, i: number) => 
  `${q}: Sales ₹${parsedData.historicalData.sales[i]}Cr | Net Profit ₹${parsedData.historicalData.netProfit[i]}Cr | OPM ${parsedData.historicalData.opm[i]}% | EPS ₹${parsedData.historicalData.eps[i]}`
).join('\n')}

**LATEST QUARTER HIGHLIGHTS (${parsedData.quarter}):**
- Revenue: ₹${parsedData.keyMetrics.revenue.value}Cr (YoY: ${parsedData.keyMetrics.revenue.yoyGrowth}%, QoQ: ${parsedData.keyMetrics.revenue.qoqGrowth}%)
- Net Profit: ₹${parsedData.keyMetrics.netProfit.value}Cr (YoY: ${parsedData.keyMetrics.netProfit.yoyGrowth}%, QoQ: ${parsedData.keyMetrics.netProfit.qoqGrowth}%)
- Operating Profit: ₹${parsedData.keyMetrics.operatingProfit.value}Cr (Margin: ${parsedData.financialRatios.operatingMargin}%)
- EPS: ₹${parsedData.keyMetrics.eps.value} (YoY: ${parsedData.keyMetrics.eps.yoyGrowth}%)
- Expense Ratio: ${expenseRatio}%
- Interest Coverage: ${interestCoverage}x

**ANALYSIS TASK:**
Analyze the ${parsedData.quarters.length}-quarter trend and provide actionable investment insights. Focus on:
1. Revenue momentum (accelerating/decelerating?)
2. Profitability trends (margins expanding/compressing?)
3. Operational efficiency (expense control, operating leverage)
4. Quarter-over-quarter consistency vs volatility
5. Seasonal patterns (if any)

**OUTPUT FORMAT (JSON only, no markdown):**
{
  "quarter": "${parsedData.quarter}",
  "keyMetrics": {
    "revenue": {
      "value": ${parsedData.keyMetrics.revenue.value},
      "yoyGrowth": ${parsedData.keyMetrics.revenue.yoyGrowth},
      "qoqGrowth": ${parsedData.keyMetrics.revenue.qoqGrowth},
      "unit": "Crores",
      "trend": "Accelerating|Stable|Decelerating",
      "analysis": "1-2 sentences: Compare last 2 quarters vs previous 2 quarters. Is momentum improving?"
    },
    "netProfit": {
      "value": ${parsedData.keyMetrics.netProfit.value},
      "yoyGrowth": ${parsedData.keyMetrics.netProfit.yoyGrowth},
      "qoqGrowth": ${parsedData.keyMetrics.netProfit.qoqGrowth},
      "unit": "Crores",
      "trend": "Improving|Stable|Declining",
      "analysis": "1-2 sentences: Is profit growing faster/slower than revenue? What does this mean?"
    },
    "operatingProfit": {
      "value": ${parsedData.keyMetrics.operatingProfit.value},
      "yoyGrowth": ${parsedData.keyMetrics.operatingProfit.yoyGrowth},
      "qoqGrowth": ${parsedData.keyMetrics.operatingProfit.qoqGrowth},
      "unit": "Crores"
    },
    "eps": {
      "value": ${parsedData.keyMetrics.eps.value},
      "yoyGrowth": ${parsedData.keyMetrics.eps.yoyGrowth},
      "qoqGrowth": ${parsedData.keyMetrics.eps.qoqGrowth}
    },
    "operatingMargin": ${parsedData.financialRatios.operatingMargin},
    "netMargin": ${parsedData.financialRatios.netMargin}
  },
  "managementCommentary": {
    "businessHighlights": [
      "Concrete data point: e.g., 'Revenue grew 15% YoY driven by...'",
      "Margin trend: e.g., 'OPM expanded from X% to Y% due to...'",
      "Efficiency gain: e.g., 'Expense-to-revenue ratio improved to X%'"
    ],
    "challenges": [
      "Only if evident from data: e.g., 'Net margin compressed to X% from Y%'",
      "Only if growth slowed: e.g., 'QoQ revenue growth decelerated to X% from Y%'"
    ],
    "opportunities": [
      "Based on positive trends: e.g., 'Consistent margin expansion suggests pricing power'",
      "Based on efficiency: e.g., 'Operating leverage visible - expenses growing slower than revenue'"
    ],
    "futureGuidance": [
      "Momentum-based: e.g., 'Strong YoY growth of X% suggests sustained demand'",
      "Seasonality-based: e.g., 'Q3 historically strong - expect similar pattern'"
    ]
  },
  "segmentPerformance": [
    {
      "segment": "Core Business",
      "revenue": null,
      "growth": "Describe overall revenue trend",
      "margin": ${parsedData.financialRatios.operatingMargin},
      "commentary": "Is operating leverage visible? Are expenses (₹${parsedData.expenses.total}Cr) growing slower than revenue?"
    }
  ],
  "financialRatios": {
    "operatingMargin": ${parsedData.financialRatios.operatingMargin},
    "netMargin": ${parsedData.financialRatios.netMargin},
    "expenseToRevenueRatio": ${expenseRatio},
    "interestCoverageRatio": ${interestCoverage},
    "taxRate": ${parsedData.financialRatios.taxRate || 'null'}
  },
  "cashFlow": {
    "operatingCashFlow": null,
    "freeCashFlow": null,
    "capex": null,
    "cashAndEquivalents": null,
    "analysis": "Comment on: (1) Interest expense trend (₹${parsedData.expenses.interest}Cr) - is debt burden manageable? (2) Depreciation (₹${parsedData.expenses.depreciation}Cr) - is this a high capex business?"
  },
  "outlook": {
    "sentiment": "Positive|Neutral|Negative",
    "confidenceLevel": "High|Medium|Low",
    "keyDrivers": [
      "Data-driven: e.g., 'YoY revenue CAGR of X% over last 4 quarters'",
      "Margin-based: e.g., 'OPM expansion from X% to Y% indicates operational efficiency'"
    ],
    "risks": [
      "Only if visible: e.g., 'Expenses growing at X% vs revenue growth of Y%'",
      "Only if declining: e.g., 'QoQ net profit declined X% suggesting margin pressure'"
    ],
    "seasonality": "Analyze ${parsedData.quarters.length} quarters: Is there a Q1/Q2/Q3/Q4 pattern? Which quarters historically stronger?",
    "nextQuarterExpectation": "Based on last 2 quarters momentum and historical seasonal pattern, what range of performance expected?"
  },
  "competitivePosition": {
    "marketShare": "Unknown",
    "competitiveAdvantages": [
      "Margin-based: e.g., 'Consistently high OPM of ${parsedData.financialRatios.operatingMargin}% suggests competitive moat'",
      "Growth-based: e.g., 'Revenue CAGR outpacing industry average'"
    ],
    "industryTrends": [
      "Infer from company trend: e.g., 'Accelerating revenue suggests strong sector demand'",
      "Infer from margins: e.g., 'Stable margins indicate rational competition'"
    ],
    "operatingLeverage": "Calculate: Expense growth rate vs Revenue growth rate over last 4 quarters. Positive leverage = expenses growing slower."
  },
  "historicalTrends": {
    "bestQuarter": "Which quarter had highest net profit? How much?",
    "worstQuarter": "Which quarter had lowest net profit? How much?",
    "peakToTrough": "Calculate % difference between best and worst quarters",
    "consistencyScore": "High (if volatility <15%) | Medium (15-30%) | Low (>30%)",
    "seasonalPattern": "Analyze Q1 vs Q2 vs Q3 vs Q4 average performance. Any clear pattern?"
  },
  "summary": "4-5 sentences covering: (1) Latest quarter vs historical average, (2) Margin trajectory (expanding/stable/compressing), (3) Growth momentum (accelerating/decelerating), (4) Key risk/opportunity, (5) Investment implication (bullish/neutral/bearish with specific reason)"
}

**STRICT RULES:**
1. Use ONLY the ${parsedData.quarters.length} quarters of data provided above
2. YoY = compare with quarter 4 positions back, QoQ = compare with immediate previous quarter
3. All growth calculations must cite specific numbers (e.g., "grew from ₹X to ₹Y")
4. If data point not available, use null (not "N/A" or "Unknown" in number fields)
5. Trend analysis must compare recent 2 quarters vs previous 2 quarters
6. Return ONLY valid JSON - no markdown wrappers, no backticks, no extra text
7. Focus on CONSOLIDATED data - this is the accurate company-wide performance
8. All analysis must be data-driven with specific percentages and values

Begin analysis now.`;

    try {
        const result = await callGeminiAPI(quarterlyPrompt, {
            temperature: 0.2,
            maxTokens: 15000
        });

        // ✅ FIX: Strip markdown code blocks before parsing
        let cleanedResult = result.trim();
        
        // Remove ```json or ``` wrappers
        if (cleanedResult.startsWith('```json')) {
            cleanedResult = cleanedResult.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
        } else if (cleanedResult.startsWith('```')) {
            cleanedResult = cleanedResult.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        
        console.log(`📝 [AI Quarterly] Cleaned response (first 200 chars):`, cleanedResult.substring(0, 200));

        const quarterlyInsights = JSON.parse(cleanedResult);
        console.log(`✅ [AI Quarterly] Extraction complete for ${quarter}`);
        console.log(`🔍 [DEBUG Quarterly] Keys extracted:`, Object.keys(quarterlyInsights || {}));
        console.log(`🔍 [DEBUG Quarterly] Has keyMetrics:`, !!quarterlyInsights?.keyMetrics);
        
        // Save to MongoDB
        try {
            await connectToDatabase();
            const extractedFiscalYear = fiscalYear || quarter.match(/FY(\d+)/)?.[1] || new Date().getFullYear().toString();
            
            await QuarterlyReportCache.findOneAndUpdate(
                { symbol: cleanSymbol, quarter: quarter, fiscalYear: extractedFiscalYear },
                {
                    $set: {
                        data: quarterlyInsights,
                        rawTranscript: rawTranscript,
                        source: 'Screener.in Consolidated Table',
                        fetchedAt: new Date(),
                        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                    }
                },
                { upsert: true }
            );
            console.log(`💾 [MongoDB Quarterly] Saved ${quarter} (90d TTL)`);
        } catch (dbSaveError: any) {
            console.warn(`⚠️ [MongoDB Quarterly] Save failed: ${dbSaveError.message}`);
        }
        
        return quarterlyInsights;
        
    } catch (extractError: any) {
        console.error(`❌ [AI Quarterly] Extraction failed:`, extractError.message);
        console.error(`   Stack:`, extractError.stack);
        return null;
    }
}

 // ========================
// HELPER: EXTRACT QUARTERLY INSIGHTS (Separate function to avoid token limit issues)
// ========================

async function mcpGetIndianComprehensiveData(
    symbol: string, 
    forceRefresh: boolean = false,
    forceRefreshQuarterly: boolean = false
) {
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
    
    try {
        // ============================================
        // PHASE 1: CHECK MONGODB CACHE FOR ANNUAL REPORT
        // ============================================
        let annualReportInsights = null;
        let annualFromCache = false;
        
        if (!forceRefresh) {
            await connectToDatabase();
            try { 
                const cachedReport = await AnnualReportCache.findOne({
                    symbol: cleanSymbol,
                    reportType: 'Consolidated',
                    expiresAt: { $gt: new Date() }
                }).sort({ fiscalYear: -1 }).limit(1);
                
                if (cachedReport) {
                    const ageInDays = Math.floor((Date.now() - cachedReport.fetchedAt.getTime()) / (1000 * 60 * 60 * 24));
                    console.log(`✅ [MongoDB Annual] Cache HIT for ${cleanSymbol} FY${cachedReport.fiscalYear} (${ageInDays}d old)`);
                    annualReportInsights = cachedReport.data;
                    annualFromCache = true;
                } else {
                    console.log(`❌ [MongoDB Annual] Cache MISS for ${cleanSymbol}`);
                }
            } catch (dbError: any) {
                console.warn(`⚠️ [MongoDB Annual] Cache check failed: ${dbError.message}`);
            }
        }
        
        // ============================================
        // PHASE 2: CHECK MONGODB CACHE FOR QUARTERLY REPORT
        // ============================================
        let quarterlyInsights = null;
        let quarterlyFromCache = false;
        let quarter = 'Unknown';
        let rawTranscript = '';
        
        if (!forceRefreshQuarterly) {
            await connectToDatabase();
            try {
                const cachedQuarterly = await QuarterlyReportCache.findOne({
                    symbol: cleanSymbol,
                    expiresAt: { $gt: new Date() }
                }).sort({ fiscalYear: -1, quarter: -1 }).limit(1);
                
                if (cachedQuarterly) {
                    const ageInDays = Math.floor((Date.now() - cachedQuarterly.fetchedAt.getTime()) / (1000 * 60 * 60 * 24));
                    console.log(`✅ [MongoDB Quarterly] Cache HIT for ${cleanSymbol} ${cachedQuarterly.quarter} (${ageInDays}d old)`);
                    quarterlyInsights = cachedQuarterly.data;
                    quarter = cachedQuarterly.quarter;
                    rawTranscript = cachedQuarterly.rawTranscript || '';
                    quarterlyFromCache = true;
                } else {
                    console.log(`❌ [MongoDB Quarterly] Cache MISS for ${cleanSymbol}`);
                }
            } catch (dbError: any) {
                console.warn(`⚠️ [MongoDB Quarterly] Cache check failed: ${dbError.message}`);
            }
        }
        
        // ============================================
        // PHASE 3: IF BOTH CACHED, RETURN EARLY
        // ============================================
        if (annualFromCache && quarterlyFromCache) {
            console.log(`💾 [MongoDB] Both annual + quarterly cached for ${cleanSymbol}`);
            return {
                transcript: rawTranscript,
                annualReport: '',
                annualReportInsights: annualReportInsights,
                quarterlyInsights: quarterlyInsights,
                fromCache: true,
                quarter: quarter,
                source: 'MongoDB Cache',
                cacheType: 'mongodb'
            };
        }
        
        // ============================================
        // PHASE 4: VERIFY CREDENTIALS & FETCH FRESH DATA
        // ============================================
        if (!process.env.SCREENER_EMAIL || !process.env.SCREENER_PASSWORD) {
            throw new Error('Screener.in credentials required');
        }
        
        console.log(`🔐 [Screener.in] Fetching fresh data for ${cleanSymbol}...`);
        
        const { fetchScreenerComprehensiveData } = await import('../../utils/screenerScraper');
        const screenerData = await fetchScreenerComprehensiveData(symbol);
        
        let annualReport = '';

        // ============================================
        // PHASE 5: PROCESS & EXTRACT QUARTERLY DATA (Screener.in)
        // ============================================
        if (!quarterlyFromCache && screenerData.transcript) {
            rawTranscript = screenerData.transcript.content;
            quarter = screenerData.transcript.quarter;
            
            console.log(`🔍 [Quarterly] Processing ${quarter} data from Screener.in...`);
            
            // Extract quarterly insights using AI
            quarterlyInsights = await extractQuarterlyInsights(
                cleanSymbol,
                rawTranscript,
                quarter,
                screenerData.transcript.fiscalYear
            );
            
            if (quarterlyInsights) {
                console.log(`✅ [Quarterly] Extracted insights for ${quarter}`);
            } else {
                console.warn(`⚠️ [Quarterly] Failed to extract insights for ${quarter}`);
            }
            
            // Add delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        // ============================================
        // PHASE 6: PROCESS & EXTRACT ANNUAL REPORT (if not cached)
        // ============================================
        if (!annualFromCache && screenerData.annualReport) {
             console.log(`⏳ [PHASE 6] Starting ANNUAL report extraction (sequential after quarterly)...`);
            annualReport = `FISCAL YEAR: ${screenerData.annualReport.fiscalYear}\nSOURCE: ${screenerData.annualReport.source}\nURL: ${screenerData.annualReport.url}\n\n${screenerData.annualReport.content}`;
            console.log(`✅ [Annual Report] FY${screenerData.annualReport.fiscalYear} (${screenerData.annualReport.content.length} chars)`);
            
            // Keep existing annual report AI extraction (lines 601-2116)
            if (annualReport && annualReport.length > 0) {
                console.log(`🔍 [AI Annual] Extracting insights...`);
            }
            
            try {
                const extractionPrompt = `⚠️⚠️⚠️ CRITICAL: READ AND EXTRACT FROM THE ACTUAL DOCUMENT BELOW ⚠️⚠️⚠️
Extract from Indian annual report:
${annualReport.substring(0, 2000000)}

⚠️ THE DOCUMENT TEXT ABOVE CONTAINS THE REAL DATA YOU MUST EXTRACT
⚠️ EXAMPLES IN INSTRUCTIONS BELOW ARE ONLY TO SHOW THE PATTERN
⚠️ DO NOT COPY EXAMPLE NUMBERS - EXTRACT FROM THE ACTUAL DOCUMENT ABOVE

CRITICAL INSTRUCTIONS FOR BALANCE SHEET EXTRACTION:

⚠️⚠️⚠️ UNDERSTANDING OCR TWO-COLUMN TABLE FORMAT ⚠️⚠️⚠️

The balance sheet in the document above has TWO COLUMNS showing current and previous year data.
OCR converts the table to plain text with this pattern:

HEADER FORMAT: "Particulars Note As at March 31, 2025  2024"
DATA FORMAT:   "Label [spaces] [Current Year Number] [spaces] [Previous Year Number]"

REAL EXAMPLE FROM INFOSYS BALANCE SHEET (showing the actual OCR format):
--------------------------------------
"Particulars Note As at March 31, 2025  2024"
"Total assets    1,24,936   1,14,950"
"Total equity    87,332   81,176"
"Total non-current liabilities    5,842   6,688"
"Total current liabilities    31,762   27,086"
--------------------------------------

HOW TO READ THE TWO COLUMNS:
1. First number (after label) = CURRENT year (2025) → 1,24,936 means 124936
2. Second number (after more spaces) = PREVIOUS year (2024) → 1,14,950 means 114950
3. BOTH numbers are ALWAYS present on the same line
4. Numbers may have Indian comma format: 1,24,936 → strip to 124936

EXTRACTION STEPS:
1. Find line "Total assets    1,24,936   1,14,950"
   → Extract: { "current": 124936, "previous": 114950 }
2. Find line "Total equity    87,332   81,176"
   → Extract: { "current": 87332, "previous": 81176 }
3. Find line "Total non-current liabilities    5,842   6,688"
   → Extract: { "current": 5842, "previous": 6688 }
4. Find line "Total current liabilities    31,762   27,086"
   → Extract: { "current": 31762, "previous": 27086 }

⚠️ CRITICAL: DO NOT SAY "previous year not available" - IT IS THERE IN THE SECOND NUMBER!
⚠️ Every balance sheet line has TWO numbers (current and previous)
⚠️ Look for multiple spaces between the two numbers
⚠️ Extract BOTH numbers for every financial metric

GO BACK TO THE DOCUMENT TEXT ABOVE AND FIND THESE LINES WITH TWO NUMBERS!

STEP-BY-STEP EXTRACTION FROM THE ACTUAL DOCUMENT ABOVE:
1. Search in the document for line containing "Total assets"
   - You will find TWO numbers: current year and previous year
   - Example: "Total assets    1,24,936   1,14,950" → current: 124936, previous: 114950
2. Search for line containing "Total equity"
   - Extract BOTH numbers from the line
   - Example: "Total equity    87,332   81,176" → current: 87332, previous: 81176
3. Search for line "Total non-current liabilities"
   - Extract BOTH numbers
4. Search for line "Total current liabilities"
   - Extract BOTH numbers
5. Strip ALL commas from numbers: "1,24,936" → 124936
6. Pattern on each line: [Label] [multiple spaces] [Current] [multiple spaces] [Previous]

⚠️ READ THE ACTUAL DOCUMENT TEXT PROVIDED AT THE TOP - FIND LINES WITH TWO NUMBERS!

CRITICAL EXTRACTION RULES FOR THE ACTUAL DOCUMENT ABOVE:
1. Look for "as at 31 March, 2025" or "as at March 31, 2025" - this is the ANNUAL balance sheet
2. DO NOT extract from "Quarter ended" sections (quarterly data has smaller numbers)
3. PREFER "Consolidated Balance Sheet" or "income statement"
4. Find "Consolidated Balance Sheet" or "income statement" heading IN THE DOCUMENT
5. Annual balance sheet has LARGE numbers (5-6 digits in lakhs: 621,532 or crores: 6,215.32)
6. Extract the unit from table header: "₹ lacs", "₹ Lakhs", "₹ Crore", "₹ Million", "Mn" 
   ALSO look for: "Indian Rupees Million", "Indian Rupees Lakhs", "(All amounts are in Indian Rupees Million)"
7. ⚠️⚠️⚠️ MANDATORY CONVERSION - DO NOT SKIP ⚠️⚠️⚠️
   BEFORE storing ANY number in the JSON, YOU MUST CONVERT TO CRORES:
   - If already "Lakhs" or "Lacs": keep as is
   - If already "Million" or "Mn": keep as is
   - If already in "Crores": keep as is
   - Store  values in "current" and "previous" fields


8. Verify: Total Assets = Total Equity + Total Liabilities

⚠️ REMINDER: GO BACK TO THE DOCUMENT TEXT AT THE TOP AND EXTRACT FROM THERE!

Extract the following from THE ACTUAL DOCUMENT ABOVE:

1. BUSINESS MODEL (minimum 400 words):
   - Extract from "Management Discussion and Analysis" or "Directors' Report" section
   - How does the company generate revenue? What are primary revenue streams?
   - Business segments and their contribution
   - Competitive advantages and market position
   - Key products/services and their monetization

2. FUTURE STRATEGY (minimum 400 words):
   - Extract from "Future Outlook" or "Strategic Initiatives" section in the document
   - Strategic initiatives and expansion plans
   - Capex plans with amounts and timelines
   - New product launches or market entries
   - Digital transformation or innovation initiatives
   - M&A strategy or partnerships

3. ANNUAL BALANCE SHEET EXTRACTION FROM THE DOCUMENT ABOVE (minimum 400 words):
   
   ⚠️⚠️⚠️ CRITICAL FIRST STEP: FIND THE CORRECT "Balance Sheet" SECTION ⚠️⚠️⚠️
   
   IMPORTANT: The document has MULTIPLE financial tables. You MUST find the RIGHT one!
   
   3. ANNUAL BALANCE SHEET EXTRACTION FROM THE DOCUMENT ABOVE (minimum 400 words):
   
   ⚠️⚠️⚠️ MANDATORY: ONLY EXTRACT CONSOLIDATED - ABSOLUTELY REJECT STANDALONE ⚠️⚠️⚠️
   
   🚫 CRITICAL REJECTION RULES - APPLY BEFORE ANY EXTRACTION:
   
   ❌❌❌ IMMEDIATELY REJECT AND SKIP - DO NOT EXTRACT FROM:
   1. ANY heading containing "Standalone Balance Sheet"
   2. ANY heading containing "Standalone Financial Statements"
   3. ANY heading containing "Standalone" anywhere in the title
   4. Balance sheets typically found in pages 50-150 (Standalone usually appears first)
   
   ✅✅✅ ONLY EXTRACT FROM - MANDATORY REQUIREMENT:
   1. Heading MUST say "Consolidated Balance Sheet" (verify word "Consolidated" is present)
   2. OR heading says "Consolidated Financial Statements"
   3. Usually appears AFTER page 150 in annual reports (Consolidated comes second)
   4. The word "Consolidated" MUST be explicitly visible in the section heading
   
   🔍 MANDATORY SEARCH STRATEGY:
   Step 1: Search the entire document for "Consolidated Balance Sheet" text
   Step 2: If you encounter "Standalone Balance Sheet" FIRST (it usually appears before Consolidated):
          → ❌ IGNORE IT COMPLETELY - DO NOT EXTRACT ANYTHING
          → ⏩ Continue searching below for "Consolidated Balance Sheet"
          → ❌ DO NOT use Standalone as fallback under any circumstance
   Step 3: Only when you find heading that says "Consolidated Balance Sheet":
          → ✅ Verify the exact word "Consolidated" appears in the heading
          → ✅ Confirm it's NOT "Standalone Balance Sheet"
          → ✅ Then and only then proceed with extraction
   
   WHY CONSOLIDATED IS MANDATORY:
   - Indian annual reports contain BOTH Standalone AND Consolidated statements
   - Standalone = Parent company only (excludes subsidiaries - incomplete data)
   - Consolidated = Parent + ALL subsidiaries (complete group picture)
   - Investors MUST see Consolidated to understand the FULL business
   - Extracting Standalone provides misleading/incomplete financial picture
   - Stock valuations are based on Consolidated numbers, not Standalone
   
   ⚠️ FINAL VERIFICATION BEFORE ANY EXTRACTION:
   Before extracting a single number, YOU MUST confirm:
   ✅ The section heading contains the exact word "Consolidated"
   ✅ It is NOT "Standalone Balance Sheet" or "Standalone Financial Statements"
   ✅ The heading explicitly says "Consolidated Balance Sheet"
   
   IF YOU CANNOT FIND "Consolidated Balance Sheet":
   → ❌ DO NOT extract from Standalone as fallback
   → ❌ DO NOT guess or calculate
   → Return error: "Consolidated Balance Sheet section not found in document"
   → Set all balanceSheet values to null
   → Continue with other extractions (business model, strategy, etc.)
   
   ⚠️⚠️⚠️ NOW SEARCH FOR THE CORRECT "Consolidated Balance Sheet" SECTION ⚠️⚠️⚠️
   
   IMPORTANT: The document has MULTIPLE financial tables. You MUST find the RIGHT one!
   
   TEXTUAL LANDMARKS TO FIND CORRECT CONSOLIDATED SECTION:
   
   1️⃣ SKIP these wrong sections (usually at beginning):
      ❌ Any "Standalone Balance Sheet" - SKIP IMMEDIATELY
      ❌ Any table with heading "Financial position" or "Financial Summary"
      ❌ Tables in "Management Discussion and Analysis" sections  
      ❌ Tables with heading "Key Highlights" or "Performance Snapshot"
      ❌ Any table where "Total equity and liabilities" ≠ "Total assets"
   
   2️⃣ FIND the "Consolidated Balance Sheet" heading:
      ✅ MUST have "Consolidated Balance Sheet" or "Consolidated Statement of Financial Position"
      ✅ Verify word "Consolidated" is visible in the heading (not Standalone)
      ✅ Search for exact text: "Consolidated Balance Sheet" as a major section heading
      ✅ Immediately after heading, look for: "(In ₹ crore)" or "(In ₹ Lakhs)" unit indicator
      ✅ Then look for column header: "Particulars Note As at March 31, 2025  March 31, 2024"
   
   3️⃣ VERIFY correct structure BEFORE extracting:
      ✅ Heading says "Consolidated" (NOT "Standalone")
      ✅ First major section: "Assets" → "Non-current assets" → "Current assets"
      ✅ Has detailed line items: "Property, plant and equipment", "Investments", "Trade receivables"
      ✅ Second major section: "Equity and liabilities" → "Equity" → "Liabilities"
      ✅ Liabilities split: "Non-current liabilities" AND "Current liabilities" (both must exist!)
      ✅ Final line: "Total equity and liabilities" = "Total assets" (numbers must match!)
   
   BEFORE extracting ANY numbers, verify you found the CORRECT "Balance Sheet" table:
   
   ⚠️⚠️⚠️ CRITICAL: FIND THE CORRECT "Balance Sheet" TABLE - NOT SUMMARY TABLES ⚠️⚠️⚠️
   
   BEFORE extracting numbers, verify you found the RIGHT table structure:
   
   ✅ CORRECT "Balance Sheet" TABLE STRUCTURE:
   
   Must have this heading:
   -------
   Balance Sheet
   (In ₹ crore) OR (In ₹ Lakhs) OR (₹ in crores)
   - "PARTICULARS Note March 31, 2025 March 31, 2024" (BIOCON style)
   - "Particulars Note As at March 31, 2025  2024" (Infosys style)

   -------
   
   Must have DETAILED breakdown with all three sections:
   
   1️⃣ ASSETS SECTION (detailed breakdown):
      Non-current assets
        Property, plant and equipment [note] [num] [num]
        Right-of-use assets [note] [num] [num]
        Capital work-in-progress [note] [num] [num]
        Intangible assets [note] [num] [num]
        [more items...]
      Total non-current assets    [num]   [num]
      
      Current assets
        Inventories [note] [num] [num]
        Financial assets [note] [num] [num]
        Trade receivables [note] [num] [num]
        Cash and cash equivalents [note] [num] [num]
        [more items...]
      Total current assets    [num]   [num]
      
   Total assets    1,24,936   1,14,950
   
   2️⃣ EQUITY SECTION (detailed breakdown):
      Equity
        Equity share capital [note] [num] [num]
        Other equity [note] [num] [num]
      Total equity    87,332   81,176
   
   3️⃣ LIABILITIES SECTION (detailed breakdown):
      Liabilities
        Non-current liabilities
          Financial liabilities [note] [num] [num]
          Provisions [note] [num] [num]
          Deferred tax liabilities [note] [num] [num]
          [more items...]
        Total non-current liabilities    5,842   6,688
        
        Current liabilities
          Financial liabilities [note] [num] [num]
          Trade payables [note] [num] [num]
          Provisions [note] [num] [num]
          [more items...]
        Total current liabilities    31,762   27,086
   
   🔍 VALIDATION CHECKLIST (verify ALL before extracting):
   ✅ Has "Balance Sheet" heading (NOT "Summary" or "Segment information")
   ✅ Has "(In ₹ crore)" or similar unit indicator below heading
   ✅ Column header shows: "Particulars  Note As at March 31, 2025  2024"
   ✅ TWO numbers per line (current year | previous year)
   ✅ Detailed breakdown: "Total non-current assets" AND "Total current assets" listed separately
   ✅ Detailed breakdown: "Equity share capital" AND "Other equity" listed separately
   ✅ Detailed breakdown: "Total non-current liabilities" AND "Total current liabilities" listed separately
   ✅ Has individual line items (not just totals)
   
   🚨 RED FLAGS - SKIP THESE SECTIONS (these are WRONG tables):
   ❌ Total Equity = Total Assets (this is a SUMMARY TABLE where someone added equity + liabilities = assets incorrectly!)
      Example WRONG: Total assets 6,52,332 and Total equity 6,52,332 (SAME number = RED FLAG!)
   ❌ Total Liabilities = 0 (missing data or incomplete section!)
   ❌ Heading says "Consolidated Financial Statements Summary" or "Segment information"
   ❌ No detailed breakdown - only shows "Total assets", "Total equity", "Total liabilities" without line items
   ❌ Only ONE column of numbers (missing previous year comparison)
   ❌ Numbers in different formats mixed (some with commas, some decimals)
   
   📋 DECISION TREE:
   
   IF you find a table with Total Equity = Total Assets:
      → This is WRONG (summary consolidation table)
      → SKIP this section
      → SEARCH AGAIN for different "Balance Sheet" section
   
   IF you find a table with Total Liabilities = 0:
      → This is INCOMPLETE or wrong section
      → SKIP this section
      → SEARCH AGAIN for proper "Balance Sheet"
   
   IF you find a table without detailed asset/liability breakdown:
      → This is a summary, not detailed Balance Sheet
      → SKIP this section
      → SEARCH for section with line-item details
   
   IF you find a table with only one year of data:
      → Cannot do YoY comparison
      → SKIP this section
      → SEARCH for two-column format
   
   IF after searching you CANNOT find a valid Balance Sheet structure:
      → DO NOT extract incorrect data
      → DO NOT calculate or guess
      → Return error: "Balance Sheet section not found in expected format"
      → Set all balance sheet values to null
   
   ✅ FINAL VALIDATION BEFORE EXTRACTION:
   After finding a table, verify the balance equation:
   
   Total Assets (current) = Total Equity (current) + Total Liabilities (current)
   Example: 1,24,936 = 87,332 + (5,842 + 31,762) = 1,24,936 ✓
   
   IF equation FAILS (difference > 2%):
      → You extracted from WRONG section
      → SEARCH AGAIN for correct "Balance Sheet"
   
   IF equation PASSES:
      → Proceed with extraction from THIS table
      → Extract BOTH current and previous year numbers from each line
   
   ✅ NOW EXTRACT FROM THE VALIDATED TABLE:
   
   FOR TOTAL ASSETS - Find line containing:
   • "TOTAL ASSETS" OR "Total Assets" OR "Total assets"
   • Extract the 2 LARGEST numbers from that line (ignore small note numbers)
   
   FOR TOTAL EQUITY - Find line containing:
   • "Total equity" OR "TOTAL EQUITY" OR "Shareholders' equity"  
   • Extract the 2 LARGEST numbers from that line
   
    FOR TOTAL LIABILITIES - TRY MULTIPLE STRATEGIES:

   STRATEGY A (PRIORITY 1): Look for "Total non-current liabilities" + "Total current liabilities"
   - If BOTH lines exist, SUM THEM:
     Current Total Liabilities = Non-current current + Current current
     Previous Total Liabilities = Non-current previous + Current previous
   - Example: 23,595 + 17,372 = 40,967 (current year)
   
   STRATEGY B (PRIORITY 2): Look for single "Total liabilities" line
   - Search patterns: "Total liabilities", "TOTAL LIABILITIES"
   - DO NOT match "Total equity and liabilities" (that equals Assets!)
   - Extract BOTH columns directly
   
   STRATEGY C (FALLBACK): Calculate from Assets - Equity
   - If liabilities not found: Total Liabilities = Total Assets - Total Equity
   - Apply to both current and previous year

   VALIDATION CHECKS (MANDATORY):
   ✅ Total Assets = Total Equity + Total Liabilities (must match!)
   ✅ If validation fails by >1%, retry extraction with different patterns
   ✅ Log any mismatches for debugging
   
   ⚠️ DO NOT use "Total equity and liabilities" (that equals Assets, not Liabilities only!)
   
   NUMBER PARSING:
   • Strip ALL commas: "1,24,936" → 124936
   • Ignore small numbers (< 1000) - these are note references
   
4. PROFIT & LOSS EXTRACTION FROM THE DOCUMENT ABOVE:
   
   Locate P&L Statement in the document:
   - Search for: "Statement of Profit and Loss" OR "Income Statement"
   - Look for: "Year ended March 31, 2025" (NOT quarterly)
   
   EXTRACT FROM DOCUMENT (try ALL label variations):
   
   • REVENUE: "Total Income" OR "revenue from operations" OR "Net sales"
   • EXPENSES: "Total expenses" OR "Expenses" OR "Operating expenses"
   • PROFIT BEFORE TAX: "Profit before tax" OR "PBT"
   • TAX EXPENSE: "Tax expense" OR "Income tax expense"
   • PROFIT AFTER TAX: "Profit after tax" OR "Profit for the year" OR "Net profit"
   • EPS: "Earnings per share" OR "EPS" OR "Basic EPS"
   
   ⚠️ Must be ANNUAL data from "Year ended March 31, 2025" section
   ⚠️ If Revenue < 100000 and looks quarterly → find the annual section instead

5. KEY RISKS (3-5 major risks):
   - Extract from "Risk Management" or "Risk Factors" section in the document
   - Business risks, Financial risks, Regulatory risks, Operational risks

6. KEY OPPORTUNITIES (3-5 opportunities):
   - Extract from "Opportunities" or "Business Outlook" section in the document
   - Growth opportunities, Market expansion, New initiatives

5.Extract comprehensive remuneration and compensation details for Directors and Key Managerial Personnel (KMP) from the following annual report text

 LOCATE THE SECTIONS:
   - "Remuneration of Directors" (usually in Board's Report or Corporate Governance section)
   - "Details of remuneration paid to Managing Director / Whole-time Directors"
   - "Key Managerial Personnel (KMP) remuneration"
   - "Sitting fees paid to Non-Executive Directors"
   - "Commission and other benefits to Directors"

 UNDERSTAND THE TABLE STRUCTURE:
   Tables typically show:
   - Director/KMP Name and Designation
   - Salary/Basic pay
   - Perquisites and allowances
   - Commission
   - Stock options granted/exercised
   - Sitting fees (for Non-Executive Directors)
   - Total remuneration
   - May compare FY 2024-25 vs FY 2023-24

 DIRECTOR CATEGORIES:
   A. EXECUTIVE DIRECTORS (Managing Director, Whole-time Directors):
      - Receive salary, perquisites, commission, bonuses
      - May have stock options/ESOPs
      - Full-time employment with the company
   
   B. NON-EXECUTIVE DIRECTORS (Including Independent Directors):
      - Receive sitting fees for board/committee meetings
      - May receive commission (profit-linked or fixed)
      - No salary or perquisites

 KEY MANAGERIAL PERSONNEL (KMP):
   - CEO, CFO, Company Secretary, COO
   - May overlap with Executive Directors
   - Extract their separate compensation if disclosed

OCR FORMAT NOTES:
   - Tables may be in columnar format with names in rows
   - Amounts in LAKHS (₹ in lakhs) or CRORES (₹ in crores) - note the unit!
   - Format: "Name  Salary  Perquisites  Commission  Stock Options  Total"
   - Some reports show quarterly/monthly breakdowns

STOCK OPTIONS/ESOPS:
   - Number of options granted during the year
   - Number of options exercised
   - Exercise price per option
   - Fair value of options (for disclosure)

6. TWO FORMAT OPTIONS:
   
   FORMAT A - OCR SPACING (legacy):
   "Property, plant    134141    119778"
   Pattern: [Label] [multiple spaces] [Current] [multiple spaces] [Previous]
   
   FORMAT B - STRUCTURED TABLE (new):
   "ASSETS                         Mar-25    Mar-24"
   "Tangible assets               134,141   119,778"
   Pattern: Header row with year labels, then data rows with commas

   FORMAT DETECTION:
- MOST REPORTS use FORMAT A: "Label [spaces] Current [spaces] Previous"
- SOME REPORTS use FORMAT B: Column headers "Mar-25  Mar-24" with aligned data below
- Extract from whichever format is present in the document
- Both formats have TWO numbers per line (current and previous year)



⚠️⚠️⚠️ REMINDER: ALL DATA MUST COME FROM THE ACTUAL DOCUMENT TEXT PROVIDED AT THE TOP! ⚠️⚠️⚠️

Provide response in this EXACT JSON format:

{
  "companyName": "Extract from document header",
  "symbol": "${cleanSymbol}",
  "fiscalYear": "Extract from annual balance sheet date in document",
  "reportType": "Consolidated",
  "currency": "INR Crores",
  "businessModel": "Detailed 400+ word description extracted from the document...",
  "futureStrategy": "Detailed 400+ word strategic plans extracted from the document...",
  "balanceSheet": {
    "summary": "IF you successfully found and validated the correct Balance Sheet table AND extracted P&L data: Write ONE comprehensive paragraph (350-450 words) covering: 1) Total Assets growth with YoY % and absolute change, 2) Equity growth with YoY % change, 3) Liabilities breakdown (non-current vs current) with YoY changes, 4) Revenue from operations with YoY growth %, 5) Profit before tax with YoY change, 6) Tax expense with effective tax rate, 7) Profit after tax with YoY change %, 8) EPS with YoY change. Use professional financial analyst tone with ALL ACTUAL NUMBERS from the document. IF validation failed OR you couldn't find the correct detailed Balance Sheet: Write 'Balance Sheet data not available in expected format in the annual report.'",
    "assets": {
      "nonCurrent": {
        "total": { "current": null, "previous": null }  // Extract actual "Total non-current assets" from validated table, OR null if validation failed
      },
      "current": {
        "total": { "current": null, "previous": null }  // Extract actual "Total current assets" from validated table, OR null if validation failed
      },
      "totalAssets": { "current": null, "previous": null }  // Extract actual "TOTAL ASSETS" from validated table, OR null if validation failed
    },
    "equity": {
      "equityShareCapital": { "current": null, "previous": null },  // Extract actual "Share capital" from validated table, OR null if validation failed
      "otherEquity": { "current": null, "previous": null },  // Extract actual "Other equity" from validated table, OR null if validation failed
      "totalEquity": { "current": null, "previous": null }  // Extract actual "Total equity" from validated table, OR null if validation failed
    },
    "liabilities": {
      "nonCurrent": {
        "total": { "current": null, "previous": null }  // Extract actual "Total non-current liabilities" from validated table, OR null if validation failed
      },
      "current": {
        "total": { "current": null, "previous": null }  // Extract actual "Total current liabilities" from validated table, OR null if validation failed
      },
      "totalLiabilities": { "current": null, "previous": null }  // Calculate: non-current + current from validated table, OR null if validation failed
    },
    "profitAndLoss": {
      "revenue": { "current": null, "previous": null },  // Extract actual ANNUAL "Total Income" from document
      "totalExpenses": { "current": null, "previous": null },  // Extract actual ANNUAL "Total Expenses" from document
      "profitBeforeTax": { "current": null, "previous": null },  // Extract actual "Profit before tax" from document
      "taxExpense": { "current": null, "previous": null },  // Extract actual "Tax expense" from document
      "profitAfterTax": { "current": null, "previous": null },  // Extract actual "Profit for the year" from document
      "eps": { "current": null, "previous": null }  // Extract actual "Earnings per share" (annual) from document
    },
    "yoyComparison": {
      "totalAssets": { "change": null, "changePercent": null },  // IF balance sheet validated: calculate, ELSE: null
      "totalEquity": { "change": null, "changePercent": null },  // IF balance sheet validated: calculate, ELSE: null
      "totalLiabilities": { "change": null, "changePercent": null },  // IF balance sheet validated: calculate, ELSE: null
      "revenue": { "change": null, "changePercent": null },  // IF balance sheet validated: calculate, ELSE: null
      "profitAfterTax": { "change": null, "changePercent": null },  // Calculate if P&L data extracted
      "eps": { "change": null, "changePercent": null }  // Calculate if P&L data extracted
    },
    "analysis": "Provide detailed financial analysis IF you successfully extracted and validated balance sheet data. IF validation failed: state 'Detailed Balance Sheet not available in expected format.'"
  },
  "cashFlow": {
    "summary": "IF you successfully found and validated Consolidated Cash Flow Statement: Write ONE comprehensive paragraph (350-450 words) covering: 1) Operating cash flow with YoY % change and comparison to profit, 2) Major working capital movements (inventory, receivables, payables changes), 3) Investing activities breakdown - Capex amount and YoY change, acquisitions/investments if any, 4) Financing activities - debt raised/repaid, dividends paid, equity raised if any, 5) Free Cash Flow calculation (Operating CF - Capex) with YoY change, 6) Net cash position change and closing cash balance, 7) Cash conversion ratio (Operating CF / Net Profit). IF validation failed: Write 'Cash Flow Statement not available in expected format.'",
    
    "operatingActivities": {
      "profitBeforeTax": { "current": null, "previous": null },  // Extract from section A
      "operatingProfitBeforeWC": { "current": null, "previous": null },  // After adjustments, before WC changes
      "cashGeneratedFromOperations": { "current": null, "previous": null },  // After WC changes
      "taxesPaid": { "current": null, "previous": null },  // Negative number
      "netCashFromOperating": { "current": null, "previous": null }  // Final line of section A
    },
    
    "workingCapitalChanges": {
      "inventoryChange": { "current": null, "previous": null },  // Negative = increase
      "receivablesChange": { "current": null, "previous": null },  // Negative = increase
      "payablesChange": { "current": null, "previous": null },  // Positive = increase
      "otherWCChanges": { "current": null, "previous": null }  // Net of other items
    },
    
    "investingActivities": {
      "capexPPE": { "current": null, "previous": null },  // Negative number
      "capexIntangibles": { "current": null, "previous": null },  // Negative number
      "totalCapex": { "current": null, "previous": null },  // Sum of above (negative)
      "investmentsPurchased": { "current": null, "previous": null },  // Negative
      "investmentsSold": { "current": null, "previous": null },  // Positive
      "interestReceived": { "current": null, "previous": null },
      "dividendReceived": { "current": null, "previous": null },
      "netCashFromInvesting": { "current": null, "previous": null }  // Final line of section B (usually negative)
    },
    
    "financingActivities": {
      "borrowingsProceeds": { "current": null, "previous": null },  // Positive inflow
      "borrowingsRepayment": { "current": null, "previous": null },  // Negative outflow
      "netBorrowingChange": { "current": null, "previous": null },  // Calculate: proceeds - repayment
      "interestPaid": { "current": null, "previous": null },  // Negative
      "dividendsPaid": { "current": null, "previous": null },  // Negative
      "equityIssued": { "current": null, "previous": null },  // If present, positive
      "netCashFromFinancing": { "current": null, "previous": null }  // Final line of section C
    },
    
    "reconciliation": {
      "netCashChange": { "current": null, "previous": null },  // A + B + C
      "openingCash": { "current": null, "previous": null },
      "closingCash": { "current": null, "previous": null },  // Must equal: opening + net change
      "validationPassed": false  // Set to true if reconciliation matches
    },
    
    "derivedMetrics": {
      "freeCashFlow": { "current": null, "previous": null },  // Operating CF - Total Capex
      "cashConversionRatio": { "current": null, "previous": null },  // Operating CF / Profit After Tax (from P&L)
      "capexAsPercentOfRevenue": { "current": null, "previous": null },  // (Total Capex / Revenue) * 100
      "dividendPayoutRatio": { "current": null, "previous": null }  // (Dividends Paid / Profit After Tax) * 100
    },
    
    "yoyComparison": {
      "operatingCashFlow": { "change": null, "changePercent": null },
      "investingCashFlow": { "change": null, "changePercent": null },
      "financingCashFlow": { "change": null, "changePercent": null },
      "freeCashFlow": { "change": null, "changePercent": null },
      "closingCash": { "change": null, "changePercent": null }
    },
    
    "healthIndicators": {
      "isOperatingCFPositive": null,  // true/false
      "isFreeCFPositive": null,  // true/false
      "cashFlowQuality": null,  // "Excellent" if Operating CF > PAT, "Good" if 70-100%, "Weak" if <70%
      "workingCapitalTrend": null,  // "Improving" if WC changes are favorable, "Deteriorating" otherwise
      "debtServiceAbility": null  // "Strong" if Operating CF > (Interest + Debt Repayment), else "Weak"
    },
    
    "analysis": "Provide detailed cash flow analysis IF you successfully extracted data. Discuss: 1) Quality of earnings (CF vs profit), 2) Working capital efficiency, 3) Capex intensity and growth investments, 4) Debt servicing capability, 5) Dividend sustainability, 6) Free cash flow adequacy. IF extraction failed: state 'Cash Flow Statement not available in expected format.'"
  },
  "remuneration": {
  "fiscalYear": "FY 2024-25",
  "currencyUnit": "Lakhs|Crores",
  "executiveDirectors":[
   {
      "name": "<Full Name>",
      "designation": "Managing Director|CEO & Managing Director|Whole-time Director|Executive Director| Joint Managing Director |Director |Additional Director|Non-Executive Directors ",
      "remuneration": {
        "salary": <number>,
        "perquisites": <number>,
        "commission": <number>,
        "bonusPerformanceLinked": <number>,
        "retirementBenefits": <number>,
        "stockOptionsGranted": <number of options>,
        "stockOptionsExercised": <number of options>,
        "stockOptionValue": <fair value in lakhs/crores>,
        "totalRemuneration": <number>,
        "previousYear": <number (FY 2023-24 total)>
      },
      "tenure": "<years>",
      "percentageIncreaseOverPreviousYear": "<X%>"
    }
  ],
  "nonExecutiveDirectors": [
    {
      "name": "<Full Name>",
      "designation": "Non-Executive Director|Independent Director|Nominee Director",
      "remuneration": {
        "sittingFees": {
          "boardMeetings": <number>,
          "committeeMeetings": <number>,
          "totalSittingFees": <number>
        },
        "commission": <number>,
        "otherBenefits": <number>,
        "totalRemuneration": <number>,
        "previousYear": <number>
      },
      "meetingsAttended": "<X out of Y>"
    }
  ],
  "keyManagerialPersonnel": [
    {
      "name": "<Full Name>",
      "designation": "CEO|CFO|Company Secretary|COO|Chief Legal Officer",
      "remuneration": {
        "salary": <number>,
        "perquisites": <number>,
        "commission": <number>,
        "bonusPerformanceLinked": <number>,
        "retirementBenefits": <number>,
        "stockOptionsGranted": <number of options>,
        "totalRemuneration": <number>,
        "previousYear": <number>
      },
      "isAlsoDirector": true|false
    }
  ],
  "totalRemunerationSummary": {
    "totalExecutiveDirectors": <number>,
    "totalNonExecutiveDirectors": <number>,
    "totalKMP": <number>,
    "grandTotal": <number>,
    "previousYearTotal": <number>,
    "percentageChange": "<X%>"
  },
  "employeeStockOptionPlan": {
    "planName": "<ESOP 2020, etc.>",
    "optionsGrantedDuringYear": <number>,
    "optionsExercisedDuringYear": <number>,
    "optionsOutstanding": <number>,
    "exercisePrice": <number per share>,
    "vestingSchedule": "<description>",
    "beneficiaries": "<Directors, KMP, Employees>"
  },
  "ratioAnalysis": {
    "medianRemunerationOfEmployees": <number>,
    "percentageIncreaseInMedianRemuneration": "<X%>",
    "highestPaidDirector": "<Name>",
    "highestPaidDirectorRemuneration": <number>,
    "ratioOfHighestToMedian": "<X:1>",
    "averagePercentileIncreaseInRemuneration": {
      "directors": "<X%>",
      "kmp": "<Y%>",
      "allEmployees": "<Z%>"
    }
  },
  "remunerationPolicy": {
    "policyExists": true|false,
    "approvedBy": "<Board/Shareholders/NRC>",
    "keyPrinciples": [
      "<Principle 1: Performance-linked pay>",
      "<Principle 2: Market competitiveness>",
      "<Principle 3: Long-term sustainability>"
    ],
    "performanceMetrics": [
      "<Revenue growth>",
      "<Profit margins>",
      "<Return on equity>",
      "<Customer satisfaction>"
    ]
  },
  "complianceAndDisclosures": {
    "section197Compliance": true|false,
    "scheduleVCompliance": true|false,
    "nrcRecommendations": "<Summary of Nomination & Remuneration Committee recommendations>",
    "shareholderApproval": {
      "required": true|false,
      "obtained": true|false,
      "resolutionDate": "<Date>",
      "votingPercentage": "<X% in favor>"
    }
  },
  "summary": "<3-4 sentence narrative covering: (1) Total remuneration paid to Executive Directors and increase/decrease from previous year, (2) Highest paid director and their compensation, (3) Non-Executive Directors sitting fees and commission structure, (4) Stock options granted to Directors/KMP and vesting details, (5) Key changes in remuneration policy or structure, (6) Ratio of highest director remuneration to median employee salary, (7) Check how many percentage of occupency remuneration from company profit if the remuneration is less than 5% the are good if above its bad .>"
}
  "auditInformation": 
  {
  "companyName": "Company Name",
  "fiscalYear": "FY2026",
  "reportType": "Consolidated Financial Statements",
  "auditor": {
    "firmName": "B S R & Co. LLP",
    "registrationNumber": "101248W/W-100022",
    "partnerName": "Aniruddha Godbole",
    "partnerMembershipNumber": "105149",
    "auditReportDate": "2025-04-10",
    "location": "Mumbai",
    "udin": "25105149BMLWYM7865"
  },
  "opinion": {
    "type": "Unqualified Opinion",
    "statement": "[Extract exact opinion paragraph - starting with 'In our opinion and to the best of our information...']",
    "basisForOpinion": "[Summary: Audit conducted per SAs under Section 143(10), independent per ICAI Code of Ethics, sufficient audit evidence obtained]",
    "isModified": false
  },
  "emphasisOfMatter": {
    "present": false,
    "description": null,
    "referenceNote": null
  },
  "materialUncertainty": {
    "present": false,
    "description": null
  },
  "keyAuditMatters": [
    {
      "title": "Revenue recognition – Fixed price contracts using percentage of completion method",
      "whyItsAKAM": "[Extract description of why this is significant - judgment required, estimation uncertainty, etc.]",
      "auditorsResponse": "[Extract how auditor addressed it - procedures performed, evidence obtained]",
      "referenceNotes": ["Note 5(a)", "Note 12"]
    }
  ],
  "otherMatters": {
    "componentAuditorsInvolved": true,
    "numberOfSubsidiariesByOthers": 7,
    "percentageAuditedByOthers": "15% of assets, 12% of revenue",
    "relianceStatement": "[Extract statement about reliance on component auditors' reports]",
    "unauditedComponents": ["Subsidiary A (immaterial)", "JV B (under liquidation)"]
  },
  "legalRegulatoryCompliance": {
    "section143_3": {
      "informationObtained": "Adequate",
      "properBooksKept": "Yes",
      "agreementWithBooks": "Yes",
      "indASCompliance": "Yes",
      "directorsDisqualified": "None",
      "modifications": null,
      "internalControlsOpinion": "Adequate - Refer Annexure B"
    },
    "rule11": {
      "litigationsDisclosed": "Yes - Note 20",
      "foreseeableLossesProvided": "Yes",
      "iepfTransfers": "On time",
      "fundsToIntermediaries": "None - Note 23",
      "fundsFromFundingParties": "None - Note 23",
      "dividendCompliance": "Yes - Section 123 complied",
      "auditTrail": {
        "enabled": true,
        "exceptions": "Not enabled for certain periods in 3 subsidiary accounting systems",
        "tampering": "None detected",
        "preserved": "Yes per statutory requirements"
      }
    },
    "section197_16": {
      "compliant": true,
      "excessPayments": "None"
    }
  },
  "caro": {
    "applicable": true,
    "annexure": "Annexure A",
    "holdingCompanyRemarks": "No unfavorable answers, qualifications, or adverse remarks",
    "subsidiariesWithIssues": [],
    "subsidiariesCARONotIssued": [
      {
        "name": "MP Online Limited",
        "cin": "U72400MP2006PLC018777"
      }
    ]
  },
  "internalFinancialControls": {
    "annexure": "Annexure B",
    "opinion": "Adequate and operating effectively",
    "scope": "Holding Company + Indian subsidiaries incorporated under Companies Act 2013",
    "exceptions": null
  },
  "consolidationScope": {
    "subsidiaries": {
      "total": 25,
      "indian": 8,
      "foreign": 17,
      "auditedByComponentAuditors": 7
    },
    "associates": {
      "total": 3,
      "indian": 2,
      "foreign": 1
    },
    "jointVentures": {
      "total": 1,
      "indian": 1,
      "foreign": 0
    },
    "componentAuditors": {
      "firms": ["Local Firm ABC (USA)", "XYZ Partners (UK)"],
      "percentageOfRevenue": "12%",
      "percentageOfAssets": "15%"
    }
  }
}
    

}       

⚠️⚠️⚠️ CRITICAL VALIDATION REMINDER BEFORE EXTRACTION ⚠️⚠️⚠️

BEFORE extracting balance sheet numbers, you MUST:
1. Find a table with heading "Balance Sheet" (not "Summary")
2. Verify it has detailed line-item breakdown (not just totals)
3. Check TWO columns of numbers exist (current + previous year)
4. Verify Total Equity ≠ Total Assets (if equal, WRONG table!)
5. Verify Total Liabilities > 0 (if zero, WRONG table!)

IF you cannot find a valid detailed Balance Sheet table:
→ Set ALL balance sheet values to null
→ Set summary to: "Balance Sheet data not available in expected format in the annual report."
→ DO NOT extract from summary/consolidated tables
→ DO NOT use 0 - use null for unavailable data

⚠️⚠️⚠️ FINAL REMINDER BEFORE YOU RESPOND ⚠️⚠️⚠️

1. GO BACK TO THE DOCUMENT TEXT AT THE TOP OF THIS PROMPT
2. READ THE ACTUAL BALANCE SHEET IN THAT DOCUMENT
3. EXTRACT THE REAL NUMBERS FROM THAT SPECIFIC COMPANY'S DOCUMENT
4. DO NOT USE 0 OR EXAMPLE NUMBERS - USE THE ACTUAL DATA YOU SEE IN THE DOCUMENT
5. WRITE THE SUMMARY PARAGRAPH USING THOSE REAL EXTRACTED NUMBERS

⚠️ CRITICAL: CALCULATE ALL YEAR-OVER-YEAR CHANGES using the actual extracted numbers:
For EVERY financial metric in yoyComparison, calculate using your extracted numbers:
- Absolute change = current - previous
- Percentage change = ((current - previous) / previous) × 100

Then use these calculations in the "summary" narrative with the ACTUAL NUMBERS you extracted.

⚠️ REMEMBER: Extract from the ACTUAL DOCUMENT provided at the top, not from instruction examples!
⚠️ Every company's numbers are different - find and use the real data from this specific document!
✅ Look for the table with heading "Consolidated Balance Sheet"
✅ Numbers will typically be in Indian format with commas: 1,24,936 → store as 124936 (strip commas)
✅ The document text at the top contains the REAL balance sheet data you must use!

CRITICAL VALIDATION BEFORE RETURNING:
1. Balance sheet equation check: 
   - totalAssets.current MUST equal totalEquity.current + totalLiabilities.current
   - Example (lakhs): 621532 = 523111 + 98421 ✓
   - Example (crores): 6215.32 = 5231.11 + 984.21 ✓

2. Unit consistency check - ALL values must be in SAME scale:
   - If Total Assets is 621532, then Equity should be ~523111 and Liabilities ~98421 (all 5-6 digits)
   - If Total Assets is  6215.32, then Equity should be ~5231.11 and Liabilities ~984.21 (all have decimals)
   - DO NOT mix formats: Don't have Assets=621532 with Equity=5231.11 (different scales)

3. Annual vs Quarterly check:
   - Balance sheet: "as at 31 March, 2025" (NOT "as at 31 December" quarterly)
   - P&L: "Year ended 31 March, 2025" (NOT "Quarter ended")
   - Revenue must be ANNUAL (if you see 5594, find the annual row showing ~162990)
   - If Total Assets < 10000, you extracted quarterly - REJECT and find annual

IMPORTANT: 
- Extract values in the EXACT unit shown in table header (don't convert lakhs to crores or vice versa)
- ALL balance sheet numbers must have consistent scale (all 5-6 digits OR all with decimals)
- If a value is not found, use null instead of 0
- Verify currency unit matches table header (₹ Lakhs, ₹ Crore, etc.)

VALIDATION RULES:
- Extract ACTUAL numbers from tables, DO NOT calculate
- Identify currency unit (Lakhs or Crores) from table header
- Use null if a component is not disclosed or marked with dash (-)
- For Non-Executive Directors, salary should be 0 or null
- Total should equal sum of components (salary + perquisites + commission + bonus)
- Stock options: Capture NUMBER of options, not just value
- If same person appears as Director and KMP, mark "isAlsoDirector": true and avoid double counting
- Verify Section 197 compliance statements (total managerial remuneration limits)
- All amounts in the unit specified (Lakhs or Crores)

CRITICAL DISTINCTIONS:
- "Salary" = Fixed monthly/annual compensation
- "Perquisites" = Housing, car, medical, club memberships, etc.
- "Commission" = Profit-linked or performance-based variable pay
- "Bonus" = Annual performance bonus
- "Stock Options" = Long-term incentive (ESOP grants)
- "Sitting Fees" = Per-meeting attendance fees (Non-Executive only)

Return ONLY the JSON object, no additional text.

// After the Balance Sheet/P&L extraction sections, ADD:

6. AUDIT INFORMATION EXTRACTION (CRITICAL for investor decisions):

Instructions
Extract the following information from the Consolidated Financial Statements audit report ONLY:

1. AUDITOR IDENTIFICATION
Audit Firm Name: Full name of the chartered accountants firm
Firm Registration Number: ICAI registration number (format: XXXXXXW/W-XXXXXX)
Partner Name: Name of the signing partner
Partner Membership Number: ICAI membership number
Audit Report Date: Date of signing the audit report
Location: Place from where report is signed
UDIN: Unique Document Identification Number
2. AUDIT OPINION
Opinion Type: Identify as one of:
"Unqualified/Unmodified Opinion" (clean opinion - financials present fairly)
"Qualified Opinion" (with specific exceptions/disagreements)
"Adverse Opinion" (financials don't present fairly)
"Disclaimer of Opinion" (unable to form opinion)
Opinion Statement: Extract the exact opinion paragraph verbatim
Basis for Opinion: Summary of the basis section (audit standards followed, independence confirmation)
Basis for Qualified/Adverse Opinion (if applicable): Specific reasons for modification with amounts/impact
3. EMPHASIS OF MATTER
Present: Yes/No
Description: Extract the full paragraph describing the matter
Reference Note: Note number in financial statements
Impact Statement: Confirm "opinion is not modified" statement is present
4. MATERIAL UNCERTAINTY RELATED TO GOING CONCERN
Present: Yes/No
Description: Extract details if present
Management's Response: How management addressed the uncertainty
5. KEY AUDIT MATTERS (KAM)
For EACH Key Audit Matter, extract:

Field	Description
Title	Brief heading (e.g., "Revenue Recognition - Fixed Price Contracts")
Why it's a KAM	Auditor's explanation of significance (complexity, judgment, risk)
How Auditor Addressed	Audit procedures performed to address the matter
Reference Notes	Financial statement note numbers
Common KAMs in Consolidated Statements:

Revenue recognition across multiple entities
Goodwill impairment testing (from acquisitions)
Consolidation complexities (subsidiaries in different countries/currencies)
Tax contingencies across group entities
Inter-company eliminations and related party transactions
Fair value measurements of investments in associates/JVs
Inventory valuation across geographies
6. OTHER MATTERS
Component Auditors: Are other auditors involved? (Yes/No)
Number of Subsidiaries: How many subsidiaries audited by component auditors?
Percentage Audited by Others: What % of consolidated assets/revenue audited by others?
Reliance Statement: Extract statement about reliance on other auditors' work
Unaudited Components: List any subsidiaries/associates not audited
7. REPORT ON OTHER LEGAL & REGULATORY REQUIREMENTS
Section 143(3) of Companies Act Reporting:
  a. Information & explanations obtained: Adequate/Inadequate
b. Proper books of account maintained: Yes/No/Exceptions
c. Agreement with books of account: Yes/No
d. Compliance with Ind AS: Yes/No
e. Directors disqualified: None/List
f. Modifications (if any): Details
g. Internal financial controls: Adequate/Inadequate (Annexure reference)

Rule 11 of Companies (Audit and Auditors) Rules, 2014:
 
a. Pending litigations disclosed: Yes/No (Note reference)
b. Material foreseeable losses provided: Yes/No (Note reference)
c. Amounts transferred to IEPF: On time/Delayed/None
d. Funds advanced to intermediaries: Details (Note reference)
e. Funds received from funding parties: Details (Note reference)
f. Dividend compliance: Yes/No/Details
g. Audit trail in accounting software: Enabled/Not enabled/Exceptions

Section 197(16) - Director Remuneration:

Compliance status: Yes/No
Excess payments: None/Details
8. CARO REPORTING (Annexure A)
Applicability: Applicable/Not Applicable
Holding Company CARO: Qualifications/adverse remarks? (Yes/No)
Subsidiary Companies: List subsidiaries whose CARO has unfavorable remarks
Annexure Statement: Extract summary statement (paragraph xxi)
9. INTERNAL FINANCIAL CONTROLS (Annexure B)
Opinion Type: Adequate/Inadequate/Modified
Scope: Holding company + Indian subsidiaries
Exceptions: List any material weaknesses identified
Reference: Annexure letter designation (usually "Annexure B")

10. CONSOLIDATION-SPECIFIC DISCLOSURES
Extract details specific to consolidated reporting:

Entities Included in Consolidation:

{
  "subsidiaries": {
    "total": 0,
    "indian": 0,
    "foreign": 0,
    "auditedByComponentAuditors": 0
  },
  "associates": {
    "total": 0,
    "indian": 0,
    "foreign": 0
  },
  "jointVentures": {
    "total": 0,
    "indian": 0,
    "foreign": 0
  }
}
}

Extraction Strategy
Locate the Consolidated Audit Report:

Search for: "Independent Auditor's Report to the Members"
Look for: "Consolidated Financial Statements" or "Consolidated Balance Sheet"
❌ CRITICAL REJECTION: If you see "Standalone Financial Statements" or "Standalone Audit Report" → SKIP IT COMPLETELY
❌ Standalone = Parent company only (wrong - excludes subsidiaries)
✅ MUST find "Consolidated Financial Statements" or "Consolidated Audit Report"
✅ If Standalone appears first in document, IGNORE IT and keep searching below for Consolidated
Search for: "Independent Auditor's Report to the Members" followed by "Consolidated Financial Statements"
Look for: "Consolidated Financial Statements" or "Consolidated Balance Sheet" in the report heading
Section Markers (in order of appearance):

- Opinion
- Basis for Opinion
- Emphasis of Matter (optional)
- Material Uncertainty (optional)
- Key Audit Matters
- Other Information
- Management's Responsibilities
- Auditor's Responsibilities
- Other Matters (if component auditors involved)
- Report on Other Legal and Regulatory Requirements
  * Section 143(3)
  * Rule 11
  * Section 197(16)
- Annexure A (CARO)
- Annexure B (Internal Controls)


Validation Checks:

✅ Confirm report title includes "Consolidated"
✅ Verify opinion covers "Holding Company and its subsidiaries"
✅ Check for "Other Matters" paragraph (usually present in consolidated reports)
✅ Validate CARO statement mentions "Holding Company"
✅ Ensure all KAMs are captured with full descriptions
Special Consolidated Considerations

Opinion Type Indicators:

Unqualified: "give a true and fair view in conformity with..."
Qualified: "Except for the effects of the matter described in the Basis for Qualified Opinion..."
Adverse: "do not give a true and fair view..."
Disclaimer: "we do not express an opinion..."
Component Auditor Red Flags:

Large percentage (>20%) audited by others = higher risk
Component auditors in high-risk jurisdictions
Delayed CARO reports from subsidiaries
Consolidation KAMs to Watch:

Goodwill impairment (acquired subsidiaries)
Foreign currency translation adjustments
Intercompany eliminations
Business combinations during the year
Step acquisitions or loss of control
CARO in Consolidated Context:

CARO applies to holding company separately
Each Indian subsidiary has its own CARO
Principal auditor summarizes in Annexure A
Watch for subsidiaries whose CARO is delayed/missing


7. CASH FLOW STATEMENT EXTRACTION FROM THE DOCUMENT ABOVE (minimum 400 words):

⚠️⚠️⚠️ MANDATORY: ONLY EXTRACT CONSOLIDATED CASH FLOW - REJECT STANDALONE ⚠️⚠️⚠️

🚫 CRITICAL REJECTION RULES:
❌ Immediately SKIP any heading with "Standalone Cash Flow Statement"
❌ Immediately SKIP any heading with "Standalone Statement of Cash Flows"
❌ DO NOT extract from Standalone under any circumstances

✅ ONLY EXTRACT FROM:
1. Heading MUST say "Consolidated Statement of Cash Flows" OR "Consolidated Cash Flow Statement"
2. Verify word "Consolidated" appears in section heading
3. Usually appears AFTER Consolidated Balance Sheet and P&L sections

🔍 MANDATORY SEARCH STRATEGY:
Step 1: Search document for "Consolidated Statement of Cash Flows" or "Consolidated Cash Flow Statement"
Step 2: If you find "Standalone" version first (common in annual reports):
       → ❌ IGNORE completely - do NOT extract
       → ⏩ Continue searching for Consolidated version
Step 3: Only when heading explicitly says "Consolidated":
       → ✅ Verify "Consolidated" word is present
       → ✅ Confirm it's NOT Standalone
       → ✅ Proceed with extraction

⚠️ FIND THE CORRECT "Cash Flow Statement" TABLE:

TEXTUAL LANDMARKS TO LOCATE CORRECT SECTION:

1️⃣ SKIP these wrong sections:
   ❌ Any "Standalone Cash Flow Statement" - SKIP IMMEDIATELY
   ❌ Summary tables or highlights sections
   ❌ Segment-wise cash flow breakdowns
   ❌ Tables in MD&A with cash flow metrics

2️⃣ FIND the correct heading:
   ✅ MUST have "Consolidated Statement of Cash Flows" OR "Consolidated Cash Flow Statement"
   ✅ Verify "Consolidated" is visible (NOT Standalone)
   ✅ Look for unit indicator: "(₹ in Crore)" OR "(In ₹ Lakhs)" immediately after heading
   ✅ Column headers: "Particulars  Note  Year ended March 31, 2025  Year ended March 31, 2024"

3️⃣ VERIFY correct structure BEFORE extracting:
   ✅ Heading says "Consolidated" (NOT "Standalone")
   ✅ Three main sections visible:
      • A. Cash flows from operating activities
      • B. Cash flows from investing activities
      • C. Cash flows from financing activities
   ✅ Each section has detailed line items with two numbers (current year | previous year)
   ✅ Final lines show:
      • "Net increase/(decrease) in cash and cash equivalents"
      • "Cash and cash equivalents at beginning of year"
      • "Cash and cash equivalents at end of year"

✅ CORRECT CASH FLOW STATEMENT STRUCTURE:

Statement of Cash Flows
(₹ in Crore) OR (In ₹ Lakhs)
-------
Particulars  Note  For the year ended March 31, 2025  March 31, 2024
-------

A. CASH FLOWS FROM OPERATING ACTIVITIES:
   Profit before tax                     [num]      [num]
   Adjustments for:
     Depreciation and amortization       [num]      [num]
     Interest income                    ([num])    ([num])
     Interest expense                    [num]      [num]
     Dividend income                    ([num])    ([num])
     [more adjustments...]
   Operating profit before working capital changes  [num]  [num]
   
   Changes in working capital:
     (Increase)/decrease in inventories            ([num])  [num]
     (Increase)/decrease in trade receivables      ([num])  [num]
     Increase/(decrease) in trade payables          [num]  ([num])
     [more working capital items...]
   
   Cash generated from operations                   [num]  [num]
   Income taxes paid                               ([num]) ([num])
   Net cash from operating activities (A)           [num]  [num]

B. CASH FLOWS FROM INVESTING ACTIVITIES:
   Purchase of property, plant and equipment       ([num]) ([num])
   Purchase of intangible assets                   ([num]) ([num])
   Proceeds from sale of fixed assets               [num]   [num]
   Investment in subsidiaries/associates           ([num]) ([num])
   Purchase of investments                         ([num]) ([num])
   Sale of investments                              [num]   [num]
   Interest received                                [num]   [num]
   Dividend received                                [num]   [num]
   [more investing items...]
   Net cash used in investing activities (B)       ([num]) ([num])

C. CASH FLOWS FROM FINANCING ACTIVITIES:
   Proceeds from issue of equity shares             [num]   [num]
   Proceeds from borrowings                         [num]   [num]
   Repayment of borrowings                         ([num]) ([num])
   Interest paid                                   ([num]) ([num])
   Dividends paid                                  ([num]) ([num])
   [more financing items...]
   Net cash from/(used in) financing activities (C) [num]  ([num])

Net increase/(decrease) in cash and cash equivalents (A+B+C)  [num]  [num]
Cash and cash equivalents at beginning of year               [num]  [num]
Cash and cash equivalents at end of year                     [num]  [num]

🔍 VALIDATION CHECKLIST (verify ALL before extracting):
✅ Has "Consolidated" in heading (NOT "Standalone")
✅ Has "(₹ in Crore)" or similar unit indicator
✅ Column header shows TWO years: March 31, 2025 and March 31, 2024
✅ Three main sections: Operating, Investing, Financing
✅ Each section has subtotal line
✅ Numbers in parentheses represent outflows (negative)
✅ Final reconciliation: Opening balance + Net change = Closing balance

🚨 RED FLAGS - SKIP THESE SECTIONS:
❌ Only shows one year of data (must have current + previous)
❌ Missing any of the three main sections (Operating/Investing/Financing)
❌ Shows quarterly data instead of annual ("Q1 FY25", "Quarter ended")
❌ Segment-wise cash flow breakdowns (by geography/product)
❌ Says "Standalone" anywhere in heading

EXTRACTION INSTRUCTIONS:

Extract from the VALIDATED Consolidated Cash Flow Statement table:

A. OPERATING ACTIVITIES:
   1. "Profit before tax" - Starting point
   2. Look for "Operating profit before working capital changes" OR "Cash generated from operations before tax"
   3. Extract "Cash generated from operations" (after working capital adjustments)
   4. Extract "Income taxes paid" (negative number in parentheses)
   5. Extract "Net cash from operating activities" (final line of section A)

B. INVESTING ACTIVITIES:
   1. Extract "Purchase of property, plant and equipment" (Capex - negative in parentheses)
   2. Extract "Purchase of intangible assets" if present (negative)
   3. Look for net investments: "Purchase of investments" minus "Sale of investments"
   4. Extract "Interest received" and "Dividend received"
   5. Extract "Net cash used in investing activities" (final line of section B - usually negative)

C. FINANCING ACTIVITIES:
   1. Extract "Proceeds from borrowings" (positive inflow)
   2. Extract "Repayment of borrowings" (negative outflow in parentheses)
   3. Extract "Interest paid" (negative in parentheses)
   4. Extract "Dividends paid" (negative in parentheses)
   5. Extract "Proceeds from issue of equity shares" if present
   6. Extract "Net cash from/(used in) financing activities" (final line of section C)

RECONCILIATION:
   • Extract "Net increase/(decrease) in cash and cash equivalents" (A+B+C)
   • Extract "Cash and cash equivalents at beginning of year"
   • Extract "Cash and cash equivalents at end of year"
   • VERIFY: Beginning + Net change = Ending (must match!)

NUMBER PARSING:
• Strip ALL commas: "12,345.67" → 12345.67
• Parentheses mean negative: "(1,234)" → -1234
• Ignore note references (small numbers < 100)
• All values in SAME unit (Crores OR Lakhs - check heading)

CRITICAL VALIDATION BEFORE RETURNING:
1. Cash flow reconciliation:
   - Opening Cash + (Operating Cash Flow + Investing Cash Flow + Financing Cash Flow) = Closing Cash
   - Example: 5,000 + (8,000 - 3,000 - 2,000) = 8,000 ✓

2. Operating cash flow reasonableness:
   - Should be positive for healthy companies
   - Compare to Profit Before Tax - should be similar magnitude
   - If Operating CF < 0 while PBT > 0, check for working capital drain

3. Free Cash Flow calculation:
   - Free Cash Flow = Operating Cash Flow - Capex
   - Capex = "Purchase of PPE" + "Purchase of intangible assets"
   - Example: 8,000 - 2,500 = 5,500 FCF ✓

4. Unit consistency:
   - ALL cash flow values in SAME scale (Crores OR Lakhs)
   - If Operating CF is 8,234.56, then Investing CF should be ~3,156.23 (same decimal format)
   - DO NOT mix: Operating CF = 82345.6 with Investing CF = 3156 (different scales)

IF YOU CANNOT FIND "Consolidated Statement of Cash Flows":
→ ❌ DO NOT extract from Standalone
→ ❌ DO NOT calculate or estimate
→ Return: "Consolidated Cash Flow Statement not found in document"
→ Set all cashFlow values to null
→ Continue with other extractions
i need thses prompt without missing in minimal

`;

                const insightsResponse = await callGeminiAPI(extractionPrompt, { temperature: 0.2, maxTokens: 200000 });
                
                // Debug: Log raw Gemini response
                console.log(`🔍 [DEBUG Annual] Response length:`, insightsResponse?.length);
                console.log(`🔍 [DEBUG Annual] Response preview:`, insightsResponse?.substring(0, 200));
                if (insightsResponse) {
                    const preview = insightsResponse.substring(0, 1200);
                    console.log(`📝 [Gemini Preview]:`, preview);
                    
                    // Debug: Check for null values in response
                    if (insightsResponse.includes('"totalAssets": { "current": null')) {
                        console.warn(`⚠️ [Debug] Gemini returned null for totalAssets - response contains null values`);
                    }
                }
                
                let extractedInsights = extractJSON(insightsResponse);
                console.log(`🔍 [DEBUG] extractedInsights:`, extractedInsights ? 'SUCCESS' : 'NULL - JSON parsing failed');
           if (!extractedInsights) {
    console.error(`❌ [JSON Parse] Failed to parse Gemini response`);
    console.error(`📄 [Response Length]:`, insightsResponse?.length);
    
    const cleaned = insightsResponse.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    const endsWithClosingBrace = cleaned.endsWith('}');
    
    if (!endsWithClosingBrace) {
        console.error(`⚠️ [Truncation Detected] Attempting simple recovery without audit...`);
        
        const auditStart = cleaned.lastIndexOf('"auditInformation"');
        
        if (auditStart > 0) {
            // SIMPLE STRATEGY: Find "keyOpportunities" field (before remuneration)
            // This is more reliable as it's always a simple array, not a complex object
            const opportunitiesEnd = cleaned.lastIndexOf('"keyOpportunities"');
            
            if (opportunitiesEnd > 0 && opportunitiesEnd < auditStart) {
                // Find the closing bracket of keyOpportunities array
                let bracketCount = 0;
                let foundOpenBracket = false;
                let arrayClose = -1;
                
                for (let i = opportunitiesEnd; i < auditStart; i++) {
                    if (cleaned[i] === '[') {
                        foundOpenBracket = true;
                        bracketCount++;
                    } else if (cleaned[i] === ']') {
                        bracketCount--;
                        if (foundOpenBracket && bracketCount === 0) {
                            arrayClose = i;
                            break;
                        }
                    }
                }
                
                if (arrayClose > 0) {
                    // Cut right after the keyOpportunities array closes
                    // This gives us everything except remuneration and audit
                    let salvaged = cleaned.substring(0, arrayClose + 1);
                    
                    // Simply close the root object
                    salvaged += '\n}';
                    
                    console.log(`✂️ [Cut after] keyOpportunities field`);
                    
                    try {
                        const salvagedData = JSON.parse(salvaged);
                        console.log(`✅ [Salvage Success] Recovered ${Object.keys(salvagedData).length} sections`);
                        console.log(`📊 [Recovered]:`, Object.keys(salvagedData).join(', '));
                                              // CRITICAL FIX: Assign to extractedInsights so it continues through validation
                        extractedInsights = salvagedData;
                        console.log(`🔄 [Salvage] Assigned salvaged data to extractedInsights - continuing through normal validation flow`);
                    } catch (e: any) {
                        console.error(`❌ [Simple Salvage Failed]:`, e.message);
                        console.error(`🔍 [Error Context]:`, e.message.includes('position') ? salvaged.substring(Math.max(0, parseInt(e.message.match(/\d+/)?.[0] || '0') - 50), parseInt(e.message.match(/\d+/)?.[0] || '0') + 50) : 'N/A');
                    }
                }
            }
            
            if (!extractedInsights) {
                console.error(`⚠️ [Ultimate Fallback] Could not salvage data - returning null`);
            }
        }
    }
}

// Continue with original validation flow - extractedInsights now contains salvaged data
if (extractedInsights) {
    // CRITICAL VALIDATION: Check if Gemini extracted Assets as Liabilities
    // This happens when it matches "Total equity and liabilities" instead of "Total liabilities"
    if (extractedInsights.balanceSheet?.assets?.totalAssets?.current &&
                        extractedInsights.balanceSheet?.liabilities?.totalLiabilities?.current) {
                        
                        const assets = extractedInsights.balanceSheet.assets.totalAssets.current;
                        const liabilities = extractedInsights.balanceSheet.liabilities.totalLiabilities.current;
                        
                        if (Math.abs(assets - liabilities) < 10) {
                            console.error(`❌ [Validation] CRITICAL ERROR: Liabilities (${liabilities}) = Assets (${assets})!`);
                            console.error(`   Gemini extracted "Total equity and liabilities" instead of "Total liabilities"`);
                            console.error(`   Nullifying liabilities to force recalculation...`);
                            
                            // Reset liabilities to null to trigger calculation
                            extractedInsights.balanceSheet.liabilities.totalLiabilities = {
                                current: null,
                                previous: null
                            };
                        }
                    }
                    
                    
                    // Calculate liabilities if missing (Assets - Equity = Liabilities)
                    if (extractedInsights.balanceSheet?.assets?.totalAssets?.current && 
                        extractedInsights.balanceSheet?.equity?.totalEquity?.current) {
                        
                        const assets = extractedInsights.balanceSheet.assets.totalAssets;
                        const equity = extractedInsights.balanceSheet.equity.totalEquity;
                        const liabilities = extractedInsights.balanceSheet.liabilities?.totalLiabilities;
                        
                        console.log(`🔍 [Check] Liabilities before calculation:`, liabilities);
                        
                        // Debug: Show balance sheet equation for verification
                        if (assets?.current && equity?.current) {
                            console.log(`📊 [Balance Sheet Equation]:`);
                            console.log(`   Assets (current): ${assets.current}`);
                            console.log(`   Equity (current): ${equity.current}`);
                            console.log(`   Liabilities (current): ${liabilities?.current || 'NULL'}`);
                            console.log(`   Expected Liabilities: ${assets.current - equity.current}`);
                            
                            if (liabilities?.current && liabilities.current > 0) {
                                const diff = Math.abs(assets.current - (equity.current + liabilities.current));
                                console.log(`   Equation Check: ${assets.current} = ${equity.current} + ${liabilities.current}`);
                                console.log(`   Difference: ${diff} (${((diff/assets.current)*100).toFixed(2)}%)`);
                            }
                        }
                        
                        if (!liabilities?.current || liabilities.current === null || liabilities.current === 0) {
                            const calculatedCurrent = assets.current - equity.current;
                            const calculatedPrevious = (assets.previous || 0) - (equity.previous || 0);
                            
                            console.warn(`⚠️ [Calculate] Liabilities NOT FOUND in report - calculating as fallback`);
                            console.warn(`   This may not match the actual reported value due to:`);
                            console.warn(`   - Minority interests, preferred shares, or other equity components`);
                            console.warn(`   - Rounding differences in the report`);
                            console.warn(`   - Different classification of hybrid instruments`);
                            console.log(`🔢 [Calculate] Liabilities = Assets - Equity`);
                            console.log(`   Current: ${assets.current} - ${equity.current} = ${calculatedCurrent}`);
                            console.log(`   Previous: ${assets.previous} - ${equity.previous} = ${calculatedPrevious}`);
                            
                            if (!extractedInsights.balanceSheet.liabilities) {
                                extractedInsights.balanceSheet.liabilities = {};
                            }
                            extractedInsights.balanceSheet.liabilities.totalLiabilities = {
                                current: calculatedCurrent,
                                previous: calculatedPrevious
                            };
                            
                            console.log(`✅ [Calculate] Set liabilities to:`, extractedInsights.balanceSheet.liabilities.totalLiabilities);
                        } else {
                            console.log(`✅ [Skip] Liabilities already has value:`, liabilities);
                        }
                    }
                    
                    annualReportInsights = extractedInsights;
                    console.log(`✅ [AI] Annual report insights extracted successfully (from OCR'd text)`);
                    
                    // Debug: Log balance sheet data structure
                    if (extractedInsights.balanceSheet) {
                        console.log(`📊 [Balance Sheet Debug]`);
                        console.log(`  Assets Total:`, extractedInsights.balanceSheet.assets?.totalAssets);
                        console.log(`  Liabilities Total:`, extractedInsights.balanceSheet.liabilities?.totalLiabilities);
                        console.log(`  Equity Total:`, extractedInsights.balanceSheet.equity?.totalEquity);
                        console.log(`  Revenue:`, extractedInsights.balanceSheet.profitAndLoss?.revenue);
                        
                        // CRITICAL: Validate balance sheet equation and data quality
                        const assets = extractedInsights.balanceSheet.assets?.totalAssets?.current || 0;
                        const equity = extractedInsights.balanceSheet.equity?.totalEquity?.current || 0;
                        const liabilities = extractedInsights.balanceSheet.liabilities?.totalLiabilities?.current || 0;
                        
                        // Validate equation: Assets = Equity + Liabilities (allow 2% tolerance for rounding)
                        const sum = equity + liabilities;
                        const diff = Math.abs(assets - sum);
                        const tolerance = assets * 0.02;
                        
                        if (diff > tolerance && assets > 0) {
                            console.error(`❌ BALANCE SHEET EQUATION WARNING!`);
                            console.error(`   Assets: ${assets}`);
                            console.error(`   Equity: ${equity}`);
                            console.error(`   Liabilities: ${liabilities}`);
                            console.error(`   Sum (E+L): ${sum}`);
                            console.error(`   Difference: ${diff} (tolerance: ${tolerance})`);
                            console.error(`   ⚠️ Note: Difference may be due to rounding, minority interests, or report structure`);
                        } else if (assets > 0) {
                            console.log(`✅ [Validation] Balance sheet equation verified: ${assets} ≈ ${equity} + ${liabilities} (diff: ${diff})`);
                        }
                        
                        // Validate data quality flags
                        const warnings: string[] = [];
                        
                        // Check for suspiciously small numbers (might be quarterly data)
                        if (assets > 0 && assets < 10000) {
                            warnings.push(`⚠️ Total Assets (${assets}) seems small - possible quarterly data instead of annual`);
                        }
                        
                        // Check for unit scale consistency
                        const hasDecimals = (n: number) => n % 1 !== 0;
                        const assetsHasDecimals = hasDecimals(assets);
                        const equityHasDecimals = hasDecimals(equity);
                        const liabilitiesHasDecimals = hasDecimals(liabilities);
                        
                        if (assetsHasDecimals !== equityHasDecimals || assetsHasDecimals !== liabilitiesHasDecimals) {
                            warnings.push(`⚠️ Unit scale inconsistency detected - Assets(${assets}), Equity(${equity}), Liabilities(${liabilities}) have mixed decimal formats`);
                        }
                        
                        // Check fiscal year extraction
                        const fiscalYear = extractedInsights.fiscalYear || 'Unknown';
                        if (!fiscalYear.includes('2025') && !fiscalYear.includes('2026')) {
                            warnings.push(`⚠️ Fiscal year (${fiscalYear}) seems outdated or incorrect`);
                        }
                        
                        // Check report type clarity
                        const reportType = extractedInsights.reportType || 'Unknown';
                        if (!reportType.toLowerCase().includes('standalone') && !reportType.toLowerCase().includes('consolidated')) {
                            warnings.push(`⚠️ Report type (${reportType}) is ambiguous - unclear if Standalone or Consolidated`);
                        }
                        
                        // Log all warnings
                        if (warnings.length > 0) {
                            console.warn(`\n🔍 [DATA QUALITY WARNINGS]`);
                            warnings.forEach(w => console.warn(`   ${w}`));
                            console.warn(`   Extracted Fiscal Year: ${fiscalYear}`);
                            console.warn(`   Extracted Report Type: ${reportType}`);
                            console.warn(`   Extracted Currency: ${extractedInsights.currency || 'Unknown'}`);
                        }
                    }
                    
                    
                    
                }
            } catch (extractError: any) {
                console.warn(`⚠️ [AI] Failed to extract annual report insights: ${extractError.message}`);
            }
        }

                if (annualReportInsights) {
            try {
                await connectToDatabase();
                
                const expiresAt = new Date();
                expiresAt.setMonth(expiresAt.getMonth() + 6); // 6 months from now
                
                await AnnualReportCache.findOneAndUpdate(
                    {
                        symbol: cleanSymbol,
                        fiscalYear: annualReportInsights.fiscalYear,
                        reportType: annualReportInsights.reportType || 'Consolidated'
                    },
                    {
                        $set: {
                            data: annualReportInsights,
                            rawPdfUrl: screenerData.annualReport?.url || '',
                            source: 'BSE India via Screener.in',
                            fetchedAt: new Date(),
                            expiresAt: expiresAt
                        }
                    },
                    { upsert: true, new: true }
                );
            
                console.log(`💾 [MongoDB] Saved ${cleanSymbol} FY${annualReportInsights.fiscalYear} (6-month TTL)`);
            } catch (dbSaveError: any) {
                // Don't fail the request if DB save fails - data still works
                console.warn(`⚠️ [MongoDB] Save failed (non-critical): ${dbSaveError.message}`);
            }
        }
    
        // Cache the results
        batchDataCache.set(cleanSymbol, { transcript: rawTranscript, annualReport, quarter, annualReportInsights });
        
    
        return {
            transcript: rawTranscript,
            annualReport: annualReport,
            annualReportInsights: annualReportInsights,
            quarterlyInsights: quarterlyInsights,
            fromCache: annualFromCache && quarterlyFromCache,
            quarter: quarter,
            source: 'Screener.in Direct + BSE India PDF',
            screenerSource: true
        };
        
        
 } catch (error: any) {
        console.error(`❌ [Comprehensive Data] Failed:`, error.message);
        
        return {
            transcript: '',
            annualReport: '',
            annualReportInsights: null,
            quarterlyInsights: null,
            fromCache: false,
            quarter: 'Unknown',
            source: 'Error',
            error: error.message
        };
    }
}



function generateLongTermChart(
    currentPrice: number, 
    expectedPrice: number, 
    conservativePrice: number, 
    optimisticPrice: number
) {
    const longTermData = [];
    const months = 6;
    
    for (let i = 0; i <= months; i++) {
        const progress = i / months;
        
        // Calculate prices for each scenario
        const expected = currentPrice + (expectedPrice - currentPrice) * progress;
        const conservative = currentPrice + (conservativePrice - currentPrice) * progress;
        const optimistic = currentPrice + (optimisticPrice - currentPrice) * progress;
        
        longTermData.push({
            month: i === 0 ? 'Now' : `M${i}`,
            expected: parseFloat(expected.toFixed(2)),
            conservative: parseFloat(conservative.toFixed(2)),
            optimistic: parseFloat(optimistic.toFixed(2)),
            type: i === 0 ? 'current' : 'forecast'
        });
    }
    
    return longTermData;
}

// ========================
// HELPER: BUILD COMPLETE STOCK DATA WITH FULL AI ANALYSIS
// ========================

async function buildStockData(symbol: string, fundamentals: any, skipAI: boolean = false, forceRefresh: boolean = false, forceRefreshQuarterly: boolean = false) {
    try {
        console.log(`🔨 [Build] Constructing complete stock data for ${symbol}...`);
        
        // Check cache first
        const cached = getCachedPrediction(symbol, skipAI ? 'price' : 'full');
        if (cached) {
            console.log(`💾 [Cache HIT] Returning cached stock data`);
            return cached.data;
        }
        
        // 1. Fetch current price from Yahoo Finance
        const yahooResponse = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
        );
        const yahooData = await yahooResponse.json();
        
        if (!yahooData.chart?.result?.[0]) {
            throw new Error('Unable to fetch price data');
        }
        
        const result = yahooData.chart.result[0];
        const meta = result.meta;
        const currentPrice = meta.regularMarketPrice;
        const previousClose = meta.previousClose || meta.chartPreviousClose;
        const change = currentPrice - previousClose;
        const changePercent = (change / previousClose) * 100;
        const currency = meta.currency || 'USD';
        
        console.log(`💰 [Price] ${symbol}: ${currentPrice} ${currency} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
        
        // 2. For Indian stocks, fetch comprehensive data (quarterly transcripts + annual reports)
        let comprehensiveData = null;
        const isIndianStock = symbol.endsWith('.NS') || symbol.endsWith('.BO');
        
        if (isIndianStock) {
            console.log(`📊 [Comprehensive] Fetching quarterly transcripts and annual reports using Gemini...`);
            try {
                    comprehensiveData = await mcpGetIndianComprehensiveData(symbol,forceRefresh,forceRefreshQuarterly);
    console.log(`🔍 [DEBUG] Raw comprehensiveData:`, comprehensiveData);
    console.log(`🔍 [DEBUG] Type:`, typeof comprehensiveData);
    console.log(`🔍 [DEBUG] Is null:`, comprehensiveData === null);
    console.log(`🔍 [DEBUG] Is undefined:`, comprehensiveData === undefined);
    console.log(`🔍 [DEBUG] comprehensiveData keys:`, Object.keys(comprehensiveData || {}));
    console.log(`🔍 [DEBUG] annualReportInsights exists:`, !!comprehensiveData?.annualReportInsights);
    console.log(`🔍 [DEBUG] annualReportInsights value:`, comprehensiveData?.annualReportInsights);
    console.log(`🔍 [DEBUG] quarterlyInsights exists:`, !!comprehensiveData?.quarterlyInsights);
} catch (compError: any) {
    console.warn(`⚠️ [Comprehensive] Failed: ${compError.message}`);
    console.error(`🔍 [DEBUG] Full error:`, compError);

            }
        }
        
        // 3. Generate AI predictions (unless skipAI)
        let predictions = null;
        if (!skipAI) {
            console.log(`🤖 [AI Analysis] Generating comprehensive predictions for ${symbol}...`);
            
            // Build comprehensive prompt with all available data
            let analysisPrompt = `Analyze ${symbol} stock comprehensively.

CURRENT MARKET DATA:
- Current Price: ${currentPrice} ${currency}
- Change: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%
- Previous Close: ${previousClose}

FUNDAMENTALS:
- PE Ratio: ${fundamentals.peRatio || 'N/A'}
- ROE: ${fundamentals.roe ? (fundamentals.roe * 100).toFixed(2) + '%' : 'N/A'}
- Market Cap: ${fundamentals.marketCap ? (fundamentals.marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}
- Debt/Equity: ${fundamentals.debtToEquity || 'N/A'}
- Operating Margin: ${fundamentals.operatingMargin ? (fundamentals.operatingMargin * 100).toFixed(2) + '%' : 'N/A'}
- Profit Margin: ${fundamentals.profitMargin ? (fundamentals.profitMargin * 100).toFixed(2) + '%' : 'N/A'}
- Revenue Growth: ${fundamentals.revenueGrowth || fundamentals.salesGrowth3Y || 'N/A'}`;

            if (comprehensiveData && comprehensiveData.transcript) {
                analysisPrompt += `\n\nRECENT QUARTERLY EARNINGS (${comprehensiveData.quarter}):\n${comprehensiveData.transcript.substring(0, 3000)}`;
                analysisPrompt += `\n⚠️ NOTE: Use quarterly earnings for SHORT-TERM sentiment/momentum analysis only.`;
            }
            
            if (comprehensiveData && comprehensiveData.annualReportInsights) {
                // Use structured annual report insights (already validated)
                const insights = comprehensiveData.annualReportInsights;
                const bs = insights.balanceSheet;
                
                analysisPrompt += `\n\nVALIDATED ANNUAL BALANCE SHEET (${insights.fiscalYear} - ${insights.reportType}):\n`;
                analysisPrompt += `Currency: ${insights.currency}\n`;
                
                if (bs) {
                    analysisPrompt += `Assets:\n`;
                    analysisPrompt += `  - Non-Current Assets: ${bs.assets?.nonCurrent?.total?.current || 'N/A'}\n`;
                    analysisPrompt += `  - Current Assets: ${bs.assets?.current?.total?.current || 'N/A'}\n`;
                    analysisPrompt += `  - TOTAL ASSETS: ${bs.assets?.totalAssets?.current || 'N/A'}\n`;
                    
                    analysisPrompt += `Equity:\n`;
                    analysisPrompt += `  - Equity Share Capital: ${bs.equity?.equityShareCapital?.current || 'N/A'}\n`;
                    analysisPrompt += `  - Other Equity/Reserves: ${bs.equity?.otherEquity?.current || 'N/A'}\n`;
                    analysisPrompt += `  - TOTAL EQUITY: ${bs.equity?.totalEquity?.current || 'N/A'}\n`;
                    
                    analysisPrompt += `Liabilities:\n`;
                    analysisPrompt += `  - Non-Current Liabilities: ${bs.liabilities?.nonCurrent?.total?.current || 'N/A'}\n`;
                    analysisPrompt += `  - Current Liabilities: ${bs.liabilities?.current?.total?.current || 'N/A'}\n`;
                    analysisPrompt += `  - TOTAL LIABILITIES: ${bs.liabilities?.totalLiabilities?.current || 'N/A'}\n`;
                    
                    analysisPrompt += `Profit & Loss (Full Year ${insights.fiscalYear}):\n`;
                    analysisPrompt += `  - Revenue: ${bs.profitAndLoss?.revenue?.current || 'N/A'}\n`;
                    analysisPrompt += `  - Profit Before Tax: ${bs.profitAndLoss?.profitBeforeTax?.current || 'N/A'}\n`;
                    analysisPrompt += `  - Profit After Tax: ${bs.profitAndLoss?.profitAfterTax?.current || 'N/A'}\n`;
                    analysisPrompt += `  - EPS: ${bs.profitAndLoss?.eps?.current || 'N/A'}\n`;
                }
                
                if (insights.businessModel) {
                    analysisPrompt += `\nBusiness Model Summary:\n${insights.businessModel.substring(0, 500)}...\n`;
                }
                
                if (insights.futureStrategy) {
                    analysisPrompt += `\nFuture Strategy Summary:\n${insights.futureStrategy.substring(0, 500)}...\n`;
                }
                
                analysisPrompt += `\n✅ Use ONLY these annual balance sheet numbers for fundamental analysis.`;
                analysisPrompt += `\n❌ DO NOT mix quarterly balance sheet data from earnings transcript.`;
            } else if (comprehensiveData && comprehensiveData.annualReport) {
                // Fallback to raw text if structured extraction failed
                analysisPrompt += `\n\nANNUAL REPORT (Raw Text - First 2000 chars):\n${comprehensiveData.annualReport.substring(0, 2000)}`;
                analysisPrompt += `\n⚠️ NOTE: Extract ANNUAL balance sheet only, not quarterly data.`;
            }

            analysisPrompt += `\n\nIMPORTANT ANALYSIS GUIDELINES:
- SHORT-TERM (1-2 weeks, 1 month): Use technical analysis, price patterns, momentum, market sentiment
- LONG-TERM (3 months, 6 months): IGNORE technical analysis. Focus ONLY on:
  * Fundamental metrics (ROE, profit margins, debt levels, cash flows)
  * Business quality and competitive advantages
  * Management quality and capital allocation
  * Industry trends and market positioning
  * Quarterly earnings insights and guidance
  * Annual report strategic initiatives
  * Growth trajectory and sustainability
  
Provide detailed analysis in this EXACT JSON format:
{
  "shortTerm": {"price": 0, "change": 0, "changePercent": 0, "timeframe": "1-2 weeks"},
  "oneMonth": {"expected": 0, "conservative": 0, "optimistic": 0, "change": 0, "changePercent": 0},
  "threeMonth": {"expected": 0, "conservative": 0, "optimistic": 0, "change": 0, "changePercent": 0},
  "sixMonth": {"expected": 0, "conservative": 0, "optimistic": 0, "change": 0, "changePercent": 0, "avgDailyReturn": 0},
  "tradingSignal": {
    "signal": "BUY|SELL|HOLD|STRONG_BUY|STRONG_SELL",
    "strength": "Strong|Medium|Weak",
    "description": "Brief rationale based on fundamentals and business quality",
    "reasons": ["fundamental reason 1", "business quality reason 2", "growth/risk reason 3"]
  },
  "supportResistance": {
    "support1": 0, "support2": 0, "support3": 0,
    "resistance1": 0, "resistance2": 0, "resistance3": 0
  },
  "bulletPoints": ["fundamental insight 1", "earnings/report insight 2", "competitive position 3", "growth outlook 4", "risk factor 5"]
}`;

            try {
                // Use Gemini only (FREE with large context window)
                console.log(`🤖 [Gemini] Generating AI predictions...`);
                const aiResponse = await callGeminiAPI(analysisPrompt, { temperature: 0.2, maxTokens: 10000 });
                console.log(`✅ [Gemini] Response received (${aiResponse.length} chars)`);
                
                // extractJSON returns parsed object directly, not a string
                const extractedJson = extractJSON(aiResponse);
                if (extractedJson) {
                    predictions = extractedJson;
                    console.log(`✅ [AI] Complete predictions generated with ${comprehensiveData ? 'quarterly + annual report' : 'fundamentals only'} analysis`);
                } else {
                    console.error(`❌ [JSON Extract] No JSON found in AI response`);
                    console.log(`📄 [Debug] AI Response (first 500 chars):`, aiResponse.substring(0, 500));
                    throw new Error('No JSON found in AI response');
                }
            } catch (aiError: any) {
                console.warn(`⚠️ [Gemini] Prediction generation failed: ${aiError.message}`);
                console.log(`🔄 [Fallback] Using intelligent default predictions`);
                predictions = getDefaultPredictions(currentPrice);
            }
        } else {
            console.log(`⚡ [Skip AI] Using cached/default predictions for fast response`);
            predictions = getDefaultPredictions(currentPrice);
        }
        
        // 4. Build chart data with realistic historical simulation
        const chartData = [];
        for (let i = 0; i < 7; i++) {
            const historicalVariation = (Math.random() - 0.5) * currentPrice * 0.015;
            chartData.push({
                time: i === 0 ? 'Now' : i < 4 ? `-${4-i}d` : `+${i-3}d`,
                current: i < 4 ? currentPrice + historicalVariation : undefined,
                predicted: i >= 4 ? predictions.shortTerm.price + (i-4) * (predictions.shortTerm.change / 3) : undefined,
                type: (i < 4 ? 'historical' : 'prediction') as 'historical' | 'prediction'
            });
        }
        
        const longTermChartData = generateLongTermChart(
            currentPrice,
            predictions.sixMonth.expected,
            predictions.sixMonth.conservative,
            predictions.sixMonth.optimistic
        );
        
        // 5. Construct complete StockData object
        const stockData = {
            type: 'stock' as const,
            symbol: symbol,
            current: {
                price: currentPrice,
                change: change,
                changePercent: changePercent,
                currency: currency,
                marketState: meta.marketState || 'REGULAR'
            },
            shortTermPrediction: {
                price: predictions.shortTerm.price,
                change: predictions.shortTerm.change,
                changePercent: predictions.shortTerm.changePercent,
                timeframe: predictions.shortTerm.timeframe
            },
            oneMonthPrediction: {
                expectedPrice: predictions.oneMonth.expected,
                conservativePrice: predictions.oneMonth.conservative,
                optimisticPrice: predictions.oneMonth.optimistic,
                change: predictions.oneMonth.change,
                changePercent: predictions.oneMonth.changePercent,
                timeframe: '1 Month'
            },
            threeMonthPrediction: {
                expectedPrice: predictions.threeMonth.expected,
                conservativePrice: predictions.threeMonth.conservative,
                optimisticPrice: predictions.threeMonth.optimistic,
                change: predictions.threeMonth.change,
                changePercent: predictions.threeMonth.changePercent,
                timeframe: '3 Months'
            },
            longTermPrediction: {
                expectedPrice: predictions.sixMonth.expected,
                conservativePrice: predictions.sixMonth.conservative,
                optimisticPrice: predictions.sixMonth.optimistic,
                change: predictions.sixMonth.change,
                changePercent: predictions.sixMonth.changePercent,
                timeframe: '6 Months',
                avgDailyReturn: predictions.sixMonth.avgDailyReturn
            },
            tradingSignal: predictions.tradingSignal,
            supportResistance: predictions.supportResistance,
            chartData: chartData,
            longTermChartData: longTermChartData,
            bulletPoints: predictions.bulletPoints,
            fundamentals: fundamentals,
            aiIntelligence: !skipAI ? {
                shortTermConfidence: predictions.tradingSignal?.strength || 'Medium',
                longTermConfidence: predictions.tradingSignal?.strength || 'Medium',
                analysisTimestamp: new Date().toISOString(),
                hasAIAnalysis: true
            } : null,
            metadata: {
                exchange: symbol.includes('.NS') ? 'NSE' : symbol.includes('.BO') ? 'BSE' : meta.exchangeName || 'Unknown',
                previousClose: previousClose,
                timestamp: new Date().toISOString()
            },
            // Add comprehensive data if available (quarterly transcripts + annual reports)
            ...(comprehensiveData?.annualReportInsights && {
    annualReport: {
        fiscalYear: comprehensiveData.annualReportInsights.fiscalYear || 'Latest',
        companyName: comprehensiveData.annualReportInsights.companyName,
        reportType: comprehensiveData.annualReportInsights.reportType,
        summary: comprehensiveData.annualReportInsights.summary,
        businessModel: comprehensiveData.annualReportInsights.businessModel,
        futureStrategy: comprehensiveData.annualReportInsights.futureStrategy,
        keyHighlights: comprehensiveData.annualReportInsights.keyHighlights,
        balanceSheet: comprehensiveData.annualReportInsights.balanceSheet,
        cashFlow: comprehensiveData.annualReportInsights.cashFlow,
        remuneration: comprehensiveData.annualReportInsights.remuneration,
        auditInformation: comprehensiveData.annualReportInsights.auditInformation,

        source: comprehensiveData.source || 'BSE India',
        fromCache: comprehensiveData.fromCache
    }
}),
// Add quarterly transcript separately
...(comprehensiveData?.quarterlyInsights && {
    quarterlyReport: {
        quarter: comprehensiveData.quarterlyInsights.quarter || comprehensiveData.quarter,
        keyMetrics: comprehensiveData.quarterlyInsights.keyMetrics,
        managementCommentary: comprehensiveData.quarterlyInsights.managementCommentary,
        segmentPerformance: comprehensiveData.quarterlyInsights.segmentPerformance,
        financialRatios: comprehensiveData.quarterlyInsights.financialRatios,
        cashFlow: comprehensiveData.quarterlyInsights.cashFlow,
        outlook: comprehensiveData.quarterlyInsights.outlook,
        competitivePosition: comprehensiveData.quarterlyInsights.competitivePosition,
        summary: comprehensiveData.quarterlyInsights.summary,
        source: comprehensiveData.source || 'Screener.in',
        fromCache: comprehensiveData.fromCache
    }
})
        };
        
        // Cache the result
        setCachedPrediction(symbol, stockData);
        
        console.log(`✅ [Build] Complete stock data constructed for ${symbol}`);
        console.log(`📊 [Summary] Includes: Fundamentals (${fundamentals.source}), Price (Yahoo), AI Predictions (${skipAI ? 'Defaults' : 'Full Analysis'})${comprehensiveData ? ', Quarterly Reports (Gemini), Annual Report' : ''}`);
        
        return stockData;
        
    } catch (error: any) {
        console.error(`❌ [Build] Failed to construct stock data:`, error.message);
        throw error;
    }
}

// Helper function for default predictions when AI fails or is skipped
function getDefaultPredictions(currentPrice: number) {
    return {
        shortTerm: {
            price: currentPrice * 1.02,
            change: currentPrice * 0.02,
            changePercent: 2.0,
            timeframe: '1-2 weeks'
        },
        oneMonth: {
            expected: currentPrice * 1.05,
            conservative: currentPrice * 1.02,
            optimistic: currentPrice * 1.08,
            change: currentPrice * 0.05,
            changePercent: 5.0
        },
        threeMonth: {
            expected: currentPrice * 1.10,
            conservative: currentPrice * 1.05,
            optimistic: currentPrice * 1.15,
            change: currentPrice * 0.10,
            changePercent: 10.0
        },
        sixMonth: {
            expected: currentPrice * 1.15,
            conservative: currentPrice * 1.08,
            optimistic: currentPrice * 1.22,
            change: currentPrice * 0.15,
            changePercent: 15.0,
            avgDailyReturn: 0.08
        },
        tradingSignal: {
            signal: 'HOLD',
            strength: 'Medium',
            description: 'Neutral market conditions',
            reasons: ['Awaiting further data', 'Market volatility']
        },
        supportResistance: {
            support1: currentPrice * 0.98,
            support2: currentPrice * 0.95,
            support3: currentPrice * 0.92,
            resistance1: currentPrice * 1.02,
            resistance2: currentPrice * 1.05,
            resistance3: currentPrice * 1.08
        },
        bulletPoints: [
            'Data analysis in progress',
            'Current price levels stable',
            'Monitor market trends'
        ]
    };
}

// ========================
// MAIN API ROUTE HANDLER
// ========================

export async function POST(request: NextRequest) {
    try {
        const { query, model, conversation, skipAI, forceRefresh , forceRefreshQuarterly} = await request.json();
        
        if (!query) {
            return NextResponse.json({ error: 'Query required' }, { status: 400 });
        }

        console.log(`🔍 [API] Processing query: "${query}"${skipAI ? ' (skipAI=true)' : ''}${forceRefresh ? ' (forceRefresh=true)' : ''}${forceRefreshQuarterly ? ' (forceRefreshQuarterly=true)' : ''}`);

        // Extract stock symbol from query
        const symbolMatch = query.match(/([A-Z0-9]+(?:\.[A-Z]+)?)/i);
        if (!symbolMatch) {
            return NextResponse.json({
                response: 'Please provide a valid stock symbol',
                realtimeData: null
            });
        }

        const symbol = symbolMatch[1].toUpperCase();
        console.log(`📊 [Symbol] Detected: ${symbol}`);

        // Determine if it's an Indian stock
        const isIndianStock = symbol.endsWith('.NS') || symbol.endsWith('.BO');

        try {
            // Fetch fundamentals
            let fundamentals;
            if (isIndianStock) {
                console.log(`🇮🇳 [Indian Stock] Fetching fundamentals for ${symbol}`);
                fundamentals = await mcpGetIndianFundamentals(symbol, skipAI || false);
            } else {
                console.log(`🌎 [Global Stock] Fetching fundamentals for ${symbol}`);
                fundamentals = await mcpGetFundamentals(symbol, skipAI || false);
            }

            if (!fundamentals) {
                throw new Error('Unable to fetch fundamentals data');
            }

            // Build complete stock data with predictions
           const stockData = await buildStockData(symbol, fundamentals, skipAI || false, forceRefresh || false);

            console.log(`✅ [Success] Returning stock data for ${symbol}`);
            return NextResponse.json({
                response: `Stock data for ${symbol}`,
                realtimeData: stockData
            });

        } catch (fetchError: any) {
            console.error(`❌ [Fetch Error] ${symbol}:`, fetchError.message);
            return NextResponse.json({
                response: `Unable to fetch data for ${symbol}: ${fetchError.message}`,
                realtimeData: null,
                error: fetchError.message
            }, { status: 500 });
        }

    } catch (error: any) {
        console.error('❌ [API Error]:', error);
        return NextResponse.json(
            { error: 'Internal server error', message: error.message },
            { status: 500 }
        );
    }
}
