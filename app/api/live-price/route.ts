import { NextResponse } from 'next/server';
import '@/app/utils/serverPolyfills'; // Ensure polyfills are available for fetch and other APIs in Node.js environment

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

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');
        
        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        }
        
        const response = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );
        
        const data = await response.json();
        
        if (data.chart?.error) {
            console.error('Yahoo Finance error:', data.chart.error.description);
            return NextResponse.json({ error: data.chart.error.description }, { status: 404 });
        }
        
        if (data.chart?.result?.[0]) {
            const result = data.chart.result[0];
            const meta = result.meta;
            
            return NextResponse.json({
                price: meta.regularMarketPrice || meta.previousClose,
                dayHigh: meta.regularMarketDayHigh || meta.previousClose,
                dayLow: meta.regularMarketDayLow || meta.previousClose,
                volume: meta.regularMarketVolume || 0,
                previousClose: meta.previousClose,
                marketState: getMarketState(meta, symbol),
                timestamp: new Date().toISOString()
            });
        }
        
        return NextResponse.json({ error: 'No data found' }, { status: 404 });
    } catch (error) {
        console.error('Live price fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch live price' }, { status: 500 });
    }
}
