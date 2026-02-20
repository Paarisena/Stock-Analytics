import { NextRequest, NextResponse } from 'next/server';
import * as TOML from '@iarna/toml';
import * as fs from 'fs';
import * as path from 'path';
import { fetchAnnualReportPDFLinks } from '../../utils/ORec';
import { compareFiscalYears } from '../../utils/fiscalYearMapper';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'deep-analysis');

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');
        
        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        }
        
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        
        console.log(`🔍 [FY Check] Checking fiscal year for ${cleanSymbol}...`);
        
        // Get latest fiscal year from screener.in (lightweight check)
        const latestFY = await getLatestFiscalYearFromScreener(cleanSymbol);
        
        // Check cached fiscal year if exists
        const cacheFile = path.join(CACHE_DIR, `${cleanSymbol}.toml`);
        let cachedFY = null;
        
        if (fs.existsSync(cacheFile)) {
            try {
                const tomlContent = fs.readFileSync(cacheFile, 'utf-8');
                const cached = TOML.parse(tomlContent) as any;
                cachedFY = cached.metadata?.fiscalYear;
            } catch (error) {
                console.warn(`⚠️ [FY Check] Could not read cache:`, error);
            }
        }
        
        const isNewAvailable = latestFY && cachedFY && latestFY !== cachedFY;
        
        console.log(`📊 [FY Check] Latest: ${latestFY}, Cached: ${cachedFY}, New Available: ${isNewAvailable}`);
        
        return NextResponse.json({
            success: true,
            latestFY: latestFY || 'FY2025',
            cachedFY: cachedFY || null,
            isNewAvailable: isNewAvailable || false
        });
        
    } catch (error: any) {
        console.error('❌ [FY Check Error]:', error.message);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

// Helper function to get latest fiscal year from PDF links
async function getLatestFiscalYearFromScreener(symbol: string): Promise<string | null> {
    try {
        // Get list of all PDF links from screener.in
        console.log(`🔗 [FY Check] Fetching PDF links for ${symbol}...`);
        const pdfLinks = await fetchAnnualReportPDFLinks(symbol);
        
        if (pdfLinks.length === 0) {
            console.warn(`⚠️ [FY Check] No PDF links found, defaulting to FY2025`);
            return 'FY2025';
        }
        
        // Sort by fiscal year descending (newest first)
        const sortedLinks = pdfLinks.sort((a, b) => compareFiscalYears(b.fiscalYear, a.fiscalYear));
        const latestFY = sortedLinks[0].fiscalYear;
        
        console.log(`✅ [Screener] Detected fiscal year: ${latestFY}`);
        return latestFY;
        
    } catch (error) {
        console.error('❌ [Screener Error]:', error);
        return 'FY2025'; // Safe fallback
    }
}
