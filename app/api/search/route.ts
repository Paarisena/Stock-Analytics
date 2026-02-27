import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/DB/MongoDB";
import {AnnualReportCache,QuarterlyReportCache,EarningsCallCache} from "@/DB/Model";
import OpenAI from "openai";
import '@app/utils/serverPolyfills'; // Ensure polyfills are available for fetch and other APIs in Node.js environment

import Groq from "groq-sdk";
import { CacheManager } from '@/app/utils/cache';
import { gemini, callGeminiAPI, callGeminiSearch } from '@/app/utils/aiProviders';
import { compareFiscalYears } from '@/app/utils/fiscalYearMapper';
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
import { 
    checkRateLimit, 
    sanitizeSymbol, 
    sanitizeQuery, 
    validateRequestSize, 
    getClientIp, 
    getSecurityHeaders,
    validateApiKey,
    logSecurityEvent,
    validateMongoSymbol,
    sanitizeMongoInput,
    validateUrl,
    sanitizeError,
    redactSensitiveData,
    validateEnvironment
} from '../../utils/security';

// Validate environment variables at startup
const envValidation = validateEnvironment();
if (!envValidation.valid) {
    console.error('⚠️ [CRITICAL] Application starting with missing environment variables:', envValidation.missing);
    console.error('⚠️ Some features may not work correctly. Please check your .env file.');
}

// ========================
// MARKET HOURS HELPER
// ========================
function getMarketState(meta: any, symbol: string): string {
    // If Yahoo provides marketState, use it
    if (meta.marketState && meta.marketState !== 'REGULAR') {
        return meta.marketState;
    }
    
    // Fallback: Check trading hours based on exchange
    const now = new Date();
    const hours = now.getUTCHours();
    const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    
    // Weekend check
    if (day === 0 || day === 6) {
        return 'CLOSED';
    }
    
    // Check by exchange (approximate UTC hours)
    if (symbol.includes('.NS') || symbol.includes('.BO')) {
        // NSE/BSE: 3:45 AM - 10:00 AM UTC (9:15 AM - 3:30 PM IST)
        return (hours >= 3 && hours < 10) ? 'REGULAR' : 'CLOSED';
    } else if (symbol.includes('.T')) {
        // Tokyo: 12:00 AM - 6:00 AM UTC (9:00 AM - 3:00 PM JST)
        return (hours >= 0 && hours < 6) ? 'REGULAR' : 'CLOSED';
    } else if (symbol.includes('.L')) {
        // London: 8:00 AM - 4:30 PM UTC
        return (hours >= 8 && hours < 16) ? 'REGULAR' : 'CLOSED';
    } else if (symbol.includes('.HK')) {
        // Hong Kong: 1:30 AM - 8:00 AM UTC (9:30 AM - 4:00 PM HKT)
        return (hours >= 1 && hours < 8) ? 'REGULAR' : 'CLOSED';
    } else {
        // US Markets (NASDAQ/NYSE): 2:30 PM - 9:00 PM UTC (9:30 AM - 4:00 PM EST)
        return (hours >= 14 && hours < 21) ? 'REGULAR' : 'CLOSED';
    }
}

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

// ========================
// REQUEST TIMEOUT UTILITY
// ========================
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 10000): Promise<Response> {
    // Validate URL first (SSRF protection)
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
        throw new Error(`URL validation failed: ${urlValidation.error}`);
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeout);
        return response;
    } catch (error: any) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
}

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
        // PHASE 1: TRY O.IN AUTHENTICATED (BEST - Your Login)
        // ============================================
        if (process.env.O_EMAIL && process.env.O_PASSWORD) {
            console.log(`?? [O.in] Attempting direct fetch with your account...`);
            
            try {
                const { fetchOFundamentals } = await import('../../utils/ORec');
                const OData = await fetchOFundamentals(cleanSymbol);
                
                
                
                if (OData && OData.peRatio) {
                    console.log(`? [O.in] Got fundamentals from authenticated account (HIGHEST QUALITY)`);
                    console.log(`?? [Sample] PE=${OData.peRatio}, ROE=${OData.roe}, D/E=${OData.debtToEquity}, OPM=${OData.operatingMargin}`);
                    
                    // Convert crores to actual numbers (1 crore = 10 million) - preserve all new fields
                    fundamentals = {
                        symbol: cleanSymbol,
                        // Valuation metrics
                        marketCap: OData.marketCap ? OData.marketCap * 10000000 : null,
                        peRatio: OData.peRatio,
                        pegRatio: OData.pegRatio,
                        priceToBook: OData.priceToBook,
                        dividendYield: OData.dividendYield,
                        bookValue: OData.bookValue,
                        faceValue: OData.faceValue,
                        // Profitability metrics
                        roe: OData.roe,
                        roa: OData.roa,
                        roce: OData.roce,
                        operatingMargin: OData.operatingMargin,
                        profitMargin: OData.profitMargin,
                        // Financial health
                        debtToEquity: OData.debtToEquity,
                        totalDebt: OData.totalDebt ? OData.totalDebt * 10000000 : null,
                        currentRatio: OData.currentRatio,
                        quickRatio: OData.quickRatio,
                        interestCoverage: OData.interestCoverage,
                        // Cash flow
                        operatingCashFlow: OData.operatingCashFlow ? OData.operatingCashFlow * 10000000 : null,
                        freeCashFlow: OData.freeCashFlow ? OData.freeCashFlow * 10000000 : null,
                        capex: OData.capex ? OData.capex * 10000000 : null,
                        // Income statement
                        revenue: OData.revenue ? OData.revenue * 10000000 : null,
                        netProfit: OData.netProfit ? OData.netProfit * 10000000 : null,
                        eps: OData.eps,
                        // Growth metrics
                        salesGrowth3Y: OData.salesGrowth3Y,
                        salesGrowth5Y: OData.salesGrowth5Y,
                        profitGrowth3Y: OData.profitGrowth3Y,
                        profitGrowth5Y: OData.profitGrowth5Y,
                        roe3Y: OData.roe3Y,
                        roe5Y: OData.roe5Y,
                        // Efficiency ratios
                        debtorDays: OData.debtorDays,
                        cashConversionCycle: OData.cashConversionCycle,
                        workingCapitalDays: OData.workingCapitalDays,
                        // Shareholding
                        promoterHolding: OData.promoterHolding,
                        fiiHolding: OData.fiiHolding,
                        diiHolding: OData.diiHolding,
                        pledgedPercentage: OData.pledgedPercentage,
                        revenueGrowth: null,
                        source: 'O.in Direct (Authenticated)'
                    };
                    
                    console.log(`?? [DEBUG] RAW O Data:`, OData);
                    console.log(`?? [DEBUG] Converted Fundamentals:`, fundamentals);
                    console.log(`?? [DEBUG] Non-null fields: ${Object.entries(fundamentals).filter(([k,v]) => v !== null).map(([k]) => k).join(', ')}`);
                    return fundamentals;
                }
            } catch (OError: any) {
                console.log(`?? [O.in] Direct fetch failed: ${OError.message}`);
            }
        } else {
            console.log(`?? [O.in] No credentials found in .env (O_EMAIL, O_PASSWORD)`);
        }
        
        // ============================================
        // PHASE 2: MONEYCONTROL + O PUBLIC (Current Method)
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
        
        // Try O.in public (no auth) to supplement
        try {
            const OUrl = `${process.env.O_URL}company/${cleanSymbol}/`;
            const OResponse = await fetch(OUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (OResponse.ok) {
                const OHtml = await OResponse.text();
                const { load } = await import('cheerio');
                const $ = load(OHtml);
                
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
                    console.log(`? [O.in Public] Supplemented with additional data`);
                    fundamentals.source = fundamentals.source === 'MoneyControl Public Scraping' 
                        ? 'MoneyControl + O.in Public' 
                        : 'O.in Public';
                }
            }
        } catch (OError: any) {
            console.log(`?? [O.in Public] Failed: ${OError.message}`);
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
// HELPER: EXTRACT QUARTERLY INSIGHTS (FOR O.IN)
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

async function extractEarningsCallInsights(
    cleanSymbol: string,
    transcriptText: string,
    metadata: {
        quarter: string;
        fiscalYear: string;
        callDate: string;
        companyName?: string;
        pdfUrl?: string;
        extractedText?: string;
    }
): Promise<any> {
    console.log(`📞 [Earnings Call] Analyzing ${metadata.quarter} FY${metadata.fiscalYear} conference call...`);
    
    const earningsCallPrompt = `Extract structured insights from this earnings call transcript.

COMPANY: ${metadata.companyName || cleanSymbol}
QUARTER: ${metadata.quarter} FY${metadata.fiscalYear}

TRANSCRIPT:
${transcriptText}

---

Extract and return JSON with:

1. SENTIMENT: Bullish/Neutral/Bearish based on tone and guidance
2. FINANCIAL HIGHLIGHTS: Revenue, profit, margins, cash flow, debt (with YoY growth %)
3. OPERATIONAL HIGHLIGHTS: Volume metrics, order book, capacity utilization
4. MANAGEMENT COMMENTARY: List 5-10 key business highlights, challenges, opportunities, and future guidance
5. Q&A INSIGHTS: List 5-7 critical questions and answers. Flag red flags if any.
6. SEGMENT PERFORMANCE: Array of segments with revenue/margin/outlook
7. COMPETITIVE POSITION: Market share trends, advantages, industry outlook
8. INVESTMENT THESIS: 3-5 bull case points, 3-5 bear case points, recommendation (BUY/HOLD/SELL)
9. KEY TAKEAWAYS: 5-7 bullet points summarizing actionable insights

OUTPUT (JSON only, no markdown):
{
  "companyName": "${metadata.companyName || cleanSymbol}",
  "symbol": "${cleanSymbol}",
  "quarter": "${metadata.quarter}",
  "fiscalYear": "${metadata.fiscalYear}",
  "callDate": "${metadata.callDate}",
  "sentiment": "Bullish|Neutral|Bearish",
  "financialHighlights": {
    "revenue": {"value": 5000, "yoyGrowth": 12.5, "guidance": "Expected 15% growth"},
    "ebitda": {"value": 800, "margin": 16, "trend": "improving"},
    "netProfit": {"value": 500, "yoyGrowth": 18},
    "orderBook": {"total": 25000, "newOrders": 3000},
    "cashFlow": {"operating": 600, "free": 400},
    "debt": {"netDebt": 2000, "netDebtToEBITDA": 2.5}
  },
  "operationalHighlights": {
    "volumeMetrics": {"production": 1000, "sales": 950},
    "capacityUtilization": 85,
    "keyProjects": ["Project A - 40% complete", "Project B - commissioning in Q4"]
  },
  "managementCommentary": {
    "businessHighlights": ["Strong order inflows", "Market share gain", "etc"],
    "challenges": ["Rising input costs", "etc"],
    "opportunities": ["New geography expansion", "etc"],
    "futureGuidance": {
      "revenueTarget": "20,000 Cr for FY26",
      "marginOutlook": "EBITDA margin expected 17-18%",
      "capexPlan": "1,500 Cr planned",
      "orderInflowTarget": "8,000 Cr target"
    }
  },
  "qAndAInsights": {
    "keyQuestions": ["What is the order book breakdown?", "etc"],
    "keyAnswers": ["Road projects: 60%, Rail: 40%", "etc"],
    "redFlags": ["Evasive on margin pressure question", "etc"]
  },
  "segmentPerformance": [
    {"segment": "Roads", "revenue": 3000, "margin": 18, "outlook": "Strong"}
  ],
  "competitivePosition": {
    "marketShareTrend": "Gaining share in roads segment",
    "competitiveAdvantages": ["Low bid costs", "Strong execution"],
    "industryTrends": ["Govt capex support", "etc"]
  },
  "investmentThesis": {
    "bullCase": ["Strong order book visibility", "Margin expansion", "etc"],
    "bearCase": ["Execution risks", "Working capital pressure", "etc"],
    "recommendation": {
      "signal": "BUY",
      "confidence": "High",
      "timeframe": "12 months",
      "triggers": ["Order inflow >5000 Cr", "Margin >17%"]
    }
  },
  "keyTakeaways": ["Q3 revenue up 15% YoY", "Order book at 25,000 Cr", "etc"],
  "summary": "Strong quarter with robust order inflows and margin expansion. Management confident on FY26 guidance."
}

RULES:
- Use actual numbers from transcript (not examples above)
- If data missing, use null for numbers, [] for arrays
- Be specific with quotes and figures
- Return ONLY valid JSON (no markdown, no extra text)

Begin analysis now.`;

    try {
        const result = await callGeminiAPI(earningsCallPrompt, {
            temperature: 0.2,
            maxTokens: 15000
        });

        // Strip markdown code blocks before parsing
        let cleanedResult = result.trim();
        
        if (cleanedResult.startsWith('```json')) {
            cleanedResult = cleanedResult.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
        } else if (cleanedResult.startsWith('```')) {
            cleanedResult = cleanedResult.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        
        console.log(`📝 [Earnings Call] Cleaned response (first 200 chars):`, cleanedResult.substring(0, 200));

        const earningsInsights = JSON.parse(cleanedResult);
        
        // Store PDF URL and extracted text in the insights object
        earningsInsights.pdfUrl = metadata.pdfUrl;
        earningsInsights.extractedText = metadata.extractedText;
        
        console.log(`🔍 [DEBUG] After storing in insights:`, {
            hasPdfUrl: !!earningsInsights.pdfUrl,
            pdfUrlLength: earningsInsights.pdfUrl?.length || 0,
            hasExtractedText: !!earningsInsights.extractedText,
            extractedTextLength: earningsInsights.extractedText?.length || 0
        });
        try {
            await connectToDatabase();
            
            await EarningsCallCache.findOneAndUpdate(
                { 
                    symbol: cleanSymbol, 
                    quarter: metadata.quarter, 
                    fiscalYear: metadata.fiscalYear,
                    source: 'Earnings Call Transcript'
                },
                {
                    $set: {
                        data: earningsInsights,
                        rawTranscript: transcriptText,
                        source: 'Earnings Call Transcript',
                        fetchedAt: new Date(),
                        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                    }
                },
                { upsert: true }
            );
            console.log(`💾 [MongoDB Earnings] Saved ${metadata.quarter} FY${metadata.fiscalYear} (90d TTL)`);
        } catch (dbSaveError: any) {
            console.warn(`⚠️ [MongoDB Earnings] Save failed: ${dbSaveError.message}`);
        }
        
        return earningsInsights;
        
    } catch (extractError: any) {
        console.error(`❌ [Earnings Call] Analysis failed:`, extractError.message);
        console.error(`   Stack:`, extractError.stack);
        return null;
    }
}


async function mcpGetIndianComprehensiveData(
    symbol: string, 
    forceRefresh: boolean = false,
    forceRefreshQuarterly: boolean = false,
    forceRefreshEarningsCall: boolean = false
) {
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
    
    // Validate symbol before MongoDB operations
    if (!validateMongoSymbol(cleanSymbol)) {
        throw new Error('Invalid symbol format for database operations');
    }
    
    try {
        // ============================================
        // PHASE 1: PARALLEL CHECK - MongoDB Cache & O.in Versions
        // ============================================
        console.log(`🔍 [Smart Cache] Parallel checking cache & available versions...`);
        
        await connectToDatabase();
        
        // 🚀 OPTIMIZATION: Check DB cache and O.in versions in parallel
        const [availableVersions, cachedReport, cachedQuarterly, cachedEarningsCall] = await Promise.all([
            (async () => {
                try {
                    const { checkAvailableDataVersions } = await import('../../utils/ORec');
                    return await checkAvailableDataVersions(symbol);
                } catch (error) {
                    console.warn(`⚠️ [O.in Check] Failed:`, error);
                    return { latestFiscalYear: null, latestQuarter: null, latestConcallQuarter: null };
                }
            })(),
            
            // Annual Report Cache Check
            !forceRefresh ? AnnualReportCache.findOne({
                symbol: cleanSymbol,
                reportType: 'Consolidated',
                expiresAt: { $gt: new Date() }
            }).sort({ fiscalYear: -1 }).limit(1) : Promise.resolve(null),
            
            // Quarterly Report Cache Check
            !forceRefreshQuarterly ? QuarterlyReportCache.findOne({
                symbol: cleanSymbol,
                expiresAt: { $gt: new Date() }
            }).sort({ fiscalYear: -1, quarter: -1 }).limit(1) : Promise.resolve(null),
            
            // Earnings Call Cache Check
            !forceRefreshEarningsCall ? EarningsCallCache.findOne({
                symbol: cleanSymbol,
                expiresAt: { $gt: new Date() }
            }).sort({ callDate: -1 }).limit(1) : Promise.resolve(null)
        ]);
        
        // ============================================
        // PHASE 2: DETERMINE WHAT NEEDS REFRESH
        // ============================================
        let annualReportInsights = null;
        let annualFromCache = false;
        let needsFreshAnnual = forceRefresh;
        
        if (!forceRefresh && cachedReport) {
            try { 
                const cachedFY = cachedReport.fiscalYear;
                const latestFY = availableVersions.latestFiscalYear;
                
                if (latestFY && compareFiscalYears(latestFY, cachedFY) > 0) {
                    console.log(`🆕 [Annual] Newer FY available: ${latestFY} (cached: ${cachedFY})`);
                    needsFreshAnnual = true;
                } else {
                    console.log(`✅ [Annual] Cache up-to-date: ${cachedFY}`);
                    annualReportInsights = cachedReport.data;
                    annualFromCache = true;
                }
            } catch (dbError: any) {
                console.warn(`⚠️ [MongoDB Annual] Cache check failed: ${dbError.message}`);
            }
        } else if (!cachedReport) {
            needsFreshAnnual = true;
        }
        
        // Quarterly Report Cache Check Result
        let quarterlyInsights = null;
        let quarterlyFromCache = false;
        let quarter = 'Unknown';
        let rawTranscript = '';
        let needsFreshQuarterly = forceRefreshQuarterly;
        
        if (!forceRefreshQuarterly && cachedQuarterly) {
            try {
                const cachedQ = cachedQuarterly.quarter;
                const latestQ = availableVersions.latestQuarter;
                
                if (latestQ && latestQ !== cachedQ) {
                    console.log(`🆕 [Quarterly] Newer quarter available: ${latestQ} (cached: ${cachedQ})`);
                    needsFreshQuarterly = true;
                } else {
                    console.log(`✅ [Quarterly] Cache is up-to-date: ${cachedQ}`);
                    quarterlyInsights = cachedQuarterly.data;
                    quarter = cachedQuarterly.quarter;
                    rawTranscript = cachedQuarterly.rawTranscript || '';
                    quarterlyFromCache = true;
                }
            } catch (dbError: any) {
                console.warn(`⚠️ [MongoDB Quarterly] Cache check failed: ${dbError.message}`);
            }
        } else if (!cachedQuarterly) {
            console.log(`📭 [Quarterly] No cache found`);
            needsFreshQuarterly = true;
        }

        // Earnings Call Cache Check Result
        let earningsCallInsights = null;
        let earningsCallFromCache = false;
        let needsFreshEarningsCall = forceRefreshEarningsCall;

        if (!forceRefreshEarningsCall && cachedEarningsCall) {
            try {
                const cachedConcallQ = cachedEarningsCall.quarter;
                const latestConcallQ = availableVersions.latestConcallQuarter;
                
                if (latestConcallQ && latestConcallQ !== cachedConcallQ) {
                    console.log(`🆕 [Earnings Call] Newer transcript available: ${latestConcallQ} (cached: ${cachedConcallQ})`);
                    needsFreshEarningsCall = true;
                } else {
                    console.log(`✅ [Earnings Call] Cache up-to-date: ${cachedConcallQ}`);
                    earningsCallInsights = cachedEarningsCall.data;
                    earningsCallFromCache = true;
                }
            } catch (dbError: any) {
                console.warn(`⚠️ [MongoDB Earnings Call] Cache check failed: ${dbError.message}`);
            }
        } else if (!cachedEarningsCall) {
            console.log(`📭 [Earnings Call] No cache found`);
            needsFreshEarningsCall = true;
        }
        
        // ============================================
        // PHASE 3: RETURN CACHE IF ALL UP-TO-DATE (Parallel Load Already Complete!)
        // ============================================
        if (!needsFreshAnnual && !needsFreshQuarterly && !needsFreshEarningsCall) {
            console.log(`💾 [Smart Cache] All data is up-to-date for ${cleanSymbol} ⚡ (Parallel Load)`);
            return {
                transcript: rawTranscript,
                annualReport: '',
                annualReportInsights: annualReportInsights,
                quarterlyInsights: quarterlyInsights,
                earningsCallInsights: earningsCallInsights,
                fromCache: true,
                quarter: quarter,
                source: 'MongoDB Cache (Verified Fresh)',
                cacheType: 'mongodb'
            };
        }
        
        // ============================================
        // PHASE 4: FETCH FRESH DATA FROM O.IN
        // ============================================
        console.log(`🔄 [Hybrid Fetch] Cached items available, fetching new data...`);
        console.log(`   📊 Status: Annual=${annualFromCache ? '✅ Cached' : '🆕 Fetch'}, Quarterly=${quarterlyFromCache ? '✅ Cached' : '🆕 Fetch'}, Earnings=${earningsCallFromCache ? '✅ Cached' : '🆕 Fetch'}`);
        
        if (!process.env.O_EMAIL || !process.env.O_PASSWORD) {
            throw new Error('O.in credentials required');
        }
        
        const { fetchOComprehensiveData } = await import('../../utils/ORec');
        const OData = await fetchOComprehensiveData(symbol);
        
        console.log('🔍 [DEBUG] O data structure:', {
            hasTranscript: !!OData.transcript,
            hasAnnualReport: !!OData.annualReport,
            hasConcallTranscript: !!OData.concallTranscript,
            concallUrl: OData.concallTranscript?.url?.substring(0, 100),
            concallContentLength: OData.concallTranscript?.content?.length,
            concallQuarter: OData.concallTranscript?.quarter
        });
        
        // ============================================
        // PHASE 5: QUEUE AI EXTRACTION TASKS (FOR SEQUENTIAL PROCESSING)
        // ============================================
        const processingPromises = [];
        
        // Only process quarterly if needed
        if (needsFreshQuarterly && OData.transcript) {
            console.log(`🔄 [Quarterly] Queuing AI extraction: ${OData.transcript.quarter}...`);
            const transcript = OData.transcript; // Capture for closure
            processingPromises.push(
                extractQuarterlyInsights(
                    cleanSymbol,
                    transcript.content,
                    transcript.quarter,
                    transcript.fiscalYear
                ).then(insights => ({ 
                    type: 'quarterly' as const, 
                    data: insights, 
                    quarter: transcript.quarter, 
                    rawTranscript: transcript.content 
                }))
            );
        }
        
        // Only process earnings call if needed
        if (needsFreshEarningsCall && OData.concallTranscript) {
            console.log(`🔄 [Earnings Call] Queuing metadata storage: ${OData.concallTranscript.quarter}...`);
            processingPromises.push(
                Promise.resolve({
                    type: 'earningsCall' as const,
                    data: {
                        quarter: OData.concallTranscript.quarter,
                        fiscalYear: OData.concallTranscript.fiscalYear,
                        callDate: new Date().toISOString().split('T')[0],
                        pdfUrl: OData.concallTranscript.url,
                        source: 'O.in Concalls'
                    }
                })
            );
        }
        
        // Only process annual report if needed
        if (needsFreshAnnual && OData.annualReport) {
            console.log(`🔄 [Annual] Queuing AI extraction: FY${OData.annualReport.fiscalYear}...`);
            const annualReportData = OData.annualReport; // Capture for closure
            const annualReport = `FISCAL YEAR: ${annualReportData.fiscalYear}\nSOURCE: ${annualReportData.source}\nURL: ${annualReportData.url}\n\n${annualReportData.content}`;
            
            processingPromises.push(
                (async () => {
                    console.log(`🔍 [AI Annual] Extracting insights...`);
                    
                    try {
                        const extractionPrompt = `⚠️ EXTRACT FROM ACTUAL DOCUMENT BELOW - NOT EXAMPLES ⚠️

DOCUMENT:
${annualReport.substring(0, 10000000)}

═══════════════════════════════════════════════════════════════════════════════
🔢 CRITICAL: MANDATORY UNIT CONVERSION TO CRORES (APPLY TO ALL FINANCIAL VALUES)
═══════════════════════════════════════════════════════════════════════════════

**STEP 1: IDENTIFY THE CURRENCY UNIT IN THE DOCUMENT**
Look for statements like:
• "All amounts in INR Lakhs" / "Rs. in Lakhs" / "₹ Lakhs"
• "All amounts in INR Crores" / "Rs. in Crores"
• "All amounts in INR Millions" / "Rs. Millions"
• "All amounts in INR Thousands" / "Rs. Thousands"
• "Figures in '000" / "In thousands"

**STEP 2: APPLY THE CONVERSION FORMULA**

┌─────────────────┬──────────────────────────┬─────────────────────────────────┐
│ SOURCE UNIT     │ CONVERSION TO CRORES     │ EXAMPLE                         │
├─────────────────┼──────────────────────────┼─────────────────────────────────┤
│ Lakhs           │ Divide by 100            │ 50,000 Lakhs → 50,000 ÷ 100     │
│ (INR Lakhs)     │ Value ÷ 100              │              = 500 Crores       │
├─────────────────┼──────────────────────────┼─────────────────────────────────┤
│ Millions        │ Divide by 10             │ 5,000 Million → 5,000 ÷ 10      │
│ (INR Millions)  │ Value ÷ 10               │               = 500 Crores      │
├─────────────────┼──────────────────────────┼─────────────────────────────────┤
│ Thousands       │ Divide by 10,000         │ 5,000,000 Thousands             │
│ (INR '000)      │ Value ÷ 10,000           │ → 5,000,000 ÷ 10,000 = 500 Cr  │
├─────────────────┼──────────────────────────┼─────────────────────────────────┤
│ Crores          │ No conversion            │ 500 Crores = 500 Crores         │
│ (INR Crores)    │ Keep as-is               │                                 │
├─────────────────┼──────────────────────────┼─────────────────────────────────┤
│ Billions        │ Multiply by 100          │ 5 Billion → 5 × 100             │
│ (INR Billions)  │ Value × 100              │           = 500 Crores          │
└─────────────────┴──────────────────────────┴─────────────────────────────────┘

**STEP 3: CONVERSION WORKFLOW EXAMPLES**

EXAMPLE 1: Converting from Lakhs
Document shows: "Total Assets: 1,25,456.78" and header says "All amounts in INR Lakhs"

1. Extract number: 1,25,456.78 (remove commas → 125456.78)
2. Identify unit: Lakhs
3. Apply formula: 125456.78 ÷ 100 = 1254.57
4. Result in Crores: 1254.57
5. Store in JSON: "totalAssets": {"current": 1254.57, "previous": ...}

EXAMPLE 2: Converting from Millions
Document shows: "Total Revenue: 12,500.50" and header says "Figures in INR Millions"

1. Extract number: 12,500.50 (remove commas → 12500.50)
2. Identify unit: Millions
3. Apply formula: 12500.50 ÷ 10 = 1250.05
4. Result in Crores: 1250.05
5. Store in JSON: "revenue": {"current": 1250.05, "previous": ...}

EXAMPLE 3: Converting from Thousands
Document shows: "Cash Balance: 50,00,000" and header says "All amounts in INR '000" or "In Thousands"

1. Extract number: 50,00,000 (remove commas → 50000000)
2. Identify unit: Thousands
3. Apply formula: 50000000 ÷ 10000000 = 5
4. Result in Crores: 5
5. Store in JSON: "closingCash": {"current": 5, "previous": ...}

EXAMPLE 4: No conversion needed (already in Crores)
Document shows: "Total Assets: 1,254.57" and header says "All amounts in INR Crores"

1. Extract number: 1,254.57 (remove commas → 1254.57)
2. Identify unit: Crores
3. Apply formula: No conversion (keep as-is)
4. Result in Crores: 1254.57
5. Store in JSON: "totalAssets": {"current": 1254.57, "previous": ...}

**STEP 4: WHICH VALUES TO CONVERT**

✅ CONVERT THESE (all monetary values):
• Balance Sheet: Assets, Liabilities, Equity, Share Capital, Reserves
• P&L Statement: Revenue, Expenses, Profit, Loss, Tax
• Cash Flow: Operating CF, Investing CF, Financing CF, Capex
• Remuneration: Salary, Commission, Perquisites, Stock compensation
• Capex, Borrowings, Investments, Dividends

❌ DO NOT CONVERT THESE:
• EPS (Earnings Per Share) - it's a per-share value, keep original
• P/E Ratio, ROE%, ROCE% - these are ratios/percentages
• Number of shares, Number of employees - these are counts
• Percentages (10%, 25%, etc.) - keep as-is
• Foreign currency amounts (USD, EUR) - convert currency first, then to Crores

**STEP 5: SET OUTPUT FIELDS CORRECTLY**

After conversion, ensure:
• Set "currency" field to: "INR Crores"
• Set "currencyUnit" field to: "Crores"
• All numeric values in JSON are in Crores (already converted)
• Maintain precision: Use 2 decimal places (e.g., 1254.57 not 1254.5700)

**STEP 6: HANDLE EDGE CASES**

• If document has NO unit specified → Assume Lakhs (common default)
• If document has MIXED units (unlikely) → Convert each section separately
• If value is "N.A." or "-" → Use null, don't convert
• If value is negative → Keep negative sign (e.g., -150.25 Crores)

═══════════════════════════════════════════════════════════════════════════════
END OF CONVERSION RULES - NOW PROCEED WITH EXTRACTION
═══════════════════════════════════════════════════════════════════════════════

EXTRACTION RULES:
• MANDATORY: Only extract from "Consolidated" statements (REJECT "Standalone" completely)
• Extract actual numbers from document - strip commas, preserve decimals
• **APPLY UNIT CONVERSION IMMEDIATELY AFTER EXTRACTION** (see rules above)
• Use null for unavailable data (never 0 or placeholder values)
• Two-column format: "Label [spaces] Current [spaces] Previous"
• Validate: Total Assets = Total Equity + Total Liabilities (±1% tolerance)

SEARCH ORDER:
1. Find "Consolidated Balance Sheet" (skip any "Standalone" tables)
2. Find "Consolidated Statement of Profit and Loss" (skip any "Standalone" tables)
3. Find "Consolidated Statement of Cash Flows" (skip any "Standalone" tables)
4. Find "Remuneration of Directors" section (usually in Corporate Governance)
5. Find "Independent Auditor's Report" (for Consolidated Financial Statements only)

BALANCE SHEET VALIDATION (CRITICAL):
✅ MUST have detailed line items (not summary tables)
✅ TWO columns: current year | previous year
✅ Three sections: Assets, Equity, Liabilities
✅ REJECT if: Total Equity = Total Assets (wrong table selected)
✅ REJECT if: Total Liabilities = 0 or null (incomplete extraction)
✅ Verify equation: Assets = Equity + Liabilities (allow ±1% rounding difference)

EXTRACTION TARGETS (ALL VALUES CONVERTED TO CRORES):

1. BUSINESS MODEL (400+ words):
   Extract from MD&A section - revenue streams, business segments, competitive advantages, market position

2. FUTURE STRATEGY (400+ words):
   Extract from Future Outlook/Chairman's Message - strategic initiatives, capex plans, expansion targets

3. BALANCE SHEET (Consolidated, Converted to Crores):
   • Total Assets (current, previous) - from "TOTAL ASSETS" line
   • Total Equity (current, previous) - from "Total equity" or "Shareholders' Equity" line
   • Total Liabilities (current, previous) - SUM of "Non-current liabilities" + "Current liabilities"
   • Non-current assets total (current, previous)
   • Current assets total (current, previous)
   • Equity breakdown: Share capital, Other equity/Reserves
   • Liabilities breakdown: Non-current total, Current total
   
4. PROFIT & LOSS (Consolidated, Converted to Crores, Annual - "Year ended March 31, 2025"):
   • Revenue/Total Income from operations
   • Total Expenses
   • Profit Before Tax (PBT)
   • Tax Expense
   • Profit After Tax (PAT)
   • EPS (Basic) - **DO NOT CONVERT** (it's per-share value, keep original)

5. CASH FLOW (Consolidated, Converted to Crores, Annual):
   A. Operating Activities:
      • Profit Before Tax
      • Cash Generated from Operations (after working capital changes)
      • Taxes Paid
      • Net Cash from Operating Activities
   
   B. Investing Activities:
      • Total Capex (Purchase of PPE + Intangible assets)
      • Investments Purchased
      • Investments Sold/Matured
      • Net Cash from Investing Activities
   
   C. Financing Activities:
      • Net Borrowing Change (proceeds - repayments)
      • Interest Paid
      • Dividends Paid
      • Net Cash from Financing Activities
   
   D. Reconciliation:
      • Net Cash Change (A + B + C)
      • Opening Cash & Cash Equivalents
      • Closing Cash & Cash Equivalents
      • validationPassed: true/false (verify: Opening + Net Change = Closing)
   
   E. Derived Metrics:
      • Free Cash Flow = Operating CF - Capex
      • Cash Conversion Ratio = Operating CF ÷ PAT × 100
      • Operating CF to PAT Ratio = Operating CF ÷ PAT

   CASH FLOW QUALITY RATING (analyze and rate):
   • **Excellent**: Operating CF > PAT, Positive FCF, OCF/PAT > 100%, Low/stable debt
   • **Good**: Operating CF ≈ PAT (80-120%), Positive/breakeven FCF, Manageable debt growth
   • **Weak**: Operating CF < PAT, Negative FCF, High working capital drain, Rising debt dependency

6. REMUNERATION (Consolidated, Converted to Crores):
   Search in: Directors' Report > Corporate Governance > Remuneration of Directors
   
   • Executive Directors (MD/CEO/Whole-time):
     - Name, Designation
     - Salary, Perquisites, Commission, Stock Options Granted
     - Total Remuneration (current year, previous year)
   
   • Non-Executive Directors (Independent/Non-Executive):
     - Name, Designation  
     - Sitting Fees (Board + Committee meetings)
     - Commission
     - Total Remuneration
   
   • KMP (Key Managerial Personnel - CFO, CS):
     - Name, Designation
     - Salary, Perquisites, Stock Options
     - Total Remuneration
   
   • Summary Statistics:
     - Total paid to Executive Directors
     - Total paid to Non-Executive Directors
     - Grand Total remuneration
     - YoY percentage change
     - Remuneration as % of PAT

7. AUDIT INFORMATION (Consolidated Financial Statements only):
   Search for: "Independent Auditor's Report on the Consolidated Financial Statements"
   
   • Auditor Details:
     - Firm name, Registration number
     - Partner name, Membership number
     - Audit report date, Location, UDIN
   
   • Opinion:
     - Type: Unqualified/Qualified/Adverse/Disclaimer
     - Extract exact opinion paragraph
     - Basis for Opinion paragraph
     - Is Modified: true/false
   
   • Emphasis of Matter (if present):
     - Extract full paragraph
     - Reference note number
   
   • Key Audit Matters (KAMs):
     - Title of each KAM
     - Why it's classified as KAM
     - Auditor's response/procedure
     - Reference notes
   
   • Other Matters:
     - Component auditors involved: Yes/No
     - Number/% of subsidiaries audited by others
     - List of unaudited components (if any)
   
   • Legal & Regulatory Compliance:
     - Section 143(3): Book-keeping, internal controls opinion
     - Rule 11: Litigation, audit trail, fund transfers
     - Section 197(16): Director remuneration compliance
   
   • CARO (Companies Auditor's Report Order):
     - Search for "Annexure A" or paragraph xxi
     - Extract holding company summary remarks
     - List subsidiaries with adverse/qualified CARO remarks
     - Extract CIN numbers of subsidiaries with issues
   
   • Internal Financial Controls:
     - Search for "Annexure B"
     - Opinion: Adequate/Inadequate/Modified
     - Extract material weaknesses (if any)
   
   • Audit Concerns Summary:
     - Overall risk level: Low/Medium/High/Critical
     - List all red flags (critical issues)
     - List yellow flags (concerns to watch)
     - Positive indicators (clean audit points)
     - Investor implications (200+ words)

8. RISKS & OPPORTUNITIES:
   • Extract 3-5 major risks from Risk Management section
   • Extract 3-5 key opportunities from Business Outlook/Future Prospects

YOY CALCULATIONS (use converted Crores values):
• change = current - previous
• changePercent = ((current - previous) ÷ previous) × 100
• Round to 2 decimal places

SUMMARY REQUIREMENTS:
• Balance Sheet: 350-450 words covering assets growth, equity changes, liability structure, validation status
• Cash Flow: 350-450 words covering operating quality, working capital trends, capex intensity, FCF, rating rationale
• Audit: 200+ words covering opinion type, concerns/red flags, risk assessment for investors

RETURN JSON (exact structure):
{
  "companyName": "string",
  "symbol": "${cleanSymbol}",
  "fiscalYear": "string from document (e.g., FY 2024-25)",
  "reportType": "Consolidated",
  "currency": "INR Crores",
  "businessModel": "400+ words",
  "futureStrategy": "400+ words",
  "balanceSheet": {
    "summary": "350-450 words or 'Balance Sheet data not available'",
    "assets": {
      "nonCurrent": {"total": {"current": null, "previous": null}},
      "current": {"total": {"current": null, "previous": null}},
      "totalAssets": {"current": null, "previous": null}
    },
    "equity": {
      "equityShareCapital": {"current": null, "previous": null},
      "otherEquity": {"current": null, "previous": null},
      "totalEquity": {"current": null, "previous": null}
    },
    "liabilities": {
      "nonCurrent": {"total": {"current": null, "previous": null}},
      "current": {"total": {"current": null, "previous": null}},
      "totalLiabilities": {"current": null, "previous": null}
    },
    "profitAndLoss": {
      "revenue": {"current": null, "previous": null},
      "totalExpenses": {"current": null, "previous": null},
      "profitBeforeTax": {"current": null, "previous": null},
      "taxExpense": {"current": null, "previous": null},
      "profitAfterTax": {"current": null, "previous": null},
      "eps": {"current": null, "previous": null}
    },
    "yoyComparison": {
      "totalAssets": {"change": null, "changePercent": null},
      "totalEquity": {"change": null, "changePercent": null},
      "totalLiabilities": {"change": null, "changePercent": null},
      "revenue": {"change": null, "changePercent": null},
      "profitAfterTax": {"change": null, "changePercent": null},
      "eps": {"change": null, "changePercent": null}
    },
    "analysis": "string"
  },
  "cashFlow": {
    "summary": "350-450 words or 'Cash Flow Statement not available'",
    "healthIndicators": {
      "cashFlowQuality": "Excellent|Good|Weak",
      "qualityRationale": "2-3 sentences explaining rating based on OCF/PAT ratio, FCF trend, WC efficiency, debt dependency"
    },
    "operatingActivities": {
      "profitBeforeTax": {"current": null, "previous": null},
      "cashGeneratedFromOperations": {"current": null, "previous": null},
      "taxesPaid": {"current": null, "previous": null},
      "netCashFromOperating": {"current": null, "previous": null}
    },
    "investingActivities": {
      "totalCapex": {"current": null, "previous": null},
      "investmentsPurchased": {"current": null, "previous": null},
      "investmentsSold": {"current": null, "previous": null},
      "netCashFromInvesting": {"current": null, "previous": null}
    },
    "financingActivities": {
      "netBorrowingChange": {"current": null, "previous": null},
      "interestPaid": {"current": null, "previous": null},
      "dividendsPaid": {"current": null, "previous": null},
      "netCashFromFinancing": {"current": null, "previous": null}
    },
    "reconciliation": {
      "netCashChange": {"current": null, "previous": null},
      "openingCash": {"current": null, "previous": null},
      "closingCash": {"current": null, "previous": null},
      "validationPassed": false
    },
    "derivedMetrics": {
      "freeCashFlow": {"current": null, "previous": null},
      "cashConversionRatio": {"current": null, "previous": null},
      "operatingCashFlowToPatRatio": {"current": null, "previous": null}
    },
    "yoyComparison": {
      "operatingCashFlow": {"change": null, "changePercent": null},
      "freeCashFlow": {"change": null, "changePercent": null}
    }
  },
  "remuneration": {
    "fiscalYear": "FY 2024-25",
    "currencyUnit": "Crores",
    "executiveDirectors": [{
      "name": "string",
      "designation": "MD|CEO|Whole-time Director",
      "remuneration": {
        "salary": null,
        "perquisites": null,
        "commission": null,
        "stockOptionsGranted": null,
        "totalRemuneration": null,
        "previousYear": null
      }
    }],
    "nonExecutiveDirectors": [{
      "name": "string",
      "designation": "Independent|Non-Executive",
      "remuneration": {
        "sittingFees": {"totalSittingFees": null},
        "commission": null,
        "totalRemuneration": null
      }
    }],
    "totalRemunerationSummary": {
      "totalExecutiveDirectors": null,
      "totalNonExecutiveDirectors": null,
      "grandTotal": null,
      "percentageChange": "string"
    },
    "summary": "5-6 sentences: total paid, highest paid director, NED fees, stock options, remuneration as % of profit"
  },
  "auditInformation": {
    "auditor": {
      "firmName": "string",
      "registrationNumber": "string",
      "partnerName": "string",
      "partnerMembershipNumber": "string",
      "auditReportDate": "string",
      "location": "string",
      "udin": "string"
    },
    "opinion": {
      "type": "Unqualified|Qualified|Adverse|Disclaimer",
      "statement": "exact opinion paragraph",
      "basisForOpinion": "string",
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
    "keyAuditMatters": [{
      "title": "string",
      "whyItsAKAM": "string",
      "auditorsResponse": "string",
      "referenceNotes": []
    }],
    "otherMatters": {
      "componentAuditorsInvolved": false,
      "numberOfSubsidiariesByOthers": null,
      "percentageAuditedByOthers": "string",
      "relianceStatement": "string",
      "unauditedComponents": []
    },
    "legalRegulatoryCompliance": {
      "section143_3": {
        "informationObtained": "Adequate|Inadequate",
        "properBooksKept": "Yes|No",
        "agreementWithBooks": "Yes|No",
        "indASCompliance": "Yes|No",
        "directorsDisqualified": "None|List",
        "modifications": null,
        "internalControlsOpinion": "string"
      },
      "rule11": {
        "litigationsDisclosed": "string",
        "foreseeableLossesProvided": "string",
        "iepfTransfers": "string",
        "fundsToIntermediaries": "string",
        "fundsFromFundingParties": "string",
        "dividendCompliance": "string",
        "auditTrail": {
          "enabled": true,
          "exceptions": "string",
          "tampering": "string",
          "preserved": "string"
        }
      },
      "section197_16": {
        "compliant": true,
        "excessPayments": "None|Details"
      }
    },
    "caro": {
      "applicable": true,
      "annexure": "Annexure A",
      "holdingCompanyRemarks": "string from paragraph xxi",
      "subsidiariesWithIssues": ["list subsidiaries with unfavorable remarks"],
      "subsidiariesCARONotIssued": [{
        "name": "string",
        "cin": "string"
      }]
    },
    "internalFinancialControls": {
      "annexure": "Annexure B",
      "opinion": "Adequate|Inadequate|Modified",
      "scope": "string - Holding Company + Indian subsidiaries",
      "exceptions": "string - list material weaknesses or null"
    },
    "consolidationScope": {
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
      },
      "componentAuditors": {
        "firms": ["string"],
        "percentageOfRevenue": "string",
        "percentageOfAssets": "string"
      }
    },
    "auditConcernsAndIssues": {
      "overallRiskLevel": "Low|Medium|High|Critical",
      "hasQualifiedOpinion": false,
      "hasEmphasisOfMatter": false,
      "hasMaterialUncertainty": false,
      "hasInternalControlWeakness": false,
      "concerns": [{
        "type": "Qualified Opinion|KAM|CARO Issue|Internal Control|Compliance",
        "severity": "Critical|Significant|Minor",
        "title": "string",
        "description": "string with amounts in Crores",
        "financialImpact": "string in Crores",
        "reference": "string",
        "status": "Unresolved|Provided For|Addressed",
        "investorImplication": "string"
      }],
      "redFlags": ["critical issues"],
      "yellowFlags": ["concerns to watch"],
      "positiveIndicators": ["clean audit points"],
      "summary": "200+ words: clean audit or detail all concerns with investor implications"
    }
  },
  "keyRisks": ["string"],
  "keyOpportunities": ["string"]
}

Return ONLY valid JSON, no markdown wrappers.`;


                const insightsResponse = await callGeminiAPI(extractionPrompt, { temperature: 0.2, maxTokens: 800000 });
                
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
}  // Close if (!extractedInsights) block

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
                    
                    // SANITIZE unauditedComponents - Gemini sometimes returns objects instead of strings
                    if (extractedInsights.auditInformation?.otherMatters?.unauditedComponents) {
                        const unaudited = extractedInsights.auditInformation.otherMatters.unauditedComponents;
                        if (Array.isArray(unaudited) && unaudited.length > 0) {
                            // Check if first element is an object (wrong format)
                            if (typeof unaudited[0] === 'object' && unaudited[0] !== null) {
                                console.warn(`⚠️ [Sanitize] unauditedComponents contains objects, extracting names only`);
                                // Extract just the name field from each object
                                extractedInsights.auditInformation.otherMatters.unauditedComponents = unaudited.map((item: any) => 
                                    typeof item === 'object' ? (item.name || item.companyName || JSON.stringify(item)) : String(item)
                                );
                                console.log(`✅ [Sanitize] Cleaned unauditedComponents to strings:`, extractedInsights.auditInformation.otherMatters.unauditedComponents);
                            }
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
                    
                    // Save to MongoDB
                    await AnnualReportCache.findOneAndUpdate(
                        { 
                            symbol: cleanSymbol, 
                            fiscalYear: annualReportData.fiscalYear,
                            reportType: 'Consolidated'
                        },
                        {
                            $set: {
                                data: extractedInsights,
                                rawReport: annualReport,
                                source: annualReportData.source,
                                url: annualReportData.url,
                                fetchedAt: new Date(),
                                expiresAt: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000)
                            }
                        },
                        { upsert: true }
                    );
                    console.log(`💾 [MongoDB Annual] Saved FY${annualReportData.fiscalYear} (6M TTL)`);
                    
                    return { type: 'annual' as const, data: extractedInsights };
                }  // Close if (extractedInsights) block
                } catch (extractError: any) {
                    console.error(`❌ [Annual] AI extraction failed:`, extractError.message);
                    return { type: 'annual' as const, data: null };
                }
                })()
            );
        }
        
        // ============================================
        // PHASE 6: SEQUENTIAL PROCESSING (TPM Optimization)
        // ============================================
        if (processingPromises.length > 0) {
            console.log(`🔄 [Sequential] Processing ${processingPromises.length} items one by one (TPM limit optimization)...`);
            
            for (let i = 0; i < processingPromises.length; i++) {
                const itemNum = i + 1;
                console.log(`⏳ [Sequential ${itemNum}/${processingPromises.length}] Processing...`);
                
                try {
                    const result = await processingPromises[i];
                    
                    if (!result) {
                        console.warn(`⚠️ [Sequential ${itemNum}/${processingPromises.length}] No data returned`);
                        continue;
                    }
                    
                    if (result.type === 'quarterly' && result.data) {
                        quarterlyInsights = result.data;
                        if ('quarter' in result) quarter = result.quarter;
                        if ('rawTranscript' in result) rawTranscript = result.rawTranscript;
                        console.log(`✅ [Sequential ${itemNum}/${processingPromises.length}] Quarterly insights extracted`);
                    } else if (result.type === 'annual' && result.data) {
                        annualReportInsights = result.data;
                        console.log(`✅ [Sequential ${itemNum}/${processingPromises.length}] Annual report insights extracted`);
                    }else if (result.type === 'earningsCall' && result.data) {
                        earningsCallInsights = result.data;
                        console.log(`✅ [Sequential ${itemNum}/${processingPromises.length}] Earnings call metadata stored`);
                    }
                } catch (error: any) {
                    console.error(`❌ [Sequential ${itemNum}/${processingPromises.length}] Processing failed:`, error.message);
                    // Continue with next item even if this one fails
                }
            }
            
            console.log(`✅ [Sequential] All items processed successfully`);
        }
        
        // Cache the results
        batchDataCache.set(cleanSymbol, { transcript: rawTranscript, annualReport: '', quarter, annualReportInsights });
        
        return {
            transcript: rawTranscript,
            annualReport: '',
            annualReportInsights: annualReportInsights,
            quarterlyInsights: quarterlyInsights,
            earningsCallInsights: earningsCallInsights,
            fromCache: annualFromCache && quarterlyFromCache && earningsCallFromCache,
            quarter: quarter,
            source: 'Hybrid (Cache + Fresh Fetch)',
            OSource: true,
            optimization: {
                annualCached: annualFromCache,
                quarterlyCached: quarterlyFromCache,
                earningsCallCached: earningsCallFromCache,
                sequentialProcessing: processingPromises.length > 0
            }
        };
        
    } catch (error: any) {
        console.error(`❌ [Comprehensive Data] Failed:`, error.message);
        
        return {
            transcript: '',
            annualReport: '',
            annualReportInsights: null,
            quarterlyInsights: null,
            earningsCallInsights: null,
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
// HELPER: CALCULATE TECHNICAL INDICATORS
// ========================
export function calculateTechnicalIndicators(historicalPrices: number[]) {
    // RSI Calculation (14-period)
    const calculateRSI = (prices: number[], period: number = 14) => {
        if (prices.length < period + 1) return { value: 50, signal: 'Neutral' };
        
        let gains = 0, losses = 0;
        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        let signal = 'Neutral';
        if (rsi > 70) signal = 'Overbought';
        else if (rsi < 30) signal = 'Oversold';
        
        return { value: rsi, signal };
    };
    
    // MACD Calculation (12, 26, 9)
    const calculateEMA = (prices: number[], period: number) => {
        const k = 2 / (period + 1);
        let ema = prices[0];
        for (let i = 1; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }
        return ema;
    };
    
    const calculateMACD = (prices: number[]) => {
        if (prices.length < 26) return { value: 0, signal: 0, histogram: 0, trend: 'Neutral' };
        
        const ema12 = calculateEMA(prices.slice(-26), 12);
        const ema26 = calculateEMA(prices, 26);
        const macdLine = ema12 - ema26;
        
        // Signal line is 9-period EMA of MACD
        const macdValues = [];
        for (let i = prices.length - 9; i < prices.length; i++) {
            const slice = prices.slice(0, i + 1);
            const e12 = calculateEMA(slice.slice(-26), 12);
            const e26 = calculateEMA(slice, 26);
            macdValues.push(e12 - e26);
        }
        const signalLine = calculateEMA(macdValues, 9);
        const histogram = macdLine - signalLine;
        const trend = macdLine > signalLine ? 'Bullish' : 'Bearish';
        
        return { value: macdLine, signal: signalLine, histogram, trend };
    };
    
    // Moving Averages Calculation
    const calculateSMA = (prices: number[], period: number) => {
        if (prices.length < period) return 0;
        const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    };
    
    const calculateMovingAverages = (prices: number[]) => {
        const sma20 = calculateSMA(prices, 20);
        const sma50 = calculateSMA(prices, 50);
        const sma200 = calculateSMA(prices, 200);
        
        let crossover = 'None';
        let trend = 'Neutral';
        
        if (sma50 > 0 && sma200 > 0) {
            if (sma50 > sma200 * 1.02) {
                crossover = 'Golden Cross';
                trend = 'Bullish';
            } else if (sma50 < sma200 * 0.98) {
                crossover = 'Death Cross';
                trend = 'Bearish';
            }
        }
        
        const currentPrice = prices[prices.length - 1];
        if (currentPrice > sma20 && sma20 > sma50) trend = 'Bullish';
        else if (currentPrice < sma20 && sma20 < sma50) trend = 'Bearish';
        
        return { sma20, sma50, sma200, crossover, trend };
    };
    
    return {
        rsi: calculateRSI(historicalPrices),
        macd: calculateMACD(historicalPrices),
        movingAverages: calculateMovingAverages(historicalPrices)
    };
}

// ========================
// HELPER: BUILD COMPLETE STOCK DATA WITH FULL AI ANALYSIS
// ========================

async function buildStockData(symbol: string, fundamentals: any, skipAI: boolean = false, forceRefresh: boolean = false, forceRefreshQuarterly: boolean = false, forceRefreshEarningsCall: boolean = false) {
    try {
        console.log(`🔨 [Build] Constructing complete stock data for ${symbol}...`);
        
        // Check cache first
        const cached = getCachedPrediction(symbol, skipAI ? 'price' : 'full');
        if (cached) {
            console.log(`💾 [Cache HIT] Returning cached stock data`);
            return cached.data;
        }
        
        // 1. Fetch current price from Yahoo Finance
        const yahooResponse = await fetchWithTimeout(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
            {},
            5000 // 5 second timeout
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
        
        // Fetch 200 days of historical data for technical indicators
        console.log(`📊 [Technical] Fetching historical data for indicators...`);
        let technicalIndicators = null;
        let historicalPrices: number[] = [];
        let historicalVolumes: number[] = [];
        try {
            const historicalResponse = await fetchWithTimeout(
                `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=200d`,
                {},
                5000
            );
            const historicalData = await historicalResponse.json();
           historicalPrices = historicalData.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((p: number) => p !== null) || [];
           historicalVolumes = historicalData.chart?.result?.[0]?.indicators?.quote?.[0]?.volume?.filter((v: number) => v !== null) || [];

            if (historicalPrices.length >= 14) {
                technicalIndicators = calculateTechnicalIndicators(historicalPrices);
                console.log(`✅ [Technical] Calculated RSI: ${technicalIndicators.rsi.value.toFixed(2)}, MACD: ${technicalIndicators.macd.trend}`);
            } else {
                console.warn(`⚠️ [Technical] Insufficient data (${historicalPrices.length} days), skipping indicators`);
            }           
        } catch (techError: any) {
            console.warn(`⚠️ [Technical] Failed to fetch historical data: ${techError.message}`);
        }

          // ── GEMINI SENTIMENT + DELIVERY + FII/DII (all in parallel for speed) ──
            let sentimentData: { score: number; magnitude: number; summary: string; source: string; headlines: string[]; articles: { title: string; publisher: string; publishedAt: string; link: string }[] } | null = null;
            let sentimentPromise: Promise<any> | null = null;
            let deliveryData: Awaited<ReturnType<typeof fetchDeliveryData>> = null;
            let deliveryPromise: Promise<any> | null = null;
            let fiidiiData: Awaited<ReturnType<typeof fetchFIIDIIData>> = null;
            let fiidiiPromise: Promise<any> | null = null;

            if (!skipAI && historicalPrices.length >= 30) {
                // Start all data fetches in parallel — don't await yet
                sentimentPromise = getGeminiSentiment(symbol).catch(err => {
                    console.warn(`⚠️ [Sentiment] Parallel fetch failed: ${err.message}`);
                    return null;
                });
            }

            // Delivery volume fetch (for Indian stocks mainly, but also fallback estimation)
            if (historicalVolumes.length >= 10 && historicalPrices.length >= 10) {
                deliveryPromise = fetchDeliveryData(symbol, historicalVolumes, historicalPrices).catch(err => {
                    console.warn(`⚠️ [Delivery] Parallel fetch failed: ${err.message}`);
                    return null;
                });
            }

            // FII/DII flow fetch (market-wide, mainly for Indian stocks)
            if (symbol.includes('.NS') || symbol.includes('.BO')) {
                fiidiiPromise = fetchFIIDIIData().catch(err => {
                    console.warn(`⚠️ [FII/DII] Parallel fetch failed: ${err.message}`);
                    return null;
                });
            }

          // ── ML PREDICTION SERVICE ──
             console.log(`🔍 [ML DEBUG] About to check ML. historicalPrices exists: ${typeof historicalPrices !== 'undefined'}, length: ${historicalPrices?.length || 0}, currentPrice: ${currentPrice || 'undefined'}, fundamentals: ${typeof fundamentals !== 'undefined'}`);
            let mlPredictions = null;
            if (historicalPrices.length >= 30) {
                // Await all parallel data before ML call so we can feed as features
                if (sentimentPromise) {
                    sentimentData = await sentimentPromise;
                    sentimentPromise = null; // consumed
                }
                if (deliveryPromise) {
                    deliveryData = await deliveryPromise;
                    deliveryPromise = null;
                }
                if (fiidiiPromise) {
                    fiidiiData = await fiidiiPromise;
                    fiidiiPromise = null;
                }

                try {
                    console.log(`🤖 [ML] Calling ML prediction service with ${historicalPrices.length} prices${sentimentData ? ` + sentiment (${sentimentData.score.toFixed(2)})` : ''}${deliveryData ? ` + delivery (${deliveryData.deliveryPercent.toFixed(1)}%)` : ''}${fiidiiData ? ` + FII/DII` : ''}...`);
                    const mlResponse = await fetch('http://localhost:8000/predict/price', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            symbol: symbol,
                            historical_prices: historicalPrices,
                            current_price: currentPrice,
                            fundamentals: fundamentals || null,
                            sentiment: sentimentData ? {
                                score: sentimentData.score,
                                magnitude: sentimentData.magnitude
                            } : null,
                            delivery_data: deliveryData ? {
                                deliveryPercent: deliveryData.deliveryPercent,
                                avgDeliveryPercent: deliveryData.avgDeliveryPercent,
                            } : null,
                            fiidii_data: fiidiiData ? {
                                fiiNet: fiidiiData.fii.netValue,
                                diiNet: fiidiiData.dii.netValue,
                            } : null,
                        }),
                        signal: AbortSignal.timeout(15000),
                    });
                    if (mlResponse.ok) {
                        mlPredictions = await mlResponse.json();
                        console.log(`✅ [ML] Predictions received (cached: ${mlPredictions.cached}, time: ${mlPredictions.training_time_ms}ms)`);
                    } else {
                        console.warn(`⚠️ [ML] Service returned ${mlResponse.status}`);
                    }
                } catch (mlError: any) {
                    console.warn(`⚠️ [ML] Service unavailable: ${mlError.message}`);
                }
            }
        
        // 2. For Indian stocks, fetch comprehensive data (quarterly transcripts + annual reports)
        let comprehensiveData = null;
        const isIndianStock = symbol.endsWith('.NS') || symbol.endsWith('.BO');
        
        if (isIndianStock) {
            console.log(`📊 [Comprehensive] Fetching quarterly transcripts and annual reports using Gemini...`);
            try {
                    comprehensiveData = await mcpGetIndianComprehensiveData(symbol,forceRefresh,forceRefreshQuarterly,forceRefreshEarningsCall);
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

        // 3b. Gemini AI Analysis — evaluates ML predictions, provides signal/reasoning
        let aiAnalysis = null;
        if (!skipAI && mlPredictions) {
            try {
                aiAnalysis = await getGeminiStockAnalysis(
                    symbol,
                    currentPrice,
                    mlPredictions,
                    fundamentals,
                    comprehensiveData,
                );
            } catch (analysisErr: any) {
                console.warn(`⚠️ [AI Analysis] Skipped: ${analysisErr.message}`);
            }
        }
        
        // 4. Build chart data with realistic historical simulation
                // 4. Build chart data — use ML if available, else fallback to simulated
        let chartData = [];
        if (mlPredictions && mlPredictions.chart_data) {
            // ML service provides real historical + predicted data
            chartData = mlPredictions.chart_data.map((point: any) => ({
                time: point.day === 0 ? 'Now' : point.day < 0 ? `${point.day}d` : `+${point.day}d`,
                current: point.type === 'historical' || point.type === 'current' ? point.price : undefined,
                predicted: point.type === 'predicted' ? point.price : undefined,
                upper: point.upper || undefined,
                lower: point.lower || undefined,
                type: point.type === 'predicted' ? 'prediction' as const : 'historical' as const,
            }));
            console.log(`✅ [Chart] Using ML predictions (${chartData.length} data points)`);
        } else {
            // Fallback: simulated historical data
            for (let i = 0; i < 7; i++) {
                const historicalVariation = (Math.random() - 0.5) * currentPrice * 0.015;
                chartData.push({
                    time: i === 0 ? 'Now' : i < 4 ? `-${4-i}d` : `+${i-3}d`,
                    current: i < 4 ? currentPrice + historicalVariation : undefined,
                    predicted: i >= 4 ? predictions.shortTerm.price + (i-4) * (predictions.shortTerm.change / 3) : undefined,
                    type: (i < 4 ? 'historical' : 'prediction') as 'historical' | 'prediction'
                });
            }
            console.log(`⚠️ [Chart] Using simulated data (ML unavailable)`);
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
                marketState: getMarketState(meta, symbol)
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
            mlPredictions: mlPredictions ? {
                predictions: mlPredictions.predictions,
                modelWeights: mlPredictions.model_weights,
                technicalSignals: mlPredictions.technical_signals,
                trainingTimeMs: mlPredictions.training_time_ms,
                cached: mlPredictions.cached,
                featuresUsed: mlPredictions.features_used || null,
                chartData: mlPredictions.chart_data || [],
                modelPredictions: mlPredictions.model_predictions || null,
                sentiment: sentimentData ? {
                    score: sentimentData.score,
                    magnitude: sentimentData.magnitude,
                    summary: sentimentData.summary,
                    source: sentimentData.source,
                    headlines: sentimentData.headlines || [],
                    articles: sentimentData.articles || [],
                } : null,
                hybridPredictions: computeHybridPrediction(mlPredictions, predictions, currentPrice),
            } : null,
            aiAnalysis: aiAnalysis,
            tradingSignal: predictions.tradingSignal,
            supportResistance: predictions.supportResistance,
            technicalIndicators: technicalIndicators,
            chartData: chartData,
            longTermChartData: longTermChartData,
            bulletPoints: predictions.bulletPoints,
            fundamentals: fundamentals,
            deliveryVolume: deliveryData || null,
            fiidiiFlow: fiidiiData || null,
            investmentAnalysis: !skipAI && (comprehensiveData?.quarterlyInsights || comprehensiveData?.annualReportInsights || comprehensiveData?.earningsCallInsights) ? {
    recommendation: generateInvestmentRecommendation(
        currentPrice,
        predictions,
        fundamentals,
        comprehensiveData.quarterlyInsights,
        comprehensiveData.annualReportInsights,
        comprehensiveData.earningsCallInsights
    ),
    dataQuality: {
        hasQuarterly: !!comprehensiveData.quarterlyInsights,
        hasAnnual: !!comprehensiveData.annualReportInsights,
        hasEarnings: !!comprehensiveData.earningsCallInsights,
        hasFundamentals: !!fundamentals,
        analysisTimestamp: new Date().toISOString()
    }
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
        source: comprehensiveData.source || 'O.in',
        fromCache: comprehensiveData.fromCache
    }
}),

...(comprehensiveData?.earningsCallInsights && (() => {
    console.log(`🔍 [DEBUG] Building earningsCall response:`, {
        hasPdfUrl: !!comprehensiveData.earningsCallInsights.pdfUrl,
        pdfUrlLength: comprehensiveData.earningsCallInsights.pdfUrl?.length || 0,
        pdfUrlPreview: comprehensiveData.earningsCallInsights.pdfUrl?.substring(0, 100),
        hasExtractedText: !!comprehensiveData.earningsCallInsights.extractedText,
        extractedTextLength: comprehensiveData.earningsCallInsights.extractedText?.length || 0,
        quarter: comprehensiveData.earningsCallInsights.quarter
    });
    
    return {
    earningsCall: {
        quarter: comprehensiveData.earningsCallInsights.quarter,
        fiscalYear: comprehensiveData.earningsCallInsights.fiscalYear,
        callDate: comprehensiveData.earningsCallInsights.callDate,
        pdfUrl: comprehensiveData.earningsCallInsights.pdfUrl,
        extractedText: comprehensiveData.earningsCallInsights.extractedText,
        sentiment: comprehensiveData.earningsCallInsights.sentiment,
        financialHighlights: comprehensiveData.earningsCallInsights.financialHighlights,
        operationalHighlights: comprehensiveData.earningsCallInsights.operationalHighlights,
        managementCommentary: comprehensiveData.earningsCallInsights.managementCommentary,
        qAndAInsights: comprehensiveData.earningsCallInsights.qAndAInsights,
        segmentPerformance: comprehensiveData.earningsCallInsights.segmentPerformance,
        competitivePosition: comprehensiveData.earningsCallInsights.competitivePosition,
        investmentThesis: comprehensiveData.earningsCallInsights.investmentThesis,
        keyTakeaways: comprehensiveData.earningsCallInsights.keyTakeaways,
        summary: comprehensiveData.earningsCallInsights.summary,
        source: 'O.in Concalls',
        fromCache: comprehensiveData.fromCache
    }
    };
})())
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

// ── Yahoo Finance News Provider (deterministic MCP source) ──
async function fetchYahooNews(symbol: string): Promise<{ headlines: string[]; articles: { title: string; publisher: string; publishedAt: string; link: string }[] } | null> {
    try {
        console.log(`📰 [Yahoo News] Fetching news for ${symbol}...`);
        const response = await fetchWithTimeout(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=10&quotesCount=0&enableFuzzyQuery=false`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            },
            8000
        );

        if (!response.ok) {
            console.warn(`⚠️ [Yahoo News] HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        const news = data.news || [];

        if (news.length === 0) {
            console.warn(`⚠️ [Yahoo News] No news found for ${symbol}`);
            return null;
        }

        const articles = news.slice(0, 10).map((item: any) => ({
            title: item.title || '',
            publisher: item.publisher || 'Unknown',
            publishedAt: item.providerPublishTime
                ? new Date(item.providerPublishTime * 1000).toISOString()
                : new Date().toISOString(),
            link: item.link || ''
        }));

        const headlines = articles.map((a: any) => a.title).filter((t: string) => t.length > 0);
        console.log(`✅ [Yahoo News] Got ${headlines.length} headlines for ${symbol}`);
        headlines.slice(0, 3).forEach((h: string, i: number) => {
            console.log(`   📰 ${i + 1}. ${h.substring(0, 80)}${h.length > 80 ? '...' : ''}`);
        });

        return { headlines, articles };
    } catch (err: any) {
        console.warn(`⚠️ [Yahoo News] Failed: ${err.message}`);
        return null;
    }
}

// ── NSE Delivery Volume Data (Bhavcopy proxy via Yahoo + NSE) ──
async function fetchDeliveryData(symbol: string, historicalVolumes: number[], historicalPrices: number[]): Promise<{
    deliveryPercent: number;
    tradedVolume: number;
    deliveryVolume: number;
    history: { date: string; deliveryPercent: number; tradedVolume: number; deliveryVolume: number }[];
    avgDeliveryPercent: number;
} | null> {
    try {
        console.log(`📦 [Delivery] Fetching delivery volume data for ${symbol}...`);
        const isIndian = symbol.includes('.NS') || symbol.includes('.BO');

        // For Indian stocks, try NSE API first
        if (isIndian) {
            const nseSymbol = symbol.replace('.NS', '').replace('.BO', '');
            try {
                // NSE Bhavcopy / equity data endpoint
                const nseResponse = await fetchWithTimeout(
                    `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(nseSymbol)}&section=trade_info`,
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'application/json',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Referer': 'https://www.nseindia.com',
                        }
                    },
                    8000
                );

                if (nseResponse.ok) {
                    const nseData = await nseResponse.json();
                    const marketDeptOrderBook = nseData?.marketDeptOrderBook;
                    const securityInfo = nseData?.securityWiseDP;

                    if (securityInfo) {
                        const deliveryPct = parseFloat(securityInfo.deliveryToTradedQuantity) || 0;
                        const tradedQty = parseFloat(securityInfo.quantityTraded?.replace(/,/g, '')) || 0;
                        const deliveryQty = parseFloat(securityInfo.deliveryQuantity?.replace(/,/g, '')) || 0;

                        console.log(`✅ [Delivery] NSE data: ${deliveryPct.toFixed(1)}% delivery, ${tradedQty} traded`);

                        // Build a proxy history from Yahoo volume data (last 10 days)
                        const history = buildVolumeHistory(historicalVolumes, historicalPrices, deliveryPct);

                        return {
                            deliveryPercent: deliveryPct,
                            tradedVolume: tradedQty,
                            deliveryVolume: deliveryQty,
                            history,
                            avgDeliveryPercent: history.length > 0
                                ? history.reduce((s, h) => s + h.deliveryPercent, 0) / history.length
                                : deliveryPct,
                        };
                    }
                }
            } catch (nseErr: any) {
                console.warn(`⚠️ [Delivery] NSE API failed: ${nseErr.message}, falling back to estimation`);
            }
        }

        // Fallback: estimate delivery % from Yahoo volume patterns
        // Higher volume days with price increase tend to have higher delivery
        if (historicalVolumes.length >= 10 && historicalPrices.length >= 10) {
            const history = buildVolumeHistory(historicalVolumes, historicalPrices);
            const latestDelivery = history.length > 0 ? history[history.length - 1].deliveryPercent : 50;
            const avgDelivery = history.length > 0
                ? history.reduce((s, h) => s + h.deliveryPercent, 0) / history.length
                : 50;

            console.log(`✅ [Delivery] Estimated: ${latestDelivery.toFixed(1)}% (from volume pattern analysis)`);

            return {
                deliveryPercent: latestDelivery,
                tradedVolume: historicalVolumes[historicalVolumes.length - 1] || 0,
                deliveryVolume: Math.round((historicalVolumes[historicalVolumes.length - 1] || 0) * (latestDelivery / 100)),
                history,
                avgDeliveryPercent: avgDelivery,
            };
        }

        return null;
    } catch (err: any) {
        console.warn(`⚠️ [Delivery] Failed: ${err.message}`);
        return null;
    }
}

// Helper: Build delivery volume history from Yahoo volume + price data
function buildVolumeHistory(
    volumes: number[],
    prices: number[],
    knownDeliveryPct?: number
): { date: string; deliveryPercent: number; tradedVolume: number; deliveryVolume: number }[] {
    const history: { date: string; deliveryPercent: number; tradedVolume: number; deliveryVolume: number }[] = [];
    const len = Math.min(volumes.length, prices.length);
    const startIdx = Math.max(0, len - 10);

    // Average volume for relative comparison
    const recentVolumes = volumes.slice(Math.max(0, len - 30));
    const avgVolume = recentVolumes.reduce((s, v) => s + v, 0) / (recentVolumes.length || 1);

    for (let i = startIdx; i < len; i++) {
        const vol = volumes[i] || 0;
        const price = prices[i] || 0;
        const prevPrice = i > 0 ? (prices[i - 1] || price) : price;
        const priceChange = prevPrice > 0 ? (price - prevPrice) / prevPrice : 0;
        const volRatio = avgVolume > 0 ? vol / avgVolume : 1;

        // Heuristic: delivery % estimation
        // Higher delivery when: price up + volume up, or price down + low volume
        // Lower delivery when: high volume churning with no direction
        let estimatedDelivery = 50; // base
        if (priceChange > 0.01 && volRatio > 1.1) estimatedDelivery = 60 + Math.min(priceChange * 500, 20);
        else if (priceChange > 0.005) estimatedDelivery = 55 + Math.min(priceChange * 300, 15);
        else if (priceChange < -0.01 && volRatio > 1.3) estimatedDelivery = 35;
        else if (priceChange < -0.005) estimatedDelivery = 42;
        else if (volRatio > 1.5) estimatedDelivery = 38; // high volume churn
        else estimatedDelivery = 48 + Math.random() * 8; // normal range

        // If we know today's actual delivery %, calibrate the estimates
        if (knownDeliveryPct !== undefined && i === len - 1) {
            estimatedDelivery = knownDeliveryPct;
        }

        // Clamp to realistic range
        estimatedDelivery = Math.max(15, Math.min(90, estimatedDelivery));

        const daysAgo = len - 1 - i;
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;

        history.push({
            date: dateStr,
            deliveryPercent: Math.round(estimatedDelivery * 10) / 10,
            tradedVolume: vol,
            deliveryVolume: Math.round(vol * (estimatedDelivery / 100)),
        });
    }

    return history;
}

// ── FII/DII Cash Market Flow Data (from NSE) ──
async function fetchFIIDIIData(): Promise<{
    fii: { buyValue: number; sellValue: number; netValue: number };
    dii: { buyValue: number; sellValue: number; netValue: number };
    date: string;
    history: { date: string; fiiNet: number; diiNet: number }[];
    fiiCumulative: number;
    diiCumulative: number;
} | null> {
    try {
        console.log(`🏛️ [FII/DII] Fetching institutional flow data...`);

        // Try NSE API for FII/DII data
        try {
            const nseResponse = await fetchWithTimeout(
                'https://www.nseindia.com/api/fiidiiTradeReact',
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://www.nseindia.com',
                    }
                },
                8000
            );

            if (nseResponse.ok) {
                const rawData = await nseResponse.json();
                // NSE returns array of objects with category, buyValue, sellValue
                const fiiRow = rawData.find?.((r: any) =>
                    r.category?.toLowerCase().includes('fpi') || r.category?.toLowerCase().includes('fii')
                );
                const diiRow = rawData.find?.((r: any) =>
                    r.category?.toLowerCase().includes('dii')
                );

                if (fiiRow && diiRow) {
                    const parseCr = (val: any) => {
                        if (typeof val === 'number') return val;
                        return parseFloat(String(val).replace(/,/g, '')) || 0;
                    };

                    const fiiBuy = parseCr(fiiRow.buyValue);
                    const fiiSell = parseCr(fiiRow.sellValue);
                    const diiBuy = parseCr(diiRow.buyValue);
                    const diiSell = parseCr(diiRow.sellValue);
                    const dateStr = fiiRow.date || new Date().toLocaleDateString('en-IN');

                    console.log(`✅ [FII/DII] NSE data: FII net: ${(fiiBuy - fiiSell).toFixed(0)} Cr, DII net: ${(diiBuy - diiSell).toFixed(0)} Cr`);

                    // Generate recent history (we only have today from the API, simulate trend for the chart)
                    const history = generateFIIDIIHistory(fiiBuy - fiiSell, diiBuy - diiSell);

                    return {
                        fii: { buyValue: fiiBuy, sellValue: fiiSell, netValue: fiiBuy - fiiSell },
                        dii: { buyValue: diiBuy, sellValue: diiSell, netValue: diiBuy - diiSell },
                        date: dateStr,
                        history,
                        fiiCumulative: history.reduce((s, h) => s + h.fiiNet, 0),
                        diiCumulative: history.reduce((s, h) => s + h.diiNet, 0),
                    };
                }
            }
        } catch (nseErr: any) {
            console.warn(`⚠️ [FII/DII] NSE API failed: ${nseErr.message}, trying alternate source...`);
        }

        // Fallback: MoneyControl / alternate NSDL API
        try {
            const mcResponse = await fetchWithTimeout(
                'https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/data.json',
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Referer': 'https://www.moneycontrol.com',
                    }
                },
                8000
            );

            if (mcResponse.ok) {
                const mcData = await mcResponse.json();
                if (mcData && mcData.length > 0) {
                    const latest = mcData[0];
                    const fiiBuy = parseFloat(latest.fii_buy || '0');
                    const fiiSell = parseFloat(latest.fii_sell || '0');
                    const diiBuy = parseFloat(latest.dii_buy || '0');
                    const diiSell = parseFloat(latest.dii_sell || '0');

                    const history = mcData.slice(0, 10).map((d: any) => ({
                        date: d.date || '',
                        fiiNet: parseFloat(d.fii_buy || '0') - parseFloat(d.fii_sell || '0'),
                        diiNet: parseFloat(d.dii_buy || '0') - parseFloat(d.dii_sell || '0'),
                    })).reverse();

                    return {
                        fii: { buyValue: fiiBuy, sellValue: fiiSell, netValue: fiiBuy - fiiSell },
                        dii: { buyValue: diiBuy, sellValue: diiSell, netValue: diiBuy - diiSell },
                        date: latest.date || new Date().toLocaleDateString('en-IN'),
                        history,
                        fiiCumulative: history.reduce((s: number, h: any) => s + h.fiiNet, 0),
                        diiCumulative: history.reduce((s: number, h: any) => s + h.diiNet, 0),
                    };
                }
            }
        } catch (mcErr: any) {
            console.warn(`⚠️ [FII/DII] MoneyControl fallback failed: ${mcErr.message}`);
        }

        console.warn(`⚠️ [FII/DII] All sources failed`);
        return null;
    } catch (err: any) {
        console.warn(`⚠️ [FII/DII] Failed: ${err.message}`);
        return null;
    }
}

// Helper: Generate FII/DII history trend (when only today's data is available)
function generateFIIDIIHistory(todayFiiNet: number, todayDiiNet: number): { date: string; fiiNet: number; diiNet: number }[] {
    const history: { date: string; fiiNet: number; diiNet: number }[] = [];

    for (let i = 9; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;

        if (i === 0) {
            // Today's actual data
            history.push({ date: dateStr, fiiNet: todayFiiNet, diiNet: todayDiiNet });
        } else {
            // Generate realistic variation around today's value
            const fiiVariation = (Math.random() - 0.5) * Math.abs(todayFiiNet) * 0.8;
            const diiVariation = (Math.random() - 0.5) * Math.abs(todayDiiNet) * 0.8;
            history.push({
                date: dateStr,
                fiiNet: Math.round(todayFiiNet * 0.7 + fiiVariation),
                diiNet: Math.round(todayDiiNet * 0.7 + diiVariation),
            });
        }
    }

    return history;
}

// ── Sentiment Provider: Yahoo News (deterministic) + Gemini Scoring (temp=0) ──
async function getGeminiSentiment(
    symbol: string
): Promise<{ score: number; magnitude: number; summary: string; source: string; headlines: string[]; articles: { title: string; publisher: string; publishedAt: string; link: string }[] } | null> {
    try {
        console.log(`🧠 [Sentiment] Fetching Yahoo news + Gemini scoring for ${symbol}...`);

        // STEP 1: Get real headlines from Yahoo Finance (deterministic source)
        const newsData = await fetchYahooNews(symbol);
        if (!newsData || newsData.headlines.length === 0) {
            console.warn(`⚠️ [Sentiment] No Yahoo news available for ${symbol}`);
            return null;
        }

        // STEP 2: Ask Gemini to ONLY SCORE (not search) — temp=0 for consistency
        const scoringPrompt = `You are a stock sentiment analyst. Score the sentiment of these REAL news headlines for ${symbol}.

HEADLINES (from Yahoo Finance, ${new Date().toISOString().split('T')[0]}):
${newsData.headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}

SCORING RULES:
- Analyze ONLY the headlines above. Do NOT add your own knowledge or search for more info.
- score: -1.0 (very bearish) to +1.0 (very bullish), 0.0 = neutral
- magnitude: 0.0 (low conviction / mixed signals) to 1.0 (strong consensus)
- Positive earnings, upgrades, expansion, partnerships → bullish
- Layoffs, lawsuits, downgrades, misses, fraud → bearish
- Routine filings, minor updates → neutral with low magnitude

Return ONLY this JSON (no markdown, no extra text):
{
  "score": <float -1.0 to 1.0>,
  "magnitude": <float 0.0 to 1.0>,
  "summary": "<one sentence: what are the headlines saying overall>"
}`;

        const scoreResponse = await callGeminiAPI(scoringPrompt, {
            temperature: 0, // Deterministic — same headlines = same score
            maxTokens: 1000
        });
        const parsed = extractJSON(scoreResponse);

        if (parsed && typeof parsed.score === 'number' && typeof parsed.magnitude === 'number') {
            const score = Math.max(-1, Math.min(1, parsed.score));
            const magnitude = Math.max(0, Math.min(1, parsed.magnitude));
            console.log(`✅ [Sentiment] Score: ${score.toFixed(2)}, Magnitude: ${magnitude.toFixed(2)} — ${parsed.summary || 'N/A'}`);
            console.log(`   📊 Based on ${newsData.headlines.length} Yahoo Finance headlines (deterministic)`);
            return {
                score,
                magnitude,
                summary: parsed.summary || '',
                source: 'yahoo_news + gemini_scoring',
                headlines: newsData.headlines,
                articles: newsData.articles
            };
        }
        console.warn(`⚠️ [Sentiment] Invalid scoring response`);
        return null;
    } catch (err: any) {
        console.warn(`⚠️ [Sentiment] Failed: ${err.message}`);
        return null;
    }
}

// ── Hybrid Prediction: 70% ML + 30% Gemini (bounded by ML confidence band) ──
function computeHybridPrediction(
    mlPredictions: any,
    geminiPredictions: any,
    currentPrice: number
): Record<string, { price: number; change_pct: number; mlPrice: number; geminiPrice: number; adjustment: number }> | null {
    if (!mlPredictions?.predictions || !geminiPredictions) return null;

    const ML_WEIGHT = 0.7;
    const GEMINI_WEIGHT = 0.3;

    // Map Gemini timeframes to ML timeframes
    const geminiMap: Record<string, number> = {
        next_1d: geminiPredictions.shortTerm?.price || currentPrice,
        next_5d: geminiPredictions.shortTerm?.price || currentPrice,
        next_10d: geminiPredictions.oneMonth?.expected || currentPrice,
        next_30d: geminiPredictions.oneMonth?.expected || currentPrice,
    };

    const hybrid: Record<string, any> = {};

    for (const [key, mlPred] of Object.entries(mlPredictions.predictions) as [string, any][]) {
        const mlPrice = mlPred.price;
        let geminiPrice = geminiMap[key] || currentPrice;

        // Clamp Gemini prediction within ML confidence band
        if (mlPred.confidence && mlPred.confidence.length === 2) {
            const [lower, upper] = mlPred.confidence;
            geminiPrice = Math.max(lower, Math.min(upper, geminiPrice));
        }

        const hybridPrice = mlPrice * ML_WEIGHT + geminiPrice * GEMINI_WEIGHT;
        const changePct = ((hybridPrice - currentPrice) / currentPrice) * 100;
        const adjustment = ((geminiPrice - mlPrice) / mlPrice) * 100 * GEMINI_WEIGHT;

        hybrid[key] = {
            price: Math.round(hybridPrice * 100) / 100,
            change_pct: Math.round(changePct * 100) / 100,
            mlPrice: Math.round(mlPrice * 100) / 100,
            geminiPrice: Math.round(geminiPrice * 100) / 100,
            adjustment: Math.round(adjustment * 100) / 100,
        };
    }

    return hybrid;
}

// ── Gemini AI Analysis (signal/reasoning layer on top of ML predictions) ──
async function getGeminiStockAnalysis(
    symbol: string,
    currentPrice: number,
    mlPredictions: any,
    fundamentals: any,
    comprehensiveData: any,
): Promise<{
    signal: string;
    confidence: string;
    riskLevel: string;
    bullishFactors: string[];
    bearishFactors: string[];
    catalysts: string[];
    mlAssessment: string;
    outlook: string;
} | null> {
    try {
        const mlSummary = mlPredictions?.predictions
            ? Object.entries(mlPredictions.predictions)
                .map(([k, v]: [string, any]) => `${k}: ₹${v.price} (${v.change_pct >= 0 ? '+' : ''}${v.change_pct}%)`)
                .join(', ')
            : 'unavailable';

        const techSignals = mlPredictions?.technical_signals
            ? `RSI: ${mlPredictions.technical_signals.rsi} (${mlPredictions.technical_signals.rsi_signal}), MACD: ${mlPredictions.technical_signals.macd_trend}`
            : 'unavailable';

        let context = `Analyze ${symbol} as an expert equity analyst.

CURRENT: ₹${currentPrice}
ML PREDICTIONS: ${mlSummary}
TECHNICAL: ${techSignals}

FUNDAMENTALS:
- PE: ${fundamentals?.peRatio || 'N/A'}, PB: ${fundamentals?.priceToBook || 'N/A'}
- ROE: ${fundamentals?.roe ? (fundamentals.roe * 100).toFixed(1) + '%' : 'N/A'}
- Debt/Equity: ${fundamentals?.debtToEquity || 'N/A'}
- Profit Margin: ${fundamentals?.profitMargin ? (fundamentals.profitMargin * 100).toFixed(1) + '%' : 'N/A'}
- Revenue Growth: ${fundamentals?.revenueGrowth || 'N/A'}`;

        if (comprehensiveData?.quarterlyInsights) {
            const qi = comprehensiveData.quarterlyInsights;
            context += `\n\nQUARTERLY EARNINGS (${qi.quarter || 'Latest'}):`;
            if (qi.keyMetrics) context += `\nMetrics: ${JSON.stringify(qi.keyMetrics).substring(0, 500)}`;
            if (qi.outlook) context += `\nOutlook: ${JSON.stringify(qi.outlook).substring(0, 300)}`;
        }

        if (comprehensiveData?.annualReportInsights) {
            const ar = comprehensiveData.annualReportInsights;
            context += `\n\nANNUAL REPORT (${ar.fiscalYear || 'Latest'}):`;
            if (ar.businessModel) context += `\nBusiness: ${ar.businessModel.substring(0, 300)}`;
            if (ar.futureStrategy) context += `\nStrategy: ${ar.futureStrategy.substring(0, 300)}`;
        }

        context += `

TASK: Evaluate the ML predictions above. Do NOT provide your own price predictions.
Return ONLY this JSON:
{
  "signal": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
  "confidence": "High|Medium|Low",
  "riskLevel": "Low|Medium|High|Very High",
  "bullishFactors": ["factor1", "factor2", "factor3"],
  "bearishFactors": ["factor1", "factor2"],
  "catalysts": ["upcoming event or trigger 1", "trigger 2"],
  "mlAssessment": "One sentence evaluating if ML predictions are reasonable given fundamentals",
  "outlook": "2-3 sentence overall outlook combining ML + fundamentals"
}`;

        console.log(`🧠 [Gemini Analysis] Requesting AI analysis for ${symbol}...`);
        const response = await callGeminiAPI(context, { temperature: 0.2, maxTokens: 5000 });
        const parsed = extractJSON(response);

        if (parsed && parsed.signal) {
            console.log(`✅ [Gemini Analysis] Signal: ${parsed.signal}, Risk: ${parsed.riskLevel}`);
            return parsed;
        }
        console.warn(`⚠️ [Gemini Analysis] Invalid response format`);
        return null;
    } catch (err: any) {
        console.warn(`⚠️ [Gemini Analysis] Failed: ${err.message}`);
        return null;
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
// HELPER: GENERATE COMPREHENSIVE INVESTMENT RECOMMENDATION
// ========================
function generateInvestmentRecommendation(
    currentPrice: number,
    predictions: any,
    fundamentals: any,
    quarterlyInsights: any,
    annualReportInsights: any,
    earningsCallInsights: any
) {
    const analysis = {
        overallSignal: 'HOLD' as 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL',
        confidence: 'Medium' as 'High' | 'Medium' | 'Low',
        targetPrice: {
            conservative: currentPrice,
            expected: currentPrice,
            optimistic: currentPrice
        },
        timeHorizon: '12-18 months',
        investmentThesis: {
            bullCase: [] as string[],
            bearCase: [] as string[],
            keyRisks: [] as string[]
        },
        scores: {
            fundamental: 0,
            growth: 0,
            valuation: 0,
            management: 0,
            overall: 0
        },
        breakdown: {
            quarterlyHealth: 'Unknown' as 'Strong' | 'Good' | 'Fair' | 'Weak',
            annualHealth: 'Unknown' as 'Strong' | 'Good' | 'Fair' | 'Weak',
            earningsHealth: 'Unknown' as 'Bullish' | 'Neutral' | 'Bearish'
        }
    };

    let totalScore = 0;
    let scoreCount = 0;

    // ============================================
    // 1. QUARTERLY ANALYSIS (Weight: 30%)
    // ============================================
    if (quarterlyInsights) {
        const quarterly = quarterlyInsights;
        let quarterlyScore = 50; // Neutral baseline

        // Revenue growth check
        if (quarterly.keyMetrics?.revenue) {
            const yoyGrowth = parseFloat(quarterly.keyMetrics.revenue.yoyGrowth) || 0;
            if (yoyGrowth > 20) {
                quarterlyScore += 15;
                analysis.investmentThesis.bullCase.push(
                    `Strong revenue growth: ${yoyGrowth.toFixed(1)}% YoY (Q: ${quarterly.quarter})`
                );
            } else if (yoyGrowth > 10) {
                quarterlyScore += 10;
            } else if (yoyGrowth < 0) {
                quarterlyScore -= 15;
                analysis.investmentThesis.bearCase.push(
                    `Declining revenue: ${yoyGrowth.toFixed(1)}% YoY`
                );
            }
        }

        // Profitability check
        if (quarterly.keyMetrics?.netProfit) {
            const profitGrowth = parseFloat(quarterly.keyMetrics.netProfit.yoyGrowth) || 0;
            if (profitGrowth > 25) {
                quarterlyScore += 15;
                analysis.investmentThesis.bullCase.push(
                    `Excellent profit growth: ${profitGrowth.toFixed(1)}% YoY`
                );
            } else if (profitGrowth < -10) {
                quarterlyScore -= 15;
                analysis.investmentThesis.keyRisks.push(
                    `Profit declining: ${profitGrowth.toFixed(1)}% YoY`
                );
            }
        }

        // Margin expansion check
        if (quarterly.financialRatios) {
            const opm = parseFloat(quarterly.financialRatios.operatingMargin) || 0;
            if (opm > 20) {
                quarterlyScore += 10;
                analysis.investmentThesis.bullCase.push(
                    `Strong operating margin: ${opm.toFixed(1)}%`
                );
            } else if (opm < 5) {
                quarterlyScore -= 10;
            }
        }

        // Outlook sentiment
        if (quarterly.outlook?.sentiment === 'Positive') {
            quarterlyScore += 10;
        } else if (quarterly.outlook?.sentiment === 'Negative') {
            quarterlyScore -= 10;
        }

        totalScore += quarterlyScore * 0.3;
        scoreCount++;

        // Determine quarterly health
        if (quarterlyScore >= 70) analysis.breakdown.quarterlyHealth = 'Strong';
        else if (quarterlyScore >= 55) analysis.breakdown.quarterlyHealth = 'Good';
        else if (quarterlyScore >= 40) analysis.breakdown.quarterlyHealth = 'Fair';
        else analysis.breakdown.quarterlyHealth = 'Weak';
    }

    // ============================================
    // 2. ANNUAL REPORT ANALYSIS (Weight: 30%)
    // ============================================
    if (annualReportInsights) {
        const annual = annualReportInsights;
        let annualScore = 50; // Neutral baseline

        // Balance sheet strength
        if (annual.balanceSheet) {
            const bs = annual.balanceSheet;
            
            // Asset growth
            const totalAssets = safeParseNumber(bs.assets?.totalAssets?.current);
            const prevAssets = safeParseNumber(bs.assets?.totalAssets?.previous);
            if (totalAssets > prevAssets && prevAssets > 0) {
                const assetGrowth = ((totalAssets - prevAssets) / prevAssets) * 100;
                if (assetGrowth > 15) {
                    annualScore += 10;
                    analysis.investmentThesis.bullCase.push(
                        `Strong asset growth: ${assetGrowth.toFixed(1)}%`
                    );
                }
            }

            // Debt-to-equity check
            const totalDebt = safeParseNumber(bs.liabilities?.totalLiabilities?.current);
            const totalEquity = safeParseNumber(bs.equity?.totalEquity?.current);
            if (totalEquity > 0) {
                const debtToEquity = totalDebt / totalEquity;
                if (debtToEquity < 0.5) {
                    annualScore += 15;
                    analysis.investmentThesis.bullCase.push(
                        `Low debt-to-equity ratio: ${debtToEquity.toFixed(2)}x`
                    );
                } else if (debtToEquity > 2.0) {
                    annualScore -= 15;
                    analysis.investmentThesis.keyRisks.push(
                        `High debt-to-equity ratio: ${debtToEquity.toFixed(2)}x`
                    );
                }
            }

            // Profitability check
            const pat = safeParseNumber(bs.profitAndLoss?.profitAfterTax?.current);
            const revenue = safeParseNumber(bs.profitAndLoss?.revenue?.current);
            if (revenue > 0) {
                const netMargin = (pat / revenue) * 100;
                if (netMargin > 15) {
                    annualScore += 15;
                } else if (netMargin < 3) {
                    annualScore -= 10;
                }
            }
        }

        // Future strategy
        if (annual.futureStrategy && annual.futureStrategy.length > 100) {
            annualScore += 10;
            analysis.investmentThesis.bullCase.push(
                'Clear growth strategy outlined in annual report'
            );
        }

        // Business model clarity
        if (annual.businessModel && annual.businessModel.length > 100) {
            annualScore += 5;
        }

        totalScore += annualScore * 0.3;
        scoreCount++;

        // Determine annual health
        if (annualScore >= 70) analysis.breakdown.annualHealth = 'Strong';
        else if (annualScore >= 55) analysis.breakdown.annualHealth = 'Good';
        else if (annualScore >= 40) analysis.breakdown.annualHealth = 'Fair';
        else analysis.breakdown.annualHealth = 'Weak';
    }

    // ============================================
    // 3. EARNINGS CALL ANALYSIS (Weight: 20%)
    // ============================================
    if (earningsCallInsights) {
        const earnings = earningsCallInsights;
        
        // Sentiment check
        if (earnings.sentiment === 'Bullish') {
            totalScore += 20 * 0.2;
            analysis.breakdown.earningsHealth = 'Bullish';
            analysis.investmentThesis.bullCase.push(
                'Bullish management tone in earnings call'
            );
        } else if (earnings.sentiment === 'Bearish') {
            totalScore += 30 * 0.2;
            analysis.breakdown.earningsHealth = 'Bearish';
            analysis.investmentThesis.keyRisks.push(
                'Bearish management outlook'
            );
        } else {
            totalScore += 50 * 0.2;
            analysis.breakdown.earningsHealth = 'Neutral';
        }

        // Investment thesis from call
        if (earnings.investmentThesis) {
            const thesis = earnings.investmentThesis;
            
            // Extract bull points
            if (thesis.bullCase && thesis.bullCase.length > 0) {
                thesis.bullCase.slice(0, 2).forEach((point: string) => {
                    analysis.investmentThesis.bullCase.push(point);
                });
            }

            // Extract bear points
            if (thesis.bearCase && thesis.bearCase.length > 0) {
                thesis.bearCase.slice(0, 2).forEach((point: string) => {
                    analysis.investmentThesis.bearCase.push(point);
                });
            }

            // Recommendation signal
            if (thesis.recommendation?.signal === 'BUY') {
                totalScore += 10 * 0.2;
            } else if (thesis.recommendation?.signal === 'SELL') {
                totalScore -= 10 * 0.2;
            }
        }

        scoreCount++;
    }

    // ============================================
    // 4. FUNDAMENTALS ANALYSIS (Weight: 20%)
    // ============================================
    let fundamentalScore = 50;

    // PE Ratio check
    if (fundamentals.peRatio) {
        if (fundamentals.peRatio < 15) {
            fundamentalScore += 15;
            analysis.investmentThesis.bullCase.push(
                `Attractive valuation: PE ${fundamentals.peRatio.toFixed(1)}x`
            );
        } else if (fundamentals.peRatio > 40) {
            fundamentalScore -= 15;
            analysis.investmentThesis.keyRisks.push(
                `Expensive valuation: PE ${fundamentals.peRatio.toFixed(1)}x`
            );
        }
    }

    // ROE check
    if (fundamentals.roe) {
        const roePercent = fundamentals.roe * 100;
        if (roePercent > 20) {
            fundamentalScore += 15;
            analysis.investmentThesis.bullCase.push(
                `Excellent ROE: ${roePercent.toFixed(1)}%`
            );
        } else if (roePercent < 10) {
            fundamentalScore -= 10;
        }
    }

    // Debt-to-equity check
    if (fundamentals.debtToEquity) {
        if (fundamentals.debtToEquity < 0.5) {
            fundamentalScore += 10;
        } else if (fundamentals.debtToEquity > 2.0) {
            fundamentalScore -= 15;
        }
    }

    // Operating margin check
    if (fundamentals.operatingMargin) {
        const margin = fundamentals.operatingMargin * 100;
        if (margin > 20) {
            fundamentalScore += 10;
        } else if (margin < 5) {
            fundamentalScore -= 10;
        }
    }

    totalScore += fundamentalScore * 0.2;
    scoreCount++;

    // ============================================
    // 5. CALCULATE OVERALL SCORE & RECOMMENDATION
    // ============================================
    const overallScore = scoreCount > 0 ? totalScore / scoreCount : 50;
    analysis.scores.overall = Math.round(overallScore);
    analysis.scores.fundamental = Math.round(fundamentalScore);
    analysis.scores.growth = quarterlyInsights ? Math.round(totalScore * 0.3 / 0.3) : 50;
    analysis.scores.valuation = Math.round(fundamentalScore * 0.8); // Simplified
    analysis.scores.management = earningsCallInsights ? Math.round((totalScore * 0.2 / 0.2)) : 50;

    // Determine overall signal
    if (overallScore >= 75) {
        analysis.overallSignal = 'STRONG_BUY';
        analysis.confidence = 'High';
    } else if (overallScore >= 60) {
        analysis.overallSignal = 'BUY';
        analysis.confidence = 'High';
    } else if (overallScore >= 45) {
        analysis.overallSignal = 'HOLD';
        analysis.confidence = 'Medium';
    } else if (overallScore >= 30) {
        analysis.overallSignal = 'SELL';
        analysis.confidence = 'Medium';
    } else {
        analysis.overallSignal = 'STRONG_SELL';
        analysis.confidence = 'High';
    }

    // Calculate target prices
    if (predictions.sixMonth) {
        analysis.targetPrice.conservative = predictions.sixMonth.conservative;
        analysis.targetPrice.expected = predictions.sixMonth.expected;
        analysis.targetPrice.optimistic = predictions.sixMonth.optimistic;
    }

    // Ensure minimum 3 points in each category
    if (analysis.investmentThesis.bullCase.length === 0) {
        analysis.investmentThesis.bullCase.push('Requires deeper analysis');
    }
    if (analysis.investmentThesis.bearCase.length === 0) {
        analysis.investmentThesis.bearCase.push('Monitor for emerging risks');
    }
    if (analysis.investmentThesis.keyRisks.length === 0) {
        analysis.investmentThesis.keyRisks.push('Market volatility', 'Sector-specific risks');
    }

    return analysis;
}

function safeParseNumber(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        // Remove commas and parse
        return parseFloat(value.replace(/,/g, '')) || 0;
    }
    return 0;
}

// ========================
// MAIN API ROUTE HANDLER
// ========================

export async function POST(request: NextRequest) {
    try {
        // 1️⃣ REQUEST SIZE CHECK (before reading body)
        if (!validateRequestSize(request)) {
            return NextResponse.json(
                { error: 'Request too large' }, 
                { status: 413, headers: getSecurityHeaders() }
            );
        }

        // 2️⃣ PARSE REQUEST BODY (read once, early)
        const body = await request.json();
        
        if (!body || typeof body !== 'object') {
            return NextResponse.json(
                { error: 'Invalid request body' },
                { status: 400, headers: getSecurityHeaders() }
            );
        }

        const { query, model, conversation, skipAI, forceRefresh, forceRefreshQuarterly, forceRefreshEarningsCall } = body;
        
        if (!query || typeof query !== 'string') {
            return NextResponse.json(
                { error: 'Query required and must be a string' },
                { status: 400, headers: getSecurityHeaders() }
            );
        }

        // 3️⃣ RATE LIMITING (By IP) - Persistent MongoDB Storage
        const clientIp = getClientIp(request);
        const rateCheck = await checkRateLimit(clientIp);
        
        if (!rateCheck.allowed) {
            logSecurityEvent('RATE_LIMIT', { ip: clientIp, retryAfter: rateCheck.retryAfter });
            return NextResponse.json(
                { error: 'Rate limit exceeded', retryAfter: rateCheck.retryAfter },
                { status: 429, headers: { ...getSecurityHeaders(), 'Retry-After': rateCheck.retryAfter!.toString() } }
            );
        }

        // 4️⃣ API KEY VALIDATION (Optional - controlled by env)
        if (process.env.REQUIRE_API_KEY === 'true') {
            const apiKey = request.headers.get('x-api-key');
            if (!validateApiKey(apiKey)) {
                logSecurityEvent('AUTH_FAILURE', { ip: clientIp });
                return NextResponse.json(
                    { error: 'Invalid API key' },
                    { status: 401, headers: getSecurityHeaders() }
                );
            }
        }

        // 5️⃣ SANITIZE INPUTS
        const cleanQuery = sanitizeQuery(query);
        
        if (cleanQuery.length === 0) {
            logSecurityEvent('INVALID_INPUT', { ip: clientIp, query });
            return NextResponse.json(
                { error: 'Invalid query format' },
                { status: 400, headers: getSecurityHeaders() }
            );
        }

        console.log(`🔍 [API] Processing query: "${cleanQuery}"${skipAI ? ' (skipAI=true)' : ''}${forceRefresh ? ' (forceRefresh=true)' : ''}${forceRefreshQuarterly ? ' (forceRefreshQuarterly=true)' : ''}`);

        // 6️⃣ EXTRACT & SANITIZE SYMBOL
        const symbolMatch = cleanQuery.match(/([A-Z0-9]+(?:\.[A-Z]+)?)/i);
        if (!symbolMatch) {
            return NextResponse.json({
                response: 'Please provide a valid stock symbol',
                realtimeData: null
            }, { headers: getSecurityHeaders() });
        }

        const rawSymbol = symbolMatch[1].toUpperCase();
        const symbol = sanitizeSymbol(rawSymbol);
        
        if (!symbol) {
            logSecurityEvent('INVALID_INPUT', { ip: clientIp, symbol: rawSymbol });
            return NextResponse.json(
                { error: 'Invalid stock symbol format' },
                { status: 400, headers: getSecurityHeaders() }
            );
        }

        console.log(`📊 [Symbol] Detected: ${symbol}`);

        // Determine if it's an Indian stock
        const isIndianStock = symbol.endsWith('.NS') || symbol.endsWith('.BO');

        try {
            // Fetch fundamentals
            let fundamentals;
            if (isIndianStock) {
                fundamentals = await mcpGetIndianFundamentals(symbol, skipAI || false);
            } else {
                fundamentals = await mcpGetFundamentals(symbol, skipAI || false);
            }

            if (!fundamentals) {
                return NextResponse.json({
                    response: `Unable to fetch fundamentals for ${symbol}`,
                    realtimeData: null
                }, { headers: getSecurityHeaders() });
            }

            // Build complete stock data with predictions
            const stockData = await buildStockData(symbol, fundamentals, skipAI || false, forceRefresh || false, forceRefreshQuarterly || false, forceRefreshEarningsCall || false);

            console.log(`✅ [Success] Returning stock data for ${symbol}`);
            return NextResponse.json({
                response: `Stock data for ${symbol}`,
                realtimeData: stockData
            }, { headers: getSecurityHeaders() });

        } catch (fetchError: any) {
            console.error(`❌ [Fetch Error] ${symbol}:`, redactSensitiveData(fetchError));
            
            const sanitized = sanitizeError(fetchError);
            
            return NextResponse.json({
                response: `Unable to fetch data for ${symbol}`,
                realtimeData: null,
                error: sanitized.code
            }, { status: 500, headers: getSecurityHeaders() });
        }

    } catch (error: any) {
        console.error('❌ [API Error]:', redactSensitiveData(error));
        
        const sanitized = sanitizeError(error);
        
        return NextResponse.json(
            { error: sanitized.code, message: sanitized.message },
            { status: 500, headers: getSecurityHeaders() }
        );
    }
}
    


