/**
 * Screener.in Data Scraper Module
 * Fetches quarterly transcripts and annual reports from authenticated session
 * 
 * IMPORTANT: Personal use only, respects rate limits and ToS
 */

import { load } from 'cheerio';
import { getAuthenticatedSession, waitForRateLimit, clearSession } from './screenerAuth';
import { downloadAndParsePDF } from './pdfParser';
import { extractTextFromPDF } from './geminiVision';
import { normalizeFiscalYear, getLatestFiscalYear, compareFiscalYears } from './fiscalYearMapper';
import { waitForBSERequest } from './rateLimiter';
import * as fs from 'fs';
import * as path from 'path';

export interface ScreenerTranscript {
    quarter: string;
    date: string;
    content: string;
    url: string;
    source: 'Screener.in Direct';
}

export interface ScreenerAnnualReport {
    fiscalYear: string;
    content: string;
    url: string;
    source: 'Screener.in Direct' | 'BSE PDF' | 'BSE PDF (OCR)';
}

export interface AnnualReportPDFLink {
    fiscalYear: string;
    url: string;
    source: string;
}

/**
 * Fetch quarterly earnings transcript from screener.in
 */
export async function fetchScreenerTranscript(symbol: string): Promise<ScreenerTranscript | null> {
    try {
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        console.log(`📄 [Screener] Fetching transcript for ${cleanSymbol}...`);

        // Get authenticated session
        const cookies = await getAuthenticatedSession();
        if (!cookies) {
            console.error('❌ [Screener] Authentication failed');
            return null;
        }

        // Wait for rate limit
        await waitForRateLimit();

        // Fetch company page
        const companyUrl = `https://www.screener.in/company/${cleanSymbol}/`;
        const response = await fetch(companyUrl, {
            headers: {
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        if (!response.ok) {
            console.error(`❌ [Screener] Failed to fetch ${companyUrl}: ${response.status}`);
            if (response.status === 403 || response.status === 401) {
                console.log('🔄 [Screener] Session expired, clearing cache...');
                clearSession();
            }
            return null;
        }

        const html = await response.text();
        const $ = load(html);

        // Look for "Transcript" links (screener.in shows external PDF links)
        let transcriptUrl: string | null = null;
        let quarter: string = 'Latest Quarter';
        let date: string = new Date().toISOString().split('T')[0];

        // screener.in displays transcript links as external PDFs (BSE, company IR sites)
        // Look for links with text "Transcript"
        let foundTranscript = false;
        $('a:contains("Transcript")').each((i, elem) => {
            if (!foundTranscript) {
                const href = $(elem).attr('href') || '';
                const text = $(elem).text().trim();
                
                // Filter for actual transcript PDFs (not just any link with "transcript" text)
                if (text === 'Transcript' && (href.includes('.pdf') || href.includes('bseindia.com') || href.includes('tcs.com'))) {
                    transcriptUrl = href;
                    foundTranscript = true;
                    
                    // Try to extract quarter from surrounding context
                    const row = $(elem).closest('tr');
                    if (row.length > 0) {
                        const firstCell = row.find('td').first().text().trim();
                        if (firstCell) quarter = firstCell;
                    }
                    
                    // Try to extract date from link text or URL
                    const linkText = href.toLowerCase();
                    const yearMatch = linkText.match(/20\d{2}/);
                    if (yearMatch) {
                        date = `${yearMatch[0]}-01-01`; // Approximate date from year
                    }
                }
            }
        });

        if (!transcriptUrl) {
            console.warn(`⚠️ [Screener] No transcript PDF found for ${cleanSymbol}`);
            return null;
        }

        console.log(`📥 [Screener] Found transcript PDF: ${transcriptUrl}`);
        console.log(`ℹ️ [Screener] PDF transcripts require parsing - letting Gemini Search handle transcript summarization`);
        
        // screener.in provides links to transcript PDFs (BSE, company IR sites)
        // Rather than parsing PDFs, we let Gemini Search handle transcript summarization
        // This is simpler and Gemini does an excellent job summarizing from web sources
        
        // Return null to trigger Gemini fallback for transcript
        // (Annual report data from screener.in is still valuable and will be used)
        return null;

    } catch (error: any) {
        console.error(`❌ [Screener] Error fetching transcript:`, error.message);
        return null;
    }
}

/**
 * Fetch annual report from screener.in
 */
export async function fetchScreenerAnnualReport(symbol: string): Promise<ScreenerAnnualReport | null> {
    try {
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        console.log(`📊 [Screener] Fetching annual report for ${cleanSymbol}...`);

        // Try to fetch full PDF from BSE via Screener.in Documents section
        console.log(`📄 [Screener] Attempting to fetch full annual report PDF from BSE...`);
        const latestFY = getLatestFiscalYear();
        const pdfReport = await fetchAnnualReportFromPDF(cleanSymbol, latestFY);
        
        if (pdfReport && pdfReport.content.length >= 30000) {
            console.log(`✅ [Screener] Successfully fetched full annual report PDF (${pdfReport.content.length.toLocaleString()} chars)`);
            return pdfReport;
        }

        // Fallback: Scrape basic data from Screener.in main page if PDF fetch fails
        console.log(`⚠️ [Screener] PDF fetch failed or too short, falling back to page scraping...`);

        // Get authenticated session
        const cookies = await getAuthenticatedSession();
        if (!cookies) {
            console.error('❌ [Screener] Authentication failed');
            return null;
        }

        // Wait for rate limit
        await waitForRateLimit();

        // Fetch company page
        const companyUrl = `https://www.screener.in/company/${cleanSymbol}/`;
        const response = await fetch(companyUrl, {
            headers: {
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        if (!response.ok) {
            console.error(`❌ [Screener] Failed to fetch ${companyUrl}: ${response.status}`);
            return null;
        }

        const html = await response.text();
        const $ = load(html);

        // Extract comprehensive annual report information from the page
        let content = '';
        
        // Extract fiscal year from the first table header (usually shows latest FY in columns)
        let fiscalYear = 'Latest';
        const firstTableHeader = $('.data-table').first().find('th').last().text().trim();
        const fyMatch = firstTableHeader.match(/Mar[\s']*'?(\d{2})/i) || html.match(/FY\s*'?(\d{2})/i) || html.match(/FY\s*(20\d{2})/i);
        if (fyMatch) {
            const year = fyMatch[1].length === 2 ? `20${fyMatch[1]}` : fyMatch[1];
            fiscalYear = `FY${year}`;
            console.log(`📅 [Screener] Detected fiscal year: ${fiscalYear}`);
        }

        // Section 1: Company Overview
        const companyName = $('h1').first().text().trim();
        content += `=== COMPANY OVERVIEW ===\nCompany: ${companyName}\n\n`;

        // Section 2: Key Metrics
        content += `=== KEY FINANCIAL METRICS ===\n`;
        $('.top-ratios, .number').each((i, elem) => {
            const label = $(elem).find('.name, .sub').text().trim();
            const value = $(elem).find('.value, .number').text().trim();
            if (label && value) {
                content += `${label}: ${value}\n`;
            }
        });

        // Section 3: Quarterly Results
        content += `\n=== QUARTERLY RESULTS ===\n`;
        $('.data-table').first().find('tr').each((i, row) => {
            const cells = $(row).find('td, th');
            const rowText = cells.map((j, cell) => $(cell).text().trim()).get().join(' | ');
            if (rowText) {
                content += `${rowText}\n`;
            }
        });

        // Section 4: Profit & Loss
        content += `\n=== PROFIT & LOSS ===\n`;
        $('#profit-loss').next('.data-table').find('tr').each((i, row) => {
            const cells = $(row).find('td, th');
            const rowText = cells.map((j, cell) => $(cell).text().trim()).get().join(' | ');
            if (rowText) {
                content += `${rowText}\n`;
            }
        });

        // Section 5: Balance Sheet
        content += `\n=== BALANCE SHEET ===\n`;
        $('#balance-sheet').next('.data-table').find('tr').each((i, row) => {
            const cells = $(row).find('td, th');
            const rowText = cells.map((j, cell) => $(cell).text().trim()).get().join(' | ');
            if (rowText) {
                content += `${rowText}\n`;
            }
        });

        // Section 6: Cash Flow
        content += `\n=== CASH FLOWS ===\n`;
        $('#cash-flow').next('.data-table').find('tr').each((i, row) => {
            const cells = $(row).find('td, th');
            const rowText = cells.map((j, cell) => $(cell).text().trim()).get().join(' | ');
            if (rowText) {
                content += `${rowText}\n`;
            }
        });

        // Section 7: Ratios
        content += `\n=== FINANCIAL RATIOS ===\n`;
        $('#ratios').next('.data-table').find('tr').each((i, row) => {
            const cells = $(row).find('td, th');
            const rowText = cells.map((j, cell) => $(cell).text().trim()).get().join(' | ');
            if (rowText) {
                content += `${rowText}\n`;
            }
        });

        // Section 8: Shareholding Pattern
        content += `\n=== SHAREHOLDING PATTERN ===\n`;
        $('#shareholding').next('.data-table').find('tr').each((i, row) => {
            const cells = $(row).find('td, th');
            const rowText = cells.map((j, cell) => $(cell).text().trim()).get().join(' | ');
            if (rowText) {
                content += `${rowText}\n`;
            }
        });

        if (content.length < 500) {
            console.warn(`⚠️ [Screener] Annual report content too short (${content.length} chars)`);
            return null;
        }

        console.log(`✅ [Screener] Fetched annual report summary from page (${content.length} chars)`);

        return {
            fiscalYear,
            content,
            url: companyUrl,
            source: 'Screener.in Direct',
        };

    } catch (error: any) {
        console.error(`❌ [Screener] Error fetching annual report:`, error.message);
        return null;
    }
}

/**
 * Fetch annual report PDF links from screener.in
 * Scrapes the "Annual reports" section for BSE India PDF links
 */
export async function fetchAnnualReportPDFLinks(symbol: string): Promise<AnnualReportPDFLink[]> {
    try {
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        console.log(`🔗 [Screener] Fetching annual report links from Documents section for ${cleanSymbol}...`);

        // Get authenticated session
        const cookies = await getAuthenticatedSession();
        if (!cookies) {
            console.error('❌ [Screener] Authentication failed');
            return [];
        }

        // Wait for rate limit
        await waitForRateLimit();

        // Fetch company page with Documents section
        const companyUrl = `https://www.screener.in/company/${cleanSymbol}/`;
        const response = await fetch(companyUrl, {
            headers: {
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        if (!response.ok) {
            console.error(`❌ [Screener] Failed to fetch ${companyUrl}: ${response.status}`);
            return [];
        }

        const html = await response.text();
        const $ = load(html);

        const pdfLinks: AnnualReportPDFLink[] = [];

        // Look specifically in the "Annual reports" section
        // The structure shows: "Financial Year 2025" with "from bse" label
        // These links redirect to BSE India website
        console.log(`📋 [Screener] Searching for Annual Reports section...`);
        
        // Find all links that contain "Financial Year" and "from bse"
        $('a').each((i, elem) => {
            const href = $(elem).attr('href') || '';
            const linkText = $(elem).text().trim();
            const siblingText = $(elem).parent().text().trim();
            const fullText = linkText + ' ' + siblingText;

            // Match pattern: "Financial Year 2025 from bse"
            const yearMatch = fullText.match(/Financial\s+Year\s+(\d{4})/i);
            const isFromBSE = fullText.toLowerCase().includes('from bse');
            
            // BSE links typically go to: https://www.bseindia.com/...
            // Or Screener might have redirect URLs
            const isBSELink = href.includes('bseindia.com') || 
                            href.includes('/stock-price/') || 
                            (href.includes('company') && isFromBSE);
            
            if (yearMatch && isFromBSE) {
                const fiscalYear = normalizeFiscalYear(yearMatch[1]);
                
                // If href doesn't directly point to BSE, it might be a Screener redirect
                let bseUrl = href;
                if (!href.includes('bseindia.com')) {
                    // For relative URLs, make them absolute to Screener
                    bseUrl = href.startsWith('http') ? href : `https://www.screener.in${href}`;
                    console.log(`🔗 [Screener] Found Screener redirect link for ${fiscalYear}: ${bseUrl}`);
                } else {
                    console.log(`🔗 [BSE Direct] Found direct BSE link for ${fiscalYear}: ${bseUrl.substring(0, 80)}...`);
                }

                pdfLinks.push({
                    fiscalYear,
                    url: bseUrl,
                    source: 'BSE India via Screener.in'
                });
            }
        });

        // Sort by fiscal year (latest first)
        pdfLinks.sort((a, b) => compareFiscalYears(b.fiscalYear, a.fiscalYear));

        console.log(`✅ [Screener] Found ${pdfLinks.length} annual report links:`, 
            pdfLinks.map(link => `${link.fiscalYear} (${link.url.substring(0, 50)}...)`).join(', '));
        
        return pdfLinks;

    } catch (error: any) {
        console.error(`❌ [Screener] Error fetching PDF links:`, error.message);
        return [];
    }
}

/**
 * Fetch annual report from PDF with OCR fallback
 * Downloads BSE India PDF, extracts text, uses Gemini Vision for scanned PDFs
 */
export async function fetchAnnualReportFromPDF(
    symbol: string, 
    requestedFY: string, 
    forceRefresh: boolean = false
): Promise<ScreenerAnnualReport | null> {
    try {
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        const normalizedFY = normalizeFiscalYear(requestedFY);
        
        console.log(`📄 [PDF] Fetching annual report for ${cleanSymbol} ${normalizedFY}${forceRefresh ? ' (force refresh)' : ''}...`);

        // Check PDF text cache first
        const cacheDir = path.join(process.cwd(), '.cache', 'pdfs');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const cacheFile = path.join(cacheDir, `${cleanSymbol}-${normalizedFY}.txt`);
        
        if (!forceRefresh && fs.existsSync(cacheFile)) {
            const stats = fs.statSync(cacheFile);
            const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            
            if (ageInDays < 90) {
                const cachedText = fs.readFileSync(cacheFile, 'utf-8');
                console.log(`✅ [PDF Cache] Using cached PDF text (${ageInDays.toFixed(0)} days old, ${cachedText.length} chars)`);
                
                return {
                    fiscalYear: normalizedFY,
                    content: cachedText,
                    url: cacheFile,
                    source: 'BSE PDF'
                };
            } else {
                console.log(`🔄 [PDF Cache] Cache expired (${ageInDays.toFixed(0)} days old)`);
            }
        }

        // Get PDF links
        const pdfLinks = await fetchAnnualReportPDFLinks(symbol);
        
        if (pdfLinks.length === 0) {
            console.warn(`⚠️ [PDF] No PDF links found for ${cleanSymbol}`);
            return null;
        }

        // Get authenticated session for PDF downloads
        const cookies = await getAuthenticatedSession();
        if (!cookies) {
            console.error('❌ [PDF] Authentication failed, cannot download PDFs');
            return null;
        }

        // Sort by fiscal year descending (newest first)
        const sortedLinks = pdfLinks.sort((a, b) => compareFiscalYears(b.fiscalYear, a.fiscalYear));
        
        // Find matching fiscal year or filter to target year
        let candidateLinks = normalizedFY 
            ? sortedLinks.filter(link => link.fiscalYear === normalizedFY)
            : sortedLinks;
        
        // If no matches found for requested FY, use all sorted links
        if (candidateLinks.length === 0) {
            console.log(`⚠️ [PDF] ${normalizedFY} not found, trying latest available`);
            candidateLinks = sortedLinks;
        }

        // Try each PDF until we find one with sufficient content
        for (let i = 0; i < Math.min(candidateLinks.length, 5); i++) {
            const selectedLink = candidateLinks[i];
            
            console.log(`📥 [PDF] Trying ${selectedLink.fiscalYear} (${i + 1}/${Math.min(candidateLinks.length, 5)}) from ${selectedLink.source}...`);

            // If URL is a Screener redirect, follow it to get the actual BSE PDF URL
            let actualPdfUrl = selectedLink.url;
            
            if (selectedLink.url.includes('screener.in')) {
                console.log(`🔀 [Redirect] Following Screener redirect to BSE...`);
                try {
                    const redirectResponse = await fetch(selectedLink.url, {
                        headers: {
                            'Cookie': cookies,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        },
                        redirect: 'follow'
                    });
                    
                    // The final URL after redirects should be the BSE PDF
                    actualPdfUrl = redirectResponse.url;
                    console.log(`✅ [Redirect] Resolved to: ${actualPdfUrl.substring(0, 100)}...`);
                    
                    // If we got HTML instead of PDF, try to extract PDF link from the page
                    if (!actualPdfUrl.includes('.pdf')) {
                        const html = await redirectResponse.text();
                        const $redirect = load(html);
                        
                        // Look for PDF download links in BSE page
                        const pdfLink = $redirect('a[href*=".pdf"], a[href*="AttachHis"]').first().attr('href');
                        if (pdfLink) {
                            actualPdfUrl = pdfLink.startsWith('http') ? pdfLink : `https://www.bseindia.com${pdfLink}`;
                            console.log(`✅ [Extract] Found PDF link in redirect page: ${actualPdfUrl.substring(0, 100)}...`);
                        }
                    }
                } catch (redirectError: any) {
                    console.warn(`⚠️ [Redirect] Failed to follow redirect: ${redirectError.message}`);
                    // Continue with original URL
                }
            }

            // Apply rate limiting before download
            await waitForBSERequest();

            // Download and parse PDF with authenticated session
            let pdfResult;
            try {
                pdfResult = await downloadAndParsePDF(actualPdfUrl, cookies);
            } catch (pdfError: any) {
                console.error(`❌ [PDF] Download failed for ${selectedLink.fiscalYear}: ${pdfError.message}`);
                continue; // Try next PDF
            }

            let extractedText = pdfResult.text;
            let source: 'BSE PDF' | 'BSE PDF (OCR)' = 'BSE PDF';

            // Use Gemini Vision OCR if PDF is image-based
            if (pdfResult.isImageBased) {
                console.log(`🔍 [PDF] Image-based PDF detected, using Gemini Vision OCR...`);
                extractedText = await extractTextFromPDF(actualPdfUrl);
                source = 'BSE PDF (OCR)';
            }

            // Validate text length
            if (extractedText.length < 30000) {
                console.warn(`⚠️ [PDF] Too short: ${extractedText.length} chars, trying next PDF...`);
                continue; // Try next PDF
            }

            // Success! Cache and return
            fs.writeFileSync(cacheFile, extractedText, 'utf-8');
            console.log(`💾 [PDF Cache] Saved ${extractedText.length} chars to cache`);
            console.log(`✅ [PDF] Successfully extracted ${extractedText.length.toLocaleString()} characters from ${selectedLink.fiscalYear}`);

            return {
                fiscalYear: selectedLink.fiscalYear,
                content: extractedText,
                url: actualPdfUrl,
                source
            };
        }

        // All PDFs were too short
        console.warn(`⚠️ [PDF] All ${Math.min(candidateLinks.length, 5)} PDFs were too short (<30,000 chars)`);
        return null;

    } catch (error: any) {
        console.error(`❌ [PDF] Error fetching PDF annual report:`, error.message);
        return null;
    }
}

/**
 * Fetch comprehensive company data (transcript + annual report)
 */
export async function fetchScreenerComprehensiveData(symbol: string): Promise<{
    transcript: ScreenerTranscript | null;
    annualReport: ScreenerAnnualReport | null;
}> {
    console.log(`🔍 [Screener] Fetching comprehensive data for ${symbol}...`);

    // Fetch both in sequence (with rate limiting built-in)
    const transcript = await fetchScreenerTranscript(symbol);
    const annualReport = await fetchScreenerAnnualReport(symbol);

    const success = (transcript || annualReport) ? '✅' : '⚠️';
    console.log(`${success} [Screener] Comprehensive fetch complete:`, {
        hasTranscript: !!transcript,
        hasAnnualReport: !!annualReport,
    });

    return { transcript, annualReport };
}

/**
 * Fetch and parse fundamentals from Screener.in (authenticated)
 * Extracts: PE, ROE, margins, debt, cash flow from HTML tables
 * Returns: All values in crores with decimal ratios
 */
export async function fetchScreenerFundamentals(symbol: string) {
    try {
        console.log(`📊 [Screener Fundamentals] Fetching for ${symbol}...`);
        
        // Get authenticated session
        const session = await getAuthenticatedSession();
        if (!session) {
            console.log(`⚠️ [Screener Fundamentals] No authenticated session available`);
            return null;
        }
        
        // Rate limiting
        await waitForRateLimit();
        
        const url = `https://www.screener.in/company/${symbol}/`;
        console.log(`🔗 [Screener Fundamentals] Fetching: ${url}`);
        
        const response = await fetch(url, {
            headers: {
                'Cookie': session,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.screener.in/',
            },
        });
        
        if (!response.ok) {
            console.log(`⚠️ [Screener Fundamentals] HTTP ${response.status} for ${symbol}`);
            return null;
        }
        
        const html = await response.text();
        const $ = load(html);
        
        // Initialize result with comprehensive metrics
        const fundamentals: any = {
            symbol: symbol,
            // Valuation Metrics
            marketCap: null,
            peRatio: null,
            pegRatio: null,
            priceToBook: null,
            dividendYield: null,
            bookValue: null,
            faceValue: null,
            // Profitability Metrics
            roe: null,
            roa: null,
            roce: null,
            operatingMargin: null,
            profitMargin: null,
            // Financial Health
            debtToEquity: null,
            totalDebt: null,
            currentRatio: null,
            quickRatio: null,
            interestCoverage: null,
            // Cash Flow
            operatingCashFlow: null,
            freeCashFlow: null,
            capex: null,
            // Income Statement
            revenue: null,
            netProfit: null,
            eps: null,
            // Growth Metrics (CAGR)
            salesGrowth3Y: null,
            salesGrowth5Y: null,
            profitGrowth3Y: null,
            profitGrowth5Y: null,
            roe3Y: null,
            roe5Y: null,
            // Efficiency Ratios
            debtorDays: null,
            cashConversionCycle: null,
            workingCapitalDays: null,
            // Shareholding Pattern
            promoterHolding: null,
            fiiHolding: null,
            diiHolding: null,
            pledgedPercentage: null,
            source: 'Screener.in Direct (Authenticated)'
        };
        
        // Extract from top ratios section (updated selectors for new HTML structure)
        $('li[class*="ratio"], li[class*="top-ratio"], #top-ratios li, .top-ratios li').each((i: number, elem: any) => {
            const fullText = $(elem).text().trim();
            const cleanText = fullText.replace(/\s+/g, ' '); // Collapse whitespace
            
            // Extract label and value by looking for patterns
            if (cleanText.includes('Market Cap')) {
                // Format: "Market Cap ₹ 1,234 Cr." - extract number before "Cr"
                const match = cleanText.match(/₹?\s*([\d,]+)\s*Cr/i);
                if (match) {
                    fundamentals.marketCap = parseFloat(match[1].replace(/,/g, ''));
                    console.log(`✅ [Screener] Market Cap: ${fundamentals.marketCap} Cr`);
                }
            } else if (cleanText.includes('Stock P/E') || (cleanText.includes('P/E') && !cleanText.includes('Book'))) {
                // Format: "Stock P/E 23.5" - extract decimal number
                const match = cleanText.match(/P\/E\s+([\d.]+)/i);
                if (match) {
                    fundamentals.peRatio = parseFloat(match[1]);
                    console.log(`✅ [Screener] PE Ratio: ${fundamentals.peRatio}`);
                }
            } else if (cleanText.includes('Book Value')) {
                const match = cleanText.match(/₹\s*([\d,]+(?:\.\d+)?)/i);
                if (match) {
                    fundamentals.bookValue = parseFloat(match[1].replace(/,/g, ''));
                    console.log(`✅ [Screener] Book Value: ₹${fundamentals.bookValue}`);
                }
            } else if (cleanText.includes('Dividend Yield')) {
                const match = cleanText.match(/([\d.]+)\s*%/i);
                if (match) {
                    fundamentals.dividendYield = parseFloat(match[1]) / 100;
                    console.log(`✅ [Screener] Dividend Yield: ${fundamentals.dividendYield * 100}%`);
                }
            } else if (cleanText.includes('Face Value')) {
                const match = cleanText.match(/₹\s*([\d.]+)/i);
                if (match) {
                    fundamentals.faceValue = parseFloat(match[1]);
                    console.log(`✅ [Screener] Face Value: ₹${fundamentals.faceValue}`);
                }
            } else if (cleanText.includes('Debt to Equity') || cleanText.includes('Debt/Equity')) {
                const match = cleanText.match(/([\d.]+)/);
                if (match) {
                    fundamentals.debtToEquity = parseFloat(match[1]);
                    console.log(`✅ [Screener] D/E: ${fundamentals.debtToEquity}`);
                }
            } else if (cleanText.match(/^ROE\s/i)) {
                // Format: "ROE 17.8 %" - extract percentage
                const match = cleanText.match(/ROE\s+([\d.]+)/i);
                if (match) {
                    fundamentals.roe = parseFloat(match[1]) / 100;
                    console.log(`✅ [Screener] ROE: ${fundamentals.roe * 100}%`);
                }
            } else if (cleanText.match(/^ROCE\s/i)) {
                // Already extracted by ratios table, but backup
                const match = cleanText.match(/ROCE\s+([\d.]+)/i);
                if (match && !fundamentals.roce) {
                    fundamentals.roce = parseFloat(match[1]) / 100;
                    console.log(`✅ [Screener] ROCE: ${fundamentals.roce * 100}%`);
                }
            }
        });
        
        // Extract from ratios table
        $('#ratios .data-table tbody tr').each((i: number, row: any) => {
            const label = $(row).find('td').first().text().trim();
            const value = $(row).find('td').last().text().trim();
            
            if (label.includes('ROA')) {
                fundamentals.roa = parseFloat(value.replace('%', '')) / 100 || null;
            } else if (label.includes('ROCE')) {
                fundamentals.roce = parseFloat(value.replace('%', '')) / 100 || null;
            } else if (label.includes('OPM') || label.includes('Operating Margin')) {
                fundamentals.operatingMargin = parseFloat(value.replace('%', '')) / 100 || null;
            } else if (label.includes('NPM') || label.includes('Net Profit Margin')) {
                fundamentals.profitMargin = parseFloat(value.replace('%', '')) / 100 || null;
            } else if (label.includes('Current Ratio')) {
                fundamentals.currentRatio = parseFloat(value) || null;
            } else if (label.includes('Quick Ratio')) {
                fundamentals.quickRatio = parseFloat(value) || null;
            } else if (label.includes('Interest Coverage')) {
                fundamentals.interestCoverage = parseFloat(value) || null;
            } else if (label.includes('Debtor Days')) {
                fundamentals.debtorDays = parseFloat(value) || null;
            } else if (label.includes('Cash Conversion Cycle')) {
                fundamentals.cashConversionCycle = parseFloat(value) || null;
            } else if (label.includes('Working Capital Days')) {
                fundamentals.workingCapitalDays = parseFloat(value) || null;
            } else if (label.includes('Price to Book') || label.includes('P/B')) {
                fundamentals.priceToBook = parseFloat(value) || null;
            } else if (label.includes('PEG Ratio')) {
                fundamentals.pegRatio = parseFloat(value) || null;
            }
        });
        
        // Extract from profit & loss table
        $('#profit-loss .data-table tbody tr').each((i: number, row: any) => {
            const label = $(row).find('td').first().text().trim();
            const lastValue = $(row).find('td').last().text().trim();
            
            if (label.includes('Sales') || label.includes('Revenue')) {
                // Format: "1,234 +15%" - extract number only
                const match = lastValue.match(/([\d,]+)/)?.[0]?.replace(/,/g, '');
                fundamentals.revenue = match ? parseFloat(match) : null;
            } else if (label.includes('Net Profit')) {
                const match = lastValue.match(/([\d,]+)/)?.[0]?.replace(/,/g, '');
                fundamentals.netProfit = match ? parseFloat(match) : null;
            } else if (label.includes('EPS in Rs')) {
                fundamentals.eps = parseFloat(lastValue) || null;
            }
        });
        
        // Extract from balance sheet
        $('#balance-sheet .data-table tbody tr').each((i: number, row: any) => {
            const label = $(row).find('td').first().text().trim();
            const lastValue = $(row).find('td').last().text().trim();
            
            if (label.includes('Total Debt') || label.includes('Borrowings')) {
                const match = lastValue.match(/([\d,]+)/)?.[0]?.replace(/,/g, '');
                fundamentals.totalDebt = match ? parseFloat(match) : null;
            }
        });
        
        // Extract from cash flow table
        $('#cash-flow .data-table tbody tr').each((i: number, row: any) => {
            const label = $(row).find('td').first().text().trim();
            const lastValue = $(row).find('td').last().text().trim();
            
            if (label.includes('Operating Cash Flow') || label.includes('Cash from Operating')) {
                const match = lastValue.match(/(-?[\d,]+)/)?.[0]?.replace(/,/g, '');
                fundamentals.operatingCashFlow = match ? parseFloat(match) : null;
            } else if (label.includes('Free Cash Flow')) {
                const match = lastValue.match(/(-?[\d,]+)/)?.[0]?.replace(/,/g, '');
                fundamentals.freeCashFlow = match ? parseFloat(match) : null;
            } else if (label.match(/Capital Expenditure|Investing Activity/i)) {
                const match = lastValue.match(/(-?[\d,]+)/)?.[0]?.replace(/,/g, '');
                if (match) {
                    const capex = Math.abs(parseFloat(match));
                    fundamentals.capex = capex;
                    // Calculate FCF if not already available
                    if (!fundamentals.freeCashFlow && fundamentals.operatingCashFlow) {
                        fundamentals.freeCashFlow = fundamentals.operatingCashFlow - capex;
                    }
                }
            }
        });
        
        // Extract growth CAGRs from compounded growth tables
        $('table').each((i: number, table: any) => {
            const tableHtml = $(table).html() || '';
            const prevText = $(table).prev().text();
            
            $(table).find('tr').each((j: number, row: any) => {
                const cells = $(row).find('td');
                if (cells.length >= 2) {
                    const label = $(cells[0]).text().trim();
                    const value = $(cells[1]).text().trim();
                    
                    if (label === '5 Years:' && value) {
                        const percentage = parseFloat(value.replace('%', ''));
                        if (!isNaN(percentage)) {
                            if (prevText.includes('Sales Growth') || tableHtml.includes('Sales Growth')) {
                                fundamentals.salesGrowth5Y = percentage / 100;
                            } else if (prevText.includes('Profit Growth') || tableHtml.includes('Profit Growth')) {
                                fundamentals.profitGrowth5Y = percentage / 100;
                            } else if (prevText.includes('Return on Equity') || tableHtml.includes('Return on Equity')) {
                                fundamentals.roe5Y = percentage / 100;
                            }
                        }
                    } else if (label === '3 Years:' && value) {
                        const percentage = parseFloat(value.replace('%', ''));
                        if (!isNaN(percentage)) {
                            if (prevText.includes('Sales Growth') || tableHtml.includes('Sales Growth')) {
                                fundamentals.salesGrowth3Y = percentage / 100;
                            } else if (prevText.includes('Profit Growth') || tableHtml.includes('Profit Growth')) {
                                fundamentals.profitGrowth3Y = percentage / 100;
                            } else if (prevText.includes('Return on Equity') || tableHtml.includes('Return on Equity')) {
                                fundamentals.roe3Y = percentage / 100;
                            }
                        }
                    }
                }
            });
        });
        
        // Extract shareholding pattern
        $('#shareholding table tbody tr, .shareholding-table tbody tr').each((i: number, row: any) => {
            const cells = $(row).find('td');
            if (cells.length >= 2) {
                const label = $(cells[0]).text().trim();
                const lastValue = $(cells[cells.length - 1]).text().trim();
                
                if (label.includes('Promoter') && !label.includes('Pledged')) {
                    const match = lastValue.match(/([\d.]+)/);
                    if (match) {
                        fundamentals.promoterHolding = parseFloat(match[1]) / 100;
                    }
                } else if (label.includes('FII')) {
                    const match = lastValue.match(/([\d.]+)/);
                    if (match) {
                        fundamentals.fiiHolding = parseFloat(match[1]) / 100;
                    }
                } else if (label.includes('DII')) {
                    const match = lastValue.match(/([\d.]+)/);
                    if (match) {
                        fundamentals.diiHolding = parseFloat(match[1]) / 100;
                    }
                }
            }
        });
        
        // Look for pledged percentage
        const pledgedText = $('body').text();
        const pledgedMatch = pledgedText.match(/Pledged.*?([\d.]+)\s*%/i);
        if (pledgedMatch) {
            fundamentals.pledgedPercentage = parseFloat(pledgedMatch[1]) / 100;
        }
        
        // Validate - must have at least one useful metric
        const hasUsefulData = fundamentals.peRatio || fundamentals.roe || fundamentals.roce || 
                              fundamentals.revenue || fundamentals.netProfit || fundamentals.operatingMargin;
        
        if (!hasUsefulData) {
            console.log(`⚠️ [Screener Fundamentals] No metrics found for ${symbol}`);
            console.log(`🔍 [DEBUG] All extracted values:`, fundamentals);
            return null;
        }
        
        console.log(`✅ [Screener Fundamentals] Extracted: PE=${fundamentals.peRatio}, ROE=${fundamentals.roe}, D/E=${fundamentals.debtToEquity}, Revenue=${fundamentals.revenue}Cr`);
        console.log(`📊 [DEBUG] Complete extraction:`, JSON.stringify(fundamentals, null, 2));
        console.log(`🔍 [DEBUG] Non-null fields extracted: ${Object.entries(fundamentals).filter(([k,v]) => v !== null).map(([k]) => k).join(', ')}`);
        
        return fundamentals;
        
    } catch (error: any) {
        console.error(`❌ [Screener Fundamentals] Error for ${symbol}:`, error.message);
        return null;
    }
}
