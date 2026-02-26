import { NextResponse } from 'next/server';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { symbol, historicalPrices, currentPrice } = body;

        if (!symbol || !historicalPrices || !currentPrice) {
            return NextResponse.json(
                { error: 'Missing required fields: symbol, historicalPrices, currentPrice' },
                { status: 400 }
            );
        }

        const response = await fetch(`${ML_SERVICE_URL}/predict/price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol,
                historical_prices: historicalPrices,
                current_price: currentPrice,
            }),
            signal: AbortSignal.timeout(15000), // 15 second timeout
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'ML service error' }));
            console.warn(`⚠️ [ML] Prediction failed: ${error.detail}`);
            return NextResponse.json({ error: error.detail }, { status: response.status });
        }

        const mlResult = await response.json();
        return NextResponse.json(mlResult);

    } catch (error: any) {
        // Graceful fallback — ML service might not be running
        console.warn(`⚠️ [ML] Service unavailable: ${error.message}`);
        return NextResponse.json(
            { error: 'ML service unavailable', fallback: true },
            { status: 503 }
        );
    }
}

// Intraday endpoint
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { symbol, recentPrices, intervalSeconds } = body;

        const response = await fetch(`${ML_SERVICE_URL}/predict/intraday`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol,
                recent_prices: recentPrices,
                interval_seconds: intervalSeconds || 60,
            }),
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Intraday prediction failed' }, { status: response.status });
        }

        return NextResponse.json(await response.json());

    } catch (error: any) {
        return NextResponse.json(
            { error: 'ML service unavailable', fallback: true },
            { status: 503 }
        );
    }
}