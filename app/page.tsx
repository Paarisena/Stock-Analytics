"use client";
import { Send, Sparkles, Menu, Plus, Loader2 } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import ReactMarkdown from 'react-markdown';
import DataVisualizer from './components/DataVisualizer';
import StockCard from './components/StockCard';

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Array<{
    id: number;
    title: string;
    link: string;
  }>;
  model?: string;
  cached?: boolean;
  visualization?: any;
}

interface StockSuggestion {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  // ✅ Throttle refs
  const resizeThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const searchThrottleRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ MEMOIZE EXPENSIVE COMPUTATIONS - Move to top and add empty deps
  const detectVisualization = useCallback((query: string, content: string) => {
    const lowerQuery = query.toLowerCase();
    const lowerContent = content.toLowerCase();

    // Weather detection - improved parsing
    if (lowerQuery.includes('weather') || lowerQuery.includes('temperature') || lowerQuery.includes('temp')) {
      const tempMatch = content.match(/(\d+\.?\d*)\s*°?\s*[CF]|temperature.*?(\d+\.?\d*)|(\d+\.?\d*)\s*degrees/i);
      
      let location = 'Unknown';
      const locationPatterns = [
        /(?:weather\s+(?:in|at|for|of)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:in|at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+weather/i,
        /(?:in|at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:weather|temperature|temp)/i,
      ];
      
      for (const pattern of locationPatterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
          location = match[1];
          break;
        }
      }
      
      if (location === 'Unknown') {
        const contentLocationMatch = content.match(/(?:in|at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (contentLocationMatch) location = contentLocationMatch[1];
      }
      
      let condition = 'Clear';
      if (lowerContent.includes('rain') || lowerContent.includes('drizzle') || lowerContent.includes('shower')) condition = 'Rainy';
      else if (lowerContent.includes('cloud') || lowerContent.includes('overcast')) condition = 'Cloudy';
      else if (lowerContent.includes('sun') || lowerContent.includes('clear')) condition = 'Sunny';
      else if (lowerContent.includes('storm') || lowerContent.includes('thunder')) condition = 'Stormy';
      else if (lowerContent.includes('snow')) condition = 'Snowy';
      else if (lowerContent.includes('fog') || lowerContent.includes('mist')) condition = 'Foggy';
      
      const humidityMatch = content.match(/humidity.*?(\d+)%|(\d+)%.*?humidity/i);
      const windMatch = content.match(/wind.*?(\d+\.?\d*)\s*(?:km\/h|mph|m\/s)|(\d+\.?\d*)\s*(?:km\/h|mph|m\/s).*?wind/i);
      const visibilityMatch = content.match(/visibility.*?(\d+\.?\d*)\s*(?:km|miles)|(\d+\.?\d*)\s*(?:km|miles).*?visibility/i);
      const pressureMatch = content.match(/pressure.*?(\d+\.?\d*)\s*(?:mb|hPa|mbar)|(\d+\.?\d*)\s*(?:mb|hPa|mbar).*?pressure/i);
      
      if (tempMatch) {
        const temp = parseInt(tempMatch[1] || tempMatch[2] || tempMatch[3]);
        return {
          type: 'weather',
          data: {
            location: location,
            temperature: temp,
            condition: condition,
            humidity: humidityMatch ? parseInt(humidityMatch[1] || humidityMatch[2]) : undefined,
            windSpeed: windMatch ? parseFloat(windMatch[1] || windMatch[2]) : undefined,
            visibility: visibilityMatch ? parseFloat(visibilityMatch[1] || visibilityMatch[2]) : undefined,
            pressure: pressureMatch ? parseFloat(pressureMatch[1] || pressureMatch[2]) : undefined,
          }
        };
      }
    }

    // Stock detection
    if (lowerQuery.match(/stock|price|share|ticker/i)) {
      let currency = 'USD';
      const currencyPatterns = {
        'JPY': /(?:¥|yen|jpy)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:¥|yen|jpy)/i,
        'EUR': /(?:€|euro|eur)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:€|euro|eur)/i,
        'GBP': /(?:£|pound|gbp)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:£|pound|gbp)/i,
        'INR': /(?:₹|rupee|inr|rs)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:₹|rupee|inr|rs)/i,
        'CNY': /(?:yuan|cny|rmb)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:yuan|cny|rmb)/i,
        'KRW': /(?:₩|won|krw)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:₩|won|krw)/i,
        'AUD': /(?:a\$|aud|australian)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:a\$|aud)/i,
        'CAD': /(?:c\$|cad|canadian)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:c\$|cad)/i,
        'CHF': /(?:chf|franc)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:chf|franc)/i,
        'HKD': /(?:hk\$|hkd|hong kong)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:hk\$|hkd)/i,
        'SGD': /(?:s\$|sgd|singapore)\s*(\d+\.?\d*)|(\d+\.?\d*)\s*(?:s\$|sgd)/i,
      };

      let priceMatch = null;
      
      for (const [curr, pattern] of Object.entries(currencyPatterns)) {
        const match = content.match(pattern);
        if (match) {
          currency = curr;
          priceMatch = match;
          break;
        }
      }
      
      if (!priceMatch) {
        priceMatch = content.match(/\$(\d+\.?\d*)|price.*?(\d+\.?\d*)|(\d+\.?\d*)\s*(?:USD|dollars)/i);
      }
      
      if (lowerQuery.match(/japan|tokyo|nikkei/i)) currency = 'JPY';
      else if (lowerQuery.match(/india|mumbai|nse|bse/i)) currency = 'INR';
      else if (lowerQuery.match(/china|shanghai|shenzhen/i)) currency = 'CNY';
      else if (lowerQuery.match(/korea|seoul|kospi/i)) currency = 'KRW';
      else if (lowerQuery.match(/uk|london|ftse/i)) currency = 'GBP';
      else if (lowerQuery.match(/europe|euro|germany|france/i)) currency = 'EUR';
      else if (lowerQuery.match(/australia|sydney/i)) currency = 'AUD';
      else if (lowerQuery.match(/canada|toronto/i)) currency = 'CAD';
      else if (lowerQuery.match(/hong kong|hk/i)) currency = 'HKD';
      else if (lowerQuery.match(/singapore/i)) currency = 'SGD';
      
      let symbol = 'STOCK';
      const symbolMatch = query.match(/\b([A-Z]{1,5})\b/) || content.match(/\b([A-Z]{2,5})\b/);
      if (symbolMatch) symbol = symbolMatch[1];
      
      const nameMatch = content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:stock|share|ticker|company)/i);
      
      let price = 0;
      const pricePatterns = [
        /(?:is\s+trading\s+at|trading\s+at|currently\s+at|price\s+is|is\s+at)\s+[¥₹€£$₩]?(\d+\.?\d*)/i,
        /[¥₹€£$₩](\d+\.?\d*)\s+(?:per\s+share|each)/i,
        /current(?:ly)?\s+[¥₹€£$₩]?(\d+\.?\d*)/i,
        /[¥₹€£$₩](\d+\.?\d*)/,
      ];
      
      for (const pattern of pricePatterns) {
        const match = content.match(pattern);
        if (match) {
          price = parseFloat(match[1]);
          break;
        }
      }
      
      if (!price && priceMatch) {
        price = parseFloat(priceMatch[1] || priceMatch[2] || priceMatch[3]);
      }
      
      const changeMatch = content.match(/(?:up|down|increased|decreased|gained|lost|fell)\s+[¥₹€£$₩]?(\d+\.?\d*)|(?:\+|-)?\s*[¥₹€£$₩]?(\d+\.?\d*)\s+(?:\(|or)/i);
      const percentMatch = content.match(/(\d+\.?\d*)%/);
      
      const highMatch = content.match(/(?:high|day\s+high).*?[¥₹€£$₩]?(\d+\.?\d*)|(\d+\.?\d*).*?(?:high)/i);
      const lowMatch = content.match(/(?:low|day\s+low).*?[¥₹€£$₩]?(\d+\.?\d*)|(\d+\.?\d*).*?(?:low)/i);
      const openMatch = content.match(/open(?:ed|ing)?.*?[¥₹€£$₩]?(\d+\.?\d*)|(\d+\.?\d*).*?open/i);
      const prevCloseMatch = content.match(/(?:previous|prev|yesterday).*?close.*?[¥₹€£$₩]?(\d+\.?\d*)|close.*?[¥₹€£$₩]?(\d+\.?\d*)/i);
      const volumeMatch = content.match(/volume.*?(\d+\.?\d*)\s*(?:million|M|K|billion|B)|(\d+\.?\d*)\s*(?:million|M|K|billion|B).*?volume/i);
      
      if (price > 0) {
        const change = changeMatch ? parseFloat(changeMatch[1] || changeMatch[2]) : 0;
        const isPositive = !lowerContent.includes('down') && !lowerContent.includes('decreased') && !lowerContent.includes('fell') && !lowerContent.includes('lost');
        
        return {
          type: 'stock',
          data: {
            symbol: symbol,
            name: nameMatch?.[1] || `${symbol} Stock`,
            price: price,
            change: isPositive ? Math.abs(change) : -Math.abs(change),
            changePercent: percentMatch ? parseFloat(percentMatch[1]) : (price > 0 ? (change / price * 100) : 0),
            high: highMatch ? parseFloat(highMatch[1] || highMatch[2]) : undefined,
            low: lowMatch ? parseFloat(lowMatch[1] || lowMatch[2]) : undefined,
            open: openMatch ? parseFloat(openMatch[1] || openMatch[2]) : undefined,
            previousClose: prevCloseMatch ? parseFloat(prevCloseMatch[1] || prevCloseMatch[2]) : undefined,
            volume: volumeMatch ? parseFloat(volumeMatch[1] || volumeMatch[2]) * 1000000 : undefined,
            currency: currency,
          }
        };
      }
    }

    // Data/numbers detection
    const numberPattern = /([A-Za-z]+\w*)[\s:]+(\d+\.?\d*)/g;
    const matches = [...content.matchAll(numberPattern)];
    
    if (matches.length >= 3 && (lowerQuery.includes('compare') || lowerQuery.includes('data') || lowerQuery.includes('statistics') || lowerQuery.includes('chart') || lowerQuery.includes('graph'))) {
      const data = matches.slice(0, 8).map(m => ({
        name: m[1].replace(/[_-]/g, ' '),
        value: parseFloat(m[2])
      }));

      const chartType = lowerQuery.includes('trend') || lowerQuery.includes('over time') || lowerQuery.includes('timeline') ? 'line' :
                       lowerQuery.includes('distribution') || lowerQuery.includes('percentage') || lowerQuery.includes('share') ? 'pie' :
                       'bar';

      return {
        type: 'chart',
        chartType,
        data,
        title: 'Data Visualization'
      };
    }

    return null;
  }, []); // ✅ Empty deps - pure function

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []); // ✅ Empty deps

  const fetchSuggestions = useCallback(async (searchText: string) => {
    if (!searchText.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await axios.get(`/api/stock-suggestions?query=${encodeURIComponent(searchText)}`);
      if (response.data && Array.isArray(response.data)) {
        setSuggestions(response.data);
        setShowSuggestions(response.data.length > 0);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  // ✅ THROTTLED SCROLL - Only depend on messages length, not the whole array
  const messagesLength = messages.length;
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [messagesLength, scrollToBottom]);

  // ✅ THROTTLED TEXTAREA RESIZE
  useEffect(() => {
    if (resizeThrottleRef.current) {
      clearTimeout(resizeThrottleRef.current);
    }
    
    resizeThrottleRef.current = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
      }
    }, 50); // Throttle to 50ms
    
    return () => {
      if (resizeThrottleRef.current) {
        clearTimeout(resizeThrottleRef.current);
      }
    };
  }, [query]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          textareaRef.current && !textareaRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSuggestions]);

  // ✅ SIMPLE INPUT HANDLER - With suggestion search
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedSuggestionIndex(-1);
    
    // Throttle suggestion search
    if (searchThrottleRef.current) {
      clearTimeout(searchThrottleRef.current);
    }
    
    searchThrottleRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  }, [fetchSuggestions]);

  const fetchResults = async (searchQuery: string) => {
    const userMessage: Message = {
      role: "user",
      content: searchQuery,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    setIsLoading(true);
    setQuery("");
    
    try {
      const conversation = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      
      const response = await axios.post("/api/search", {
        query: searchQuery,
        model: "Sonar",
        conversation: conversation,
      });

      let visualization = null;
      if (response.data.realtimeData) {
        console.log('✅ Using MCP real-time data:', response.data.realtimeData);
        visualization = { 
          type: response.data.realtimeData.type, 
          data: response.data.realtimeData 
        };
      } else {
        console.log('⚠️ No MCP data, falling back to detectVisualization');
        visualization = detectVisualization(searchQuery, response.data.results[0]?.content);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: response.data.results[0]?.content || "No response received",
        timestamp: new Date(),
        sources: response.data.sources || [],
        model: response.data.aiModel,
        cached: response.data.cached,
        visualization: visualization,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Search error:", error);
      
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${error.response?.data?.error || error.message || "Failed to fetch results"}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;
    
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
    fetchResults(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        return;
      }
      if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        const selected = suggestions[selectedSuggestionIndex];
        setQuery(selected.symbol);
        setShowSuggestions(false);
        setSuggestions([]);
        setSelectedSuggestionIndex(-1);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        return;
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const newChat = () => {
    setMessages([]);
    setQuery("");
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Main Content - Centered */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with Dashboard Link */}
        <div className="bg-gradient-to-r from-black via-gray-900 to-black border-b border-gray-800 px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-400">
              AI Stock Search
            </div>
            <a
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-white font-medium transition-all shadow-lg hover:shadow-xl text-sm"
            >
              📊 Open Dashboard
            </a>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
            {messages.length === 0 ? (
              <div className="text-center mt-32 px-4">
                <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 rounded-3xl backdrop-blur-xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/10">
                  <Sparkles size={40} className="text-cyan-400 animate-pulse" />
                </div>
                <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">
                  AI Stock Analysis
                </h2>
                <p className="text-gray-400 text-lg max-w-md mx-auto mb-8">
                  Real-time stock predictions and comprehensive fundamental analysis powered by AI
                </p>
                
                {/* Quick Start Examples */}
                <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
                  {['RELIANCE.NS', 'TCS.NS', 'AAPL', 'TSLA', 'INFY.NS'].map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => {
                        setQuery(symbol);
                        setTimeout(() => {
                          const form = document.querySelector('form');
                          if (form) form.requestSubmit();
                        }, 100);
                      }}
                      className="px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 hover:border-cyan-500/50 rounded-full text-sm text-gray-400 hover:text-cyan-400 transition-all duration-200"
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 sm:space-y-8 lg:space-y-10">
                {messages.map((message, index) => (
                  <div key={index} className="space-y-4 animate-fade-in">
                    {message.role === "user" && (
                      <div className="flex gap-3 sm:gap-4">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-lg">
                          U
                        </div>
                        <div className="flex-1 pt-1">
                          <p className="text-gray-100 leading-relaxed text-sm sm:text-base break-words">{message.content}</p>
                        </div>
                      </div>
                    )}

                    {message.role === "assistant" && (
                      <div className="flex gap-3 sm:gap-4">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-gray-800 to-gray-700 flex-shrink-0 flex items-center justify-center shadow-lg">
                          <Sparkles size={16} className="text-blue-400" />
                        </div>
                        <div className="flex-1 space-y-4 min-w-0">
                          {/* Visualization */}
                          {message.visualization && (
                            <>
                              {message.visualization.type === 'stock' && (
                                <StockCard data={message.visualization.data} />
                              )}
                              {message.visualization.type === 'chart' && (
                                <DataVisualizer 
                                  data={message.visualization.data}
                                  type={message.visualization.chartType}
                                  title={message.visualization.title}
                                />
                              )}
                            </>
                          )}

                          {/* Content */}
                          <div className="prose prose-invert prose-sm sm:prose-base max-w-none">
                            <ReactMarkdown
                              components={{
                                p: ({ node, ref, ...props }) => <p className="text-gray-200 leading-relaxed mb-3 sm:mb-4 text-sm sm:text-base" {...props} />,
                                a: ({ node, ref, href, children, ...props }) => {
                                  const text = children?.toString() || '';
                                  if (/^\d+$/.test(text) && href === 'function link() { [native code] }') {
                                    return (
                                      <sup className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-blue-400 bg-blue-500/10 rounded border border-blue-400/30 mx-0.5 hover:bg-blue-500/20 transition-colors">
                                        {text}
                                      </sup>
                                    );
                                  }
                                  return (
                                    <a 
                                      className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/30 hover:decoration-blue-300 transition-colors break-words" 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      href={href}
                                      {...props}
                                    >
                                      {children}
                                    </a>
                                  );
                                },
                                strong: ({ node, ref, ...props }) => <strong className="font-semibold text-gray-100" {...props} /> ,
                                ul: ({ node, ref, ...props }) => <ul className="list-disc list-inside space-y-1 sm:space-y-2 text-gray-200 text-sm sm:text-base" {...props} />,
                                ol: ({ node, ref, ...props }) => <ol className="list-decimal list-inside space-y-1 sm:space-y-2 text-gray-200 text-sm sm:text-base" {...props} />,
                                code: ({ node, inline, ...props }: any) => 
                                  inline 
                                    ? <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs sm:text-sm text-gray-200" {...props} />
                                    : <code className="block bg-gray-800 p-3 sm:p-4 rounded-lg text-xs sm:text-sm text-gray-200 overflow-x-auto" {...props} />
                              }}
                           >
                              {message.content}
                            </ReactMarkdown>
                          </div>

                          {/* Sources */}
                          {message.sources && message.sources.length > 0 && (
                            <div className="space-y-3">
                              <div className="text-xs sm:text-sm text-gray-500 font-semibold uppercase tracking-wider">
                                Sources
                              </div>
                              <div className="grid gap-2 sm:gap-3">
                                {message.sources.map((source) => {
                                  let hostname = '';
                                  try {
                                    hostname = new URL(source.link).hostname;
                                  } catch {
                                    hostname = source.link || 'Unknown source';
                                  }

                                  return (
                                    <a
                                      key={source.id}
                                      href={source.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-start gap-3 p-3 sm:p-4 rounded-xl bg-gray-800/40 hover:bg-gray-800/70 border border-gray-700/30 hover:border-gray-600/50 transition-all duration-200 group hover:scale-[1.01]"
                                    >
                                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center text-xs sm:text-sm font-bold text-white flex-shrink-0 shadow-lg">
                                        {source.id}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm sm:text-base text-gray-200 group-hover:text-blue-400 transition-colors line-clamp-2 font-medium">
                                          {source.title}
                                        </div>
                                        <div className="text-xs sm:text-sm text-gray-500 truncate mt-1">
                                          {hostname}
                                        </div>
                                      </div>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-3 sm:gap-4 animate-fade-in">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-gray-800 to-gray-700 flex-shrink-0 flex items-center justify-center shadow-lg">
                      <Sparkles size={16} className="text-blue-400 animate-pulse" />
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce shadow-lg shadow-blue-500/50" style={{ animationDelay: "0ms" }}></div>
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce shadow-lg shadow-purple-500/50" style={{ animationDelay: "150ms" }}></div>
                        <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce shadow-lg shadow-pink-500/50" style={{ animationDelay: "300ms" }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area - Chat Style at Bottom */}
        <div className="border-t border-gray-700/30 backdrop-blur-xl bg-gray-900/50 p-4 sm:p-6 sticky bottom-0">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              {/* Stock Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div 
                  ref={suggestionsRef}
                  className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800/95 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50"
                >
                  <div className="max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.symbol}-${index}`}
                        type="button"
                        onClick={() => {
                          setQuery(suggestion.symbol);
                          setShowSuggestions(false);
                          setSuggestions([]);
                          setSelectedSuggestionIndex(-1);
                          textareaRef.current?.focus();
                        }}
                        className={`w-full px-5 py-3 flex items-center gap-4 hover:bg-cyan-500/10 transition-colors text-left ${
                          index === selectedSuggestionIndex ? 'bg-cyan-500/20' : ''
                        } ${index !== suggestions.length - 1 ? 'border-b border-gray-700/30' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-bold text-cyan-400 text-sm">
                              {suggestion.symbol}
                            </span>
                            {suggestion.exchange && (
                              <span className="text-xs px-2 py-0.5 bg-gray-700/50 rounded text-gray-400">
                                {suggestion.exchange}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {suggestion.name}
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <div className="px-5 py-2 bg-gray-900/50 border-t border-gray-700/30 text-xs text-gray-500 flex items-center justify-between">
                    <span>Use ↑↓ to navigate, Enter to select</span>
                    <span className="text-gray-600">ESC to close</span>
                  </div>
                </div>
              )}
              
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/10 to-blue-600/10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                <div className="relative flex items-center bg-gray-800/60 backdrop-blur-xl rounded-3xl border border-gray-700/50 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 px-5 sm:px-6 py-3 sm:py-3.5">
                  <div className="flex-1">
                    <textarea
                      ref={textareaRef}
                      value={query}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Search stocks (e.g., RELIANCE.NS, AAPL, TCS.NS)..."
                      className="w-full bg-transparent text-white placeholder-gray-500 outline-none resize-none max-h-32 text-sm sm:text-base leading-relaxed"
                      rows={1}
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !query.trim()}
                    className="ml-3 sm:ml-4 p-2.5 sm:p-3 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-cyan-500/30 disabled:shadow-none"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
