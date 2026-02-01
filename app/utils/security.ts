/**
 * Security Utilities for API Protection
 * Lightweight configuration for stock analysis API
 */

import validator from 'validator';
import mongoose from 'mongoose';

// ============================================
// 1. RATE LIMITING (Persistent MongoDB Storage)
// ============================================

// MongoDB Schema for Rate Limiting
interface IRateLimit {
    identifier: string;
    count: number;
    resetTime: Date;
    createdAt: Date;
}

const RateLimitSchema = new mongoose.Schema<IRateLimit>({
    identifier: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true, default: 1 },
    resetTime: { type: Date, required: true, index: true },
    createdAt: { type: Date, default: Date.now }
});

// TTL index - MongoDB will automatically delete expired documents after resetTime
RateLimitSchema.index({ resetTime: 1 }, { expireAfterSeconds: 60 });

const RateLimitModel = mongoose.models.RateLimit || mongoose.model<IRateLimit>('RateLimit', RateLimitSchema);

// Configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 requests per minute
const USE_PERSISTENT_RATE_LIMIT = process.env.USE_PERSISTENT_RATE_LIMIT !== 'false'; // Default: true

// Fallback in-memory storage (used if MongoDB is unavailable)
interface RateLimitEntry {
    count: number;
    resetTime: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit with persistent MongoDB storage
 * Falls back to in-memory if MongoDB is unavailable
 */
export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const now = Date.now();
    
    // Try persistent storage first
    if (USE_PERSISTENT_RATE_LIMIT) {
        try {
            return await checkRateLimitPersistent(identifier, now);
        } catch (error) {
            console.warn('⚠️ [Rate Limit] MongoDB unavailable, falling back to in-memory:', error);
            // Fall through to in-memory
        }
    }
    
    // Fallback to in-memory rate limiting
    return checkRateLimitMemory(identifier, now);
}

/**
 * Persistent MongoDB-based rate limiting
 */
async function checkRateLimitPersistent(identifier: string, now: number): Promise<{ allowed: boolean; retryAfter?: number }> {
    const resetTime = new Date(now + RATE_LIMIT_WINDOW);
    
    // Try to find existing entry
    const entry = await RateLimitModel.findOne({
        identifier,
        resetTime: { $gt: new Date(now) }
    });
    
    if (!entry) {
        // New window - create entry
        await RateLimitModel.findOneAndUpdate(
            { identifier },
            { 
                $set: { 
                    count: 1, 
                    resetTime,
                    createdAt: new Date()
                } 
            },
            { upsert: true, new: true }
        );
        return { allowed: true };
    }
    
    // Check if limit exceeded
    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
        const retryAfter = Math.ceil((entry.resetTime.getTime() - now) / 1000);
        return { allowed: false, retryAfter };
    }
    
    // Increment count
    await RateLimitModel.updateOne(
        { identifier },
        { $inc: { count: 1 } }
    );
    
    return { allowed: true };
}

/**
 * In-memory rate limiting (fallback)
 */
function checkRateLimitMemory(identifier: string, now: number): { allowed: boolean; retryAfter?: number } {
    const entry = rateLimitStore.get(identifier);

    // Clean up expired entries periodically
    if (rateLimitStore.size > 1000) {
        for (const [key, value] of rateLimitStore.entries()) {
            if (value.resetTime < now) rateLimitStore.delete(key);
        }
    }

    if (!entry || entry.resetTime < now) {
        // New window
        rateLimitStore.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return { allowed: true };
    }

    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        return { allowed: false, retryAfter };
    }

    // Increment count
    entry.count++;
    return { allowed: true };
}

/**
 * Get rate limit statistics for monitoring
 */
export async function getRateLimitStats(): Promise<{ total: number; blocked: number; storage: string }> {
    if (USE_PERSISTENT_RATE_LIMIT) {
        try {
            const total = await RateLimitModel.countDocuments();
            const blocked = await RateLimitModel.countDocuments({ count: { $gte: MAX_REQUESTS_PER_WINDOW } });
            return { total, blocked, storage: 'MongoDB (Persistent)' };
        } catch (error) {
            return { total: rateLimitStore.size, blocked: 0, storage: 'In-Memory (Fallback)' };
        }
    }
    return { total: rateLimitStore.size, blocked: 0, storage: 'In-Memory' };
}

/**
 * Clear rate limit for specific identifier (admin function)
 */
export async function clearRateLimit(identifier: string): Promise<boolean> {
    if (USE_PERSISTENT_RATE_LIMIT) {
        try {
            await RateLimitModel.deleteOne({ identifier });
            return true;
        } catch (error) {
            console.error('Failed to clear rate limit from MongoDB:', error);
        }
    }
    rateLimitStore.delete(identifier);
    return true;
}

// ============================================
// 2. INPUT SANITIZATION (Stock Symbols & Queries)
// ============================================
export function sanitizeSymbol(symbol: string): string | null {
    // Check for null/undefined
    if (!symbol || typeof symbol !== 'string') {
        return null;
    }

    // Normalize unicode (prevent unicode attacks)
    const normalized = symbol.normalize('NFKC');
    
    // Check for path traversal patterns
    if (normalized.includes('..') || normalized.includes('\\') || normalized.includes('\0')) {
        logSecurityEvent('INVALID_INPUT', { type: 'path_traversal', input: normalized.substring(0, 50) });
        return null;
    }
    
    // Allow alphanumeric + dots (e.g., "RELIANCE.NS", "AAPL")
    if (!validator.isAlphanumeric(normalized.replace(/\./g, ''), 'en-US')) {
        return null;
    }
    
    // Length check (1-10 chars)
    if (normalized.length < 1 || normalized.length > 10) {
        return null;
    }
    
    return validator.escape(normalized.toUpperCase());
}

export function sanitizeQuery(query: string): string {
    // Check for null/undefined
    if (!query || typeof query !== 'string') {
        return '';
    }

    // Normalize unicode
    let clean = query.normalize('NFKC');
    
    // Check for null bytes
    if (clean.includes('\0')) {
        logSecurityEvent('INVALID_INPUT', { type: 'null_byte', input: clean.substring(0, 50) });
        return '';
    }
    
    // Escape HTML entities
    clean = validator.escape(clean);
    
    // Remove dangerous patterns (use timeout-safe simple replacements)
    clean = clean.replace(/<script[^>]*>.*?<\/script>/gi, ''); // Simple, non-backtracking
    clean = clean.replace(/javascript:/gi, '');
    clean = clean.replace(/on\w+\s*=/gi, '');
    clean = clean.replace(/data:text\/html/gi, '');
    
    return clean.trim().slice(0, 500); // Max 500 chars
}

// ============================================
// 3. REQUEST SIZE LIMIT
// ============================================
export function validateRequestSize(request: Request): boolean {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 100 * 1024) { // 100KB limit
        return false;
    }
    return true;
}

// ============================================
// 4. IP EXTRACTION (For Rate Limiting)
// ============================================
export function getClientIp(request: Request): string {
    // Check common proxy headers
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    
    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;
    
    const cfIp = request.headers.get('cf-connecting-ip'); // Cloudflare
    if (cfIp) return cfIp;
    
    return 'unknown';
}

// ============================================
// 5. SECURITY HEADERS
// ============================================
export function getSecurityHeaders() {
    return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://query1.finance.yahoo.com https://www.screener.in https://www.nseindia.com https://generativelanguage.googleapis.com",
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
}

// ============================================
// 6. API KEY VALIDATION (Optional)
// ============================================
const VALID_API_KEYS = new Set([
    process.env.API_KEY_1,
    process.env.API_KEY_2,
    process.env.API_KEY_3
].filter(Boolean));

export function validateApiKey(apiKey: string | null): boolean {
    // If no API keys configured, allow all requests
    if (VALID_API_KEYS.size === 0) return true;
    
    // If API keys configured, validate
    return apiKey ? VALID_API_KEYS.has(apiKey) : false;
}

// ============================================
// 7. MONGODB INJECTION PREVENTION
// ============================================
export function sanitizeMongoInput(input: any): any {
    if (typeof input !== 'object' || input === null) {
        return input;
    }
    
    // Check for MongoDB operators
    const dangerousKeys = ['$where', '$regex', '$expr', '$function', '$accumulator', '$ne', '$gt', '$lt'];
    
    for (const key of Object.keys(input)) {
        if (key.startsWith('$')) {
            logSecurityEvent('INVALID_INPUT', { type: 'mongo_injection', key });
            throw new Error('Invalid input: MongoDB operators not allowed');
        }
    }
    
    return input;
}

export function validateMongoSymbol(symbol: string): boolean {
    // Ensure symbol is a plain string without MongoDB operators
    if (typeof symbol !== 'string') {
        return false;
    }
    
    // Check for MongoDB operator patterns
    if (symbol.includes('$') || symbol.includes('{') || symbol.includes('}')) {
        logSecurityEvent('INVALID_INPUT', { type: 'mongo_injection_symbol', symbol: symbol.substring(0, 20) });
        return false;
    }
    
    return true;
}

// ============================================
// 8. SSRF PROTECTION
// ============================================
const ALLOWED_DOMAINS = [
    'query1.finance.yahoo.com',
    'www.screener.in',
    'www.nseindia.com',
    'www.moneycontrol.com',
    'www.bseindia.com',
    'generativelanguage.googleapis.com'
];

const BLOCKED_IP_RANGES = [
    /^127\./, // Localhost
    /^10\./, // Private Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
    /^192\.168\./, // Private Class C
    /^169\.254\./, // Link-local
    /^0\./, // Invalid
    /^224\./, // Multicast
    /^240\./ // Reserved
];

export function validateUrl(url: string): { valid: boolean; error?: string } {
    try {
        const parsed = new URL(url);
        
        // Only allow HTTPS (except localhost for dev)
        if (parsed.protocol !== 'https:' && !url.includes('localhost')) {
            return { valid: false, error: 'Only HTTPS URLs allowed' };
        }
        
        // Check if domain is in whitelist
        const isAllowed = ALLOWED_DOMAINS.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
        
        if (!isAllowed && !url.includes('localhost')) {
            logSecurityEvent('INVALID_INPUT', { type: 'ssrf_attempt', url: parsed.hostname });
            return { valid: false, error: 'Domain not allowed' };
        }
        
        // Check for IP address (should use domain names)
        if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
            for (const pattern of BLOCKED_IP_RANGES) {
                if (pattern.test(parsed.hostname)) {
                    logSecurityEvent('INVALID_INPUT', { type: 'ssrf_private_ip', ip: parsed.hostname });
                    return { valid: false, error: 'Private IP ranges not allowed' };
                }
            }
        }
        
        return { valid: true };
        
    } catch (error) {
        return { valid: false, error: 'Invalid URL format' };
    }
}

// ============================================
// 9. ERROR SANITIZATION
// ============================================
export function sanitizeError(error: any): { code: string; message: string } {
    // Never expose internal error details to users
    const errorMap: Record<string, string> = {
        'ECONNREFUSED': 'SERVICE_UNAVAILABLE',
        'ETIMEDOUT': 'REQUEST_TIMEOUT',
        'ENOTFOUND': 'SERVICE_UNAVAILABLE',
        'MongoDB': 'DATABASE_ERROR',
        'fetch': 'EXTERNAL_SERVICE_ERROR'
    };
    
    const errorMessage = error?.message || String(error);
    
    // Find matching error type
    for (const [key, code] of Object.entries(errorMap)) {
        if (errorMessage.includes(key)) {
            return { code, message: 'An error occurred while processing your request' };
        }
    }
    
    // Generic error
    return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
}

// ============================================
// 10. CREDENTIAL REDACTION
// ============================================
const SENSITIVE_KEYS = ['password', 'apikey', 'token', 'secret', 'authorization', 'cookie', 'session'];

export function redactSensitiveData(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    
    const redacted = Array.isArray(obj) ? [...obj] : { ...obj };
    
    for (const key in redacted) {
        const lowerKey = key.toLowerCase();
        
        // Redact sensitive keys
        if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
            redacted[key] = '[REDACTED]';
        } else if (typeof redacted[key] === 'object') {
            redacted[key] = redactSensitiveData(redacted[key]);
        }
    }
    
    return redacted;
}

// ============================================
// 11. ENVIRONMENT VALIDATION
// ============================================
export function validateEnvironment(): { valid: boolean; missing: string[] } {
    const required = [
        'MONGO_URL',
        'GEMINI_API_KEY',
        'SCREENER_EMAIL',
        'SCREENER_PASSWORD'
    ];
    
    const missing: string[] = [];
    
    for (const key of required) {
        if (!process.env[key]) {
            missing.push(key);
        }
    }
    
    if (missing.length > 0) {
        console.error('❌ [Security] Missing required environment variables:', missing);
        return { valid: false, missing };
    }
    
    // Validate key formats (basic checks)
    if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb')) {
        console.error('❌ [Security] Invalid MONGODB_URI format');
        return { valid: false, missing: ['MONGODB_URI (invalid format)'] };
    }
    
    console.log('✅ [Security] Environment validation passed');
    return { valid: true, missing: [] };
}

// ============================================
// 12. LOGGING (Security Events)
// ============================================
type SecurityEventType = 'RATE_LIMIT' | 'INVALID_INPUT' | 'AUTH_FAILURE' | 'SSRF_ATTEMPT' | 'INJECTION_ATTEMPT';

export function logSecurityEvent(type: SecurityEventType, details: any) {
    const timestamp = new Date().toISOString();
    
    // Redact sensitive data before logging
    const safeDetails = redactSensitiveData(details);
    
    console.warn(`🚨 [Security:${type}] ${timestamp}`, safeDetails);
}