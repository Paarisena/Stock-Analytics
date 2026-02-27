import { NextRequest, NextResponse } from "next/server";
import '@app/utils/serverPolyfills'; // Ensure polyfills are available for fetch and other APIs in Node.js environment

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');

        if (!query || query.trim().length === 0) {
            return NextResponse.json([]);
        }

        // Fetch suggestions from Yahoo Finance Search API
        const response = await fetch(
            `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }
        );

        if (!response.ok) {
            console.error('Yahoo Finance API error:', response.statusText);
            return NextResponse.json([]);
        }

        const data = await response.json();
        const quotes = data.quotes || [];

        // Filter and format stock suggestions
        const suggestions = quotes
            .filter((quote: any) => {
                // Only include equities (stocks)
                return quote.quoteType === 'EQUITY' && quote.symbol;
            })
            .slice(0, 8) // Limit to 8 suggestions
            .map((quote: any) => ({
                symbol: quote.symbol,
                name: quote.longname || quote.shortname || quote.symbol,
                exchange: quote.exchDisp || quote.exchange || '',
                type: quote.quoteType || 'EQUITY'
            }));

        return NextResponse.json(suggestions);
    } catch (error) {
        console.error('Stock suggestions error:', error);
        return NextResponse.json([]);
    }
}
