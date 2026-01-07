// DuckDuckGo Search Integration (100% FREE)
// Provides real-time stock news without API key requirements

import axios from 'axios';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search DuckDuckGo for relevant results
 * @param query - Search query
 * @param maxResults - Maximum number of results to return
 * @returns Array of search results
 */
export async function duckduckgoSearch(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  try {
    console.log(`🦆 [DuckDuckGo] Searching: "${query}"...`);
    
    // Use DuckDuckGo Instant Answer API (free, no key needed)
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      },
      timeout: 5000 // 5 second timeout
    });
    
    const results: SearchResult[] = [];
    
    // Extract results from RelatedTopics
    if (response.data.RelatedTopics && Array.isArray(response.data.RelatedTopics)) {
      for (const topic of response.data.RelatedTopics) {
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Result',
            url: topic.FirstURL,
            snippet: topic.Text
          });
          
          if (results.length >= maxResults) break;
        }
        
        // Handle nested topics
        if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const subTopic of topic.Topics) {
            if (subTopic.FirstURL && subTopic.Text) {
              results.push({
                title: subTopic.Text.split(' - ')[0] || 'Result',
                url: subTopic.FirstURL,
                snippet: subTopic.Text
              });
              
              if (results.length >= maxResults) break;
            }
          }
        }
        
        if (results.length >= maxResults) break;
      }
    }
    
    console.log(`✅ [DuckDuckGo] Found ${results.length} results (FREE)`);
    return results;
    
  } catch (error: any) {
    console.error('❌ [DuckDuckGo] Search failed:', error.message);
    return [];
  }
}

/**
 * Search for stock-specific news using multiple queries
 * @param symbol - Stock symbol (e.g., "RELIANCE", "AAPL")
 * @returns Array of news results from DuckDuckGo
 */
export async function searchStockNews(symbol: string): Promise<SearchResult[]> {
  const cleanSymbol = symbol.replace(/\.(NS|BO)$/, '');
  
  // Use broader queries that DuckDuckGo Instant Answer API can handle
  const queries = [
    `${cleanSymbol} India company`,
    `${cleanSymbol} business news`,
    `${cleanSymbol} stock market`
  ];
  
  const allResults: SearchResult[] = [];
  
  // Search in parallel for better performance
  const searchPromises = queries.map(query => duckduckgoSearch(query, 3));
  const results = await Promise.all(searchPromises);
  
  // Combine and deduplicate results
  const seenUrls = new Set<string>();
  for (const resultSet of results) {
    for (const result of resultSet) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        allResults.push(result);
      }
    }
  }
  
  console.log(`📰 [DuckDuckGo] Compiled ${allResults.length} unique news items for ${cleanSymbol}`);
  
  // If no results found, provide fallback context
  if (allResults.length === 0) {
    console.log(`⚠️ [DuckDuckGo] No news found via API for ${cleanSymbol} - AI will use general knowledge`);
    return [{
      title: `${cleanSymbol} - Market Information`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(cleanSymbol + ' stock news')}`,
      snippet: `Search DuckDuckGo for latest ${cleanSymbol} stock news and market updates.`
    }];
  }
  
  return allResults.slice(0, 8); // Return top 8 results
}

/**
 * Format news results for AI prompt
 * @param newsResults - Array of search results
 * @returns Formatted string for AI prompt
 */
export function formatNewsForPrompt(newsResults: SearchResult[]): string {
  if (newsResults.length === 0) {
    return 'No recent news available from web search. Use your general knowledge about the company and sector.';
  }
  
  // Check if it's a fallback result
  if (newsResults.length === 1 && newsResults[0].title.includes('Market Information')) {
    return `Limited web search results available. Analyze based on:\n- Company fundamentals and sector trends\n- Technical indicators and price action\n- General market conditions and economic factors`;
  }
  
  return newsResults
    .map((news, index) => `${index + 1}. ${news.title}\n   ${news.snippet}`)
    .join('\n\n');
}
