export interface SearchResult {
    id: string;
    title: string;
    content: string;
    source: string;
    timestamp: string;
    url?: string;
}



export interface SearchRequest{
    query:string;
    model:string;   
    conversation?: any[];
    skipAI?: boolean;  // ✅ COST OPTIMIZATION: Skip expensive AI calls on auto-refresh
    webSources?: Array<{  // ✅ NEW (temporary storage)
        id: number;
        title: string;
        link: string;
        snippet: string;
    }>;
}

export interface SearchResponse {
    id: string;
    title: string;
    content: string;
    source: string;
    timestamp: string;
    webSources?: Array<{  // ✅ NEW
        id: number;
        title: string;
        link: string;
        snippet: string;
    }>;
}

export interface ResultProps {
    results: SearchResult[];
    isLoading: boolean;
    query: string;
}
export interface PerplexityResponse {
    content: string;
  citations: Array<{ url: string; title?: string; text?: string }>;
  tokensUsed: number;
  cost: number;
}

// ========================
// BULK CHANGE DETECTION
// ========================
export interface BulkChangeCheckRequest {
    symbols: string[];                    // All stocks to check at once
    lastChecked?: { [symbol: string]: number };  // Optional: timestamp of last check per stock
}

export interface BulkChangeCheckResponse {
    changes: {
        [symbol: string]: {
            hasChanges: boolean;
            reasons: string[];           // ['New earnings Q4 2024', 'PE ratio changed 15%']
            changeType: 'earnings' | 'fundamentals' | 'technical' | 'none';
            lastEarningsQuarter?: string;  // 'Q4 2024'
            needsFullRefresh: boolean;   // true = fetch with skipAI:false, false = use cache
            error?: string;              // If check failed for this stock
        }
    };
    timestamp: number;
    checkedCount: number;
}