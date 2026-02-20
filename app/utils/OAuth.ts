/**
 * O.in Authentication Module
 * Handles login and session management for authenticated data access
 * 
 * IMPORTANT: Personal use only, respects rate limits and ToS
 */

interface OSession {
    cookies: string;
    expiresAt: number;
    userId?: string;
}

// In-memory session cache (24-hour validity)
let cachedSession: OSession | null = null;

// Rate limiting: Track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

/**
 * Login to O.in and get authenticated session cookies
 */
export async function loginToO(): Promise<string | null> {
    try {
        const email = process.env.O_EMAIL;
        const password = process.env.O_PASSWORD;

        if (!email || !password) {
            console.error('❌ [O Auth] Missing credentials in .env file');
            console.log('📝 Add O_EMAIL and O_PASSWORD to your .env file');
            return null;
        }

        console.log(`🔐 [O Auth] Attempting login to O.in...`);

        // Step 1: Get CSRF token from login page
        const loginPageResponse = await fetch(`${process.env.O_URL}/login/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        const setCookieHeaders = loginPageResponse.headers.getSetCookie?.() || 
            Array.from(loginPageResponse.headers.entries())
                .filter(([key]) => key.toLowerCase() === 'set-cookie')
                .map(([, value]) => value);
        const csrfCookie = setCookieHeaders.find(cookie => cookie.includes('csrftoken'));
        const sessionCookie = setCookieHeaders.find(cookie => cookie.includes('sessionid'));
        
        if (!csrfCookie) {
            console.error('❌ [O Auth] Failed to get CSRF token');
            return null;
        }

        const csrfToken = csrfCookie.split(';')[0].split('=')[1];
        const loginPageHtml = await loginPageResponse.text();
        
        // Extract CSRF token from HTML form (Django pattern)
        const csrfMatch = loginPageHtml.match(/name=['"]csrfmiddlewaretoken['"] value=['"]([^'"]+)['"]/);
        const formCsrfToken = csrfMatch ? csrfMatch[1] : csrfToken;

        // Step 2: Submit login form
        const loginResponse = await fetch(`${process.env.O_URL}/login/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': `csrftoken=${csrfToken}${sessionCookie ? `; ${sessionCookie.split(';')[0]}` : ''}`,
                'Referer': `${process.env.O_URL}/login/`,
            },
            body: `csrfmiddlewaretoken=${encodeURIComponent(formCsrfToken)}&username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
            redirect: 'manual', // Don't follow redirects automatically
        });

        // Check if login was successful (redirect to home page)
        const location = loginResponse.headers.get('location');
        if (location !== '/' && loginResponse.status !== 302) {
            console.error('❌ [O Auth] Login failed - Invalid credentials or CAPTCHA required');
            console.log('Status:', loginResponse.status);
            console.log('Location:', location);
            return null;
        }

        // Extract session cookies
        const authCookies = loginResponse.headers.getSetCookie?.() || 
            Array.from(loginResponse.headers.entries())
                .filter(([key]) => key.toLowerCase() === 'set-cookie')
                .map(([, value]) => value);
        const allCookies = [...setCookieHeaders, ...authCookies];
        
        const cookieString = allCookies
            .map(cookie => cookie.split(';')[0])
            .join('; ');

        if (!cookieString) {
            console.error('❌ [O Auth] No session cookies received');
            return null;
        }

        // Cache session for 24 hours
        cachedSession = {
            cookies: cookieString,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        };

        console.log('✅ Login successful! Session cached for 24 hours');
        return cookieString;

    } catch (error: any) {
        console.error('❌ [O Auth] Login error:', error.message);
        return null;
    }
}

/**
 * Get authenticated session (uses cache if available)
 */
export async function getAuthenticatedSession(): Promise<string | null> {
    // Check if cached session is still valid
    if (cachedSession && cachedSession.expiresAt > Date.now()) {
        console.log('📦 [ Auth] Using cached session');
        console.log(`🔍 [DEBUG] Session expires in ${Math.round((cachedSession.expiresAt - Date.now()) / 1000 / 60)} minutes`);
        return cachedSession.cookies;
    }

    // Session expired or doesn't exist - login again
    console.log('🔄 [O Auth] Session expired or missing, logging in...');
    console.log(`🔍 [DEBUG] Cache status: exists=${!!cachedSession}, expired=${cachedSession ? cachedSession.expiresAt < Date.now() : 'N/A'}`);
    return await loginToO();
}

/**
 * Rate limiting: Wait before making request if needed
 */
export async function waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        console.log(`⏳ [Rate Limit] Waiting ${Math.round(waitTime / 1000)}s before next request...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastRequestTime = Date.now();
}

/**
 * Clear cached session (force re-login on next request)
 */
export function clearSession(): void {
    cachedSession = null;
    console.log('🗑️ [O Auth] Session cache cleared');
}
