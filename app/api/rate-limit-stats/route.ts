import { NextRequest, NextResponse } from 'next/server';
import { getRateLimitStats } from '../../utils/security';

/**
 * Rate Limit Monitoring Endpoint
 * GET /api/rate-limit-stats
 * 
 * Returns statistics about current rate limiting
 * Use for monitoring and alerting
 */
export async function GET(request: NextRequest) {
    try {
        // Optional: Protect this endpoint with API key
        const apiKey = request.headers.get('x-api-key');
        
        if (process.env.REQUIRE_ADMIN_API_KEY === 'true') {
            if (apiKey !== process.env.ADMIN_API_KEY) {
                return NextResponse.json(
                    { error: 'Unauthorized' },
                    { status: 401 }
                );
            }
        }
        
        const stats = await getRateLimitStats();
        
        return NextResponse.json({
            success: true,
            stats: {
                totalEntries: stats.total,
                blockedIPs: stats.blocked,
                storageType: stats.storage,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error: any) {
        console.error('❌ [Rate Limit Stats] Error:', error);
        return NextResponse.json(
            { error: 'Failed to retrieve rate limit stats' },
            { status: 500 }
        );
    }
}
