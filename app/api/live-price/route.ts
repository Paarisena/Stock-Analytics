import { NextResponse } from 'next/server';

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
                timestamp: new Date().toISOString()
            });
        }
        
        return NextResponse.json({ error: 'No data found' }, { status: 404 });
    } catch (error) {
        console.error('Live price fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch live price' }, { status: 500 });
    }
}
