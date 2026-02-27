import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // CORS Configuration - Environment-based
    const origin = request.headers.get('origin');
    
    // Development origins
    const devOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'stock-analytics-weld.vercel.app'
    ];
    
    // Production origins (from environment variable)
    const prodOrigins = process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [];
    
    const allowedOrigins = [...devOrigins, ...prodOrigins];

    const response = NextResponse.next();

    // HTTPS enforcement in production
    if (process.env.NODE_ENV === 'production' && request.nextUrl.protocol === 'http:') {
        return NextResponse.redirect(`https://${request.nextUrl.host}${request.nextUrl.pathname}`, 301);
    }

    // Set CORS headers
    if (origin && allowedOrigins.includes(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
        response.headers.set('Access-Control-Allow-Credentials', 'true');
        response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return new NextResponse(null, { status: 204, headers: response.headers });
    }

    return response;
}

export const config = {
    matcher: '/api/:path*', // Apply to all API routes
};
