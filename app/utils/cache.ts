/**
 * Generic Cache Manager for stock data
 * Handles cache operations with TTL, age calculation, and logging
 */

interface CachedData<T> {
    data: T;
    timestamp: number;
    [key: string]: any; // For additional metadata like quarter, date, etc.
}

export class CacheManager<T> {
    private cache: Map<string, CachedData<T>>;
    private cacheName: string;

    constructor(cacheName: string) {
        this.cache = new Map();
        this.cacheName = cacheName;
    }

    /**
     * Get cached data if valid (returns full cached object with metadata)
     */
    get(key: string, duration: number): CachedData<T> | null {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp < duration) {
            const age = this.formatAge(cached.timestamp);
            console.log(`♻️ [${this.cacheName} Cache] Using cached data for ${key} (${age} old)`);
            return cached;
        }

        // Expired
        this.cache.delete(key);
        return null;
    }

    /**
     * Get just the data (shorthand for common use case)
     */
    getData(key: string, duration: number): T | null {
        const cached = this.get(key, duration);
        return cached ? cached.data : null;
    }

    /**
     * Set cached data with metadata
     */
    set(key: string, data: T, metadata?: Record<string, any>): void {
        const cacheData: CachedData<T> = {
            data,
            timestamp: Date.now(),
            ...metadata
        };
        this.cache.set(key, cacheData);
        console.log(`💾 [${this.cacheName} Cache] Stored ${key}`);
    }

    /**
     * Clear specific cache entry
     */
    clear(key: string): void {
        this.cache.delete(key);
        console.log(`🗑️ [${this.cacheName} Cache] Cleared ${key}`);
    }

    /**
     * Clear all cache entries
     */
    clearAll(): void {
        this.cache.clear();
        console.log(`🗑️ [${this.cacheName} Cache] Cleared all entries`);
    }

    /**
     * Get cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Format cache age in human-readable format
     */
    private formatAge(timestamp: number): string {
        const ageMs = Date.now() - timestamp;
        const ageSeconds = Math.round(ageMs / 1000);
        const ageMinutes = Math.round(ageMs / (60 * 1000));
        const ageHours = Math.round(ageMs / (60 * 60 * 1000));
        const ageDays = Math.round(ageMs / (24 * 60 * 60 * 1000));

        if (ageSeconds < 60) return `${ageSeconds}s`;
        if (ageMinutes < 60) return `${ageMinutes}m`;
        if (ageHours < 24) return `${ageHours}h`;
        return `${ageDays} days`;
    }
}
