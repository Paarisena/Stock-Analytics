/**
 * Rate Limiter Utility
 * Prevents overwhelming external servers with requests
 */

// Global state to track last request time
let lastBSERequest = 0;

const BSE_RATE_LIMIT_MS = 2000; // 2 seconds between requests

/**
 * Wait if necessary to respect BSE India rate limits
 * Enforces minimum 2-second delay between requests
 */
export async function waitForBSERequest(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastBSERequest;
    
    if (timeSinceLastRequest < BSE_RATE_LIMIT_MS) {
        const waitTime = BSE_RATE_LIMIT_MS - timeSinceLastRequest;
        console.log(`⏳ [Rate Limiter] Waiting ${(waitTime / 1000).toFixed(1)}s before BSE request...`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastBSERequest = Date.now();
}

/**
 * Reset rate limiter (useful for testing)
 */
export function resetRateLimiter(): void {
    lastBSERequest = 0;
}
