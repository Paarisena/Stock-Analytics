import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Use Yahoo Finance search API with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`Yahoo Finance API returned ${response.status}`);
        return NextResponse.json({ results: [] });
      }

      const data = await response.json();
      const quotes = data.quotes || [];

      // Filter and format results - include stocks, ETFs, and indices
      const results = quotes
        .filter((q: any) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX'))
        .map((q: any) => ({
          symbol: q.symbol,
          name: q.longname || q.shortname || q.symbol,
          exchange: q.exchange || q.exchDisp || 'Unknown',
          type: q.quoteType || 'EQUITY',
          score: q.score || 0
        }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 15);

      return NextResponse.json({ results });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      console.warn('Yahoo Finance API unavailable:', fetchError.message);
      return NextResponse.json({ results: [] });
    }
  } catch (error: any) {
    console.error('Stock search error:', error);
    return NextResponse.json(
      { error: 'Failed to search stocks', results: [] },
      { status: 500 }
    );
  }
}
