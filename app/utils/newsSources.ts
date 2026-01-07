// ========================
// FREE NEWS SOURCES UTILITY
// ========================
// Replaces expensive Perplexity news searches ($0.005/call) with FREE alternatives
// - Yahoo Finance: US stocks (AAPL, TSLA)
// - MoneyControl RSS: Indian stocks (TCS, RELIANCE)
// - Economic Times RSS: Indian market news
// - Google News RSS: Universal fallback

import Parser from 'rss-parser';
import { CacheManager } from './cache';

const rssParser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
});

// Cache for 24 hours (news doesn't change every minute)
const newsCache = new CacheManager<{ headlines: string[], sources: any[], timestamp: number }>('News');
const CACHE_DURATION_NEWS = 24 * 60 * 60 * 1000; // 24 hours

interface NewsItem {
    title: string;
    link: string;
    pubDate?: string;
    source: string;
}

// ========================
// YAHOO FINANCE NEWS (US STOCKS)
// ========================
async function fetchYahooFinanceNews(symbol: string): Promise<NewsItem[]> {
    try {
        console.log(`📰 [Yahoo Finance] Fetching news for ${symbol}...`);
        
        // Yahoo Finance RSS feed
        const feedUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
        
        const feed = await rssParser.parseURL(feedUrl);
        
        const news: NewsItem[] = feed.items.slice(0, 10).map(item => ({
            title: item.title || '',
            link: item.link || '',
            pubDate: item.pubDate,
            source: 'Yahoo Finance'
        }));
        
        console.log(`✅ [Yahoo Finance] Got ${news.length} headlines for ${symbol}`);
        return news;
    } catch (error: any) {
        console.error(`❌ [Yahoo Finance] Error fetching news for ${symbol}:`, error.message);
        return [];
    }
}

// ========================
// MONEYCONTROL RSS (INDIAN STOCKS)
// ========================
async function fetchMoneyControlNews(): Promise<NewsItem[]> {
    try {
        console.log(`📰 [MoneyControl] Fetching Indian market news...`);
        
        const feeds = [
            'https://www.moneycontrol.com/rss/latestnews.xml',
            'https://www.moneycontrol.com/rss/marketedge.xml'
        ];
        
        const allNews: NewsItem[] = [];
        
        for (const feedUrl of feeds) {
            try {
                const feed = await rssParser.parseURL(feedUrl);
                const news = feed.items.slice(0, 5).map(item => ({
                    title: item.title || '',
                    link: item.link || '',
                    pubDate: item.pubDate,
                    source: 'MoneyControl'
                }));
                allNews.push(...news);
            } catch (err: any) {
                console.warn(`⚠️ [MoneyControl] Feed failed: ${feedUrl}`, err.message);
            }
        }
        
        console.log(`✅ [MoneyControl] Got ${allNews.length} headlines`);
        return allNews;
    } catch (error: any) {
        console.error(`❌ [MoneyControl] Error:`, error.message);
        return [];
    }
}

// ========================
// ECONOMIC TIMES RSS (INDIAN STOCKS)
// ========================
async function fetchEconomicTimesNews(): Promise<NewsItem[]> {
    try {
        console.log(`📰 [Economic Times] Fetching Indian market news...`);
        
        const feeds = [
            'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', // Markets
            'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms' // Stocks
        ];
        
        const allNews: NewsItem[] = [];
        
        for (const feedUrl of feeds) {
            try {
                const feed = await rssParser.parseURL(feedUrl);
                const news = feed.items.slice(0, 5).map(item => ({
                    title: item.title || '',
                    link: item.link || '',
                    pubDate: item.pubDate,
                    source: 'Economic Times'
                }));
                allNews.push(...news);
            } catch (err: any) {
                console.warn(`⚠️ [Economic Times] Feed failed: ${feedUrl}`, err.message);
            }
        }
        
        console.log(`✅ [Economic Times] Got ${allNews.length} headlines`);
        return allNews;
    } catch (error: any) {
        console.error(`❌ [Economic Times] Error:`, error.message);
        return [];
    }
}

// ========================
// GOOGLE NEWS RSS (UNIVERSAL)
// ========================
async function fetchGoogleNewsRSS(companyName: string, country: 'US' | 'IN' = 'US'): Promise<NewsItem[]> {
    try {
        console.log(`📰 [Google News] Fetching news for ${companyName}...`);
        
        const query = encodeURIComponent(`${companyName} stock`);
        const locale = country === 'IN' ? 'en-IN' : 'en-US';
        const region = country === 'IN' ? 'IN' : 'US';
        
        const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=${locale}&gl=${region}&ceid=${region}:en`;
        
        const feed = await rssParser.parseURL(feedUrl);
        
        const news: NewsItem[] = feed.items.slice(0, 10).map(item => ({
            title: item.title || '',
            link: item.link || '',
            pubDate: item.pubDate,
            source: 'Google News'
        }));
        
        console.log(`✅ [Google News] Got ${news.length} headlines for ${companyName}`);
        return news;
    } catch (error: any) {
        console.error(`❌ [Google News] Error fetching news for ${companyName}:`, error.message);
        return [];
    }
}

// ========================
// INDIAN RSS AGGREGATOR
// ========================
async function fetchIndianRSS(symbol: string, companyName?: string): Promise<NewsItem[]> {
    try {
        console.log(`📰 [Indian RSS] Fetching news for ${symbol}...`);
        
        // Fetch from both MoneyControl and Economic Times in parallel
        const [mcNews, etNews, googleNews] = await Promise.all([
            fetchMoneyControlNews(),
            fetchEconomicTimesNews(),
            companyName ? fetchGoogleNewsRSS(companyName, 'IN') : Promise.resolve([])
        ]);
        
        const allNews = [...mcNews, ...etNews, ...googleNews];
        
        // Filter by symbol/company name if provided
        let filtered = allNews;
        if (companyName) {
            const keywords = [symbol, companyName.toLowerCase(), ...companyName.toLowerCase().split(' ')];
            filtered = allNews.filter(item => 
                keywords.some(keyword => item.title.toLowerCase().includes(keyword))
            );
        }
        
        // If no matches found with filtering, return all news
        const finalNews = filtered.length > 0 ? filtered : allNews;
        
        console.log(`✅ [Indian RSS] Got ${finalNews.length} relevant headlines for ${symbol}`);
        return finalNews.slice(0, 15); // Top 15 headlines
    } catch (error: any) {
        console.error(`❌ [Indian RSS] Error:`, error.message);
        return [];
    }
}

// ========================
// MAIN NEWS FETCHER (with cache)
// ========================
export async function getStockNews(
    symbol: string, 
    companyName?: string,
    market: 'US' | 'IN' | 'AUTO' = 'AUTO'
): Promise<string[]> {
    try {
        const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
        const cacheKey = `${cleanSymbol}_${market}`;
        
        // Check cache first (24h TTL)
        const cached = newsCache.get(cacheKey, CACHE_DURATION_NEWS);
        if (cached) {
            const cacheAge = Date.now() - cached.timestamp;
            const ageHours = Math.round(cacheAge / 3600000);
            console.log(`💾 [News Cache HIT] Using cached news for ${cleanSymbol} (${ageHours}h old) - $0.00 cost!`);
            return cached.data.headlines;
        }
        
        console.log(`🔍 [News] Fetching fresh news for ${symbol}...`);
        
        let allNews: NewsItem[] = [];
        
        // Auto-detect market based on symbol
        let detectedMarket = market;
        if (market === 'AUTO') {
            detectedMarket = symbol.includes('.NS') || symbol.includes('.BO') || 
                             symbol.match(/^[A-Z&]+$/) ? 'IN' : 'US';
        }
        
        if (detectedMarket === 'IN') {
            // Indian stocks: Use MoneyControl, ET, Google News
            allNews = await fetchIndianRSS(cleanSymbol, companyName);
        } else {
            // US stocks: Use Yahoo Finance + Google News
            const [yahooNews, googleNews] = await Promise.all([
                fetchYahooFinanceNews(symbol),
                companyName ? fetchGoogleNewsRSS(companyName, 'US') : Promise.resolve([])
            ]);
            allNews = [...yahooNews, ...googleNews];
        }
        
        // Deduplicate by title (case-insensitive)
        const uniqueNews = allNews.filter((item, index, self) => 
            index === self.findIndex(t => t.title.toLowerCase() === item.title.toLowerCase())
        );
        
        // Extract headlines
        const headlines = uniqueNews.slice(0, 10).map(item => item.title);
        
        // Cache for 24 hours
        newsCache.set(cacheKey, {
            headlines,
            sources: uniqueNews.slice(0, 10),
            timestamp: Date.now()
        });
        
        console.log(`✅ [News] Fetched ${headlines.length} unique headlines for ${cleanSymbol} (FREE, cached 24h)`);
        return headlines;
        
    } catch (error: any) {
        console.error(`❌ [News] Error fetching news for ${symbol}:`, error.message);
        return [];
    }
}

// ========================
// COMPANY NAME HELPER
// ========================
export function getCompanyName(symbol: string): string | undefined {
    const companyMap: { [key: string]: string } = {
        // US Stocks
        'AAPL': 'Apple',
        'TSLA': 'Tesla',
        'GOOGL': 'Google',
        'MSFT': 'Microsoft',
        'AMZN': 'Amazon',
        'META': 'Meta',
        'NVDA': 'NVIDIA',
        
        // Indian Stocks
        'TCS': 'Tata Consultancy Services',
        'RELIANCE': 'Reliance Industries',
        'INFY': 'Infosys',
        'HDFCBANK': 'HDFC Bank',
        'ICICIBANK': 'ICICI Bank',
        'SBIN': 'State Bank of India',
        'WIPRO': 'Wipro',
        'BHARTIARTL': 'Bharti Airtel',
        'ITC': 'ITC Limited',
        'AXISBANK': 'Axis Bank'
    };
    
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '').toUpperCase();
    return companyMap[cleanSymbol];
}
