import { useState, useEffect, useRef } from 'react';

export interface LivePriceData {
  livePrice: number;
  priceChange: number;
  isPriceIncreasing: boolean;
  lastUpdate: Date;
  isLive: boolean;
  volume: number;
  dayHigh: number;
  dayLow: number;
  marketState: string;
}

interface UseLivePriceProps {
  symbol: string;
  initialPrice: number;
  isLive: boolean;
}

export function useLivePrice({ symbol, initialPrice, isLive }: UseLivePriceProps): LivePriceData {
  const [livePrice, setLivePrice] = useState(initialPrice);
  const [priceChange, setPriceChange] = useState(0);
  const [isPriceIncreasing, setIsPriceIncreasing] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [volume, setVolume] = useState(0);
  const [dayHigh, setDayHigh] = useState(initialPrice);
  const [dayLow, setDayLow] = useState(initialPrice);
  const [marketState, setMarketState] = useState('REGULAR');
  const previousPriceRef = useRef(initialPrice);

  // 💰 LIVE PRICE: Direct Yahoo Finance API (100% FREE, no Perplexity)
  // Uses dedicated /api/live-price endpoint - most efficient approach
  useEffect(() => {
    if (!isLive) return;
    
    const fetchLivePrice = async () => {
      try {
        // Direct Yahoo Finance endpoint - fastest and FREE
        const response = await fetch(`/api/live-price?symbol=${encodeURIComponent(symbol)}`);
        const apiData = await response.json();
        
        // Check for API error response
        if (apiData.error) {
          console.error(`❌ [Live Price] API error for ${symbol}:`, apiData.error);
          return;
        }
        
        if (apiData.price) {
          const newPrice = apiData.price;
          
          // Track price direction (compare with previous price)
          setIsPriceIncreasing(newPrice > previousPriceRef.current);
          setPriceChange(newPrice - initialPrice);
          
          // Update reference AFTER comparison but BEFORE state update
          previousPriceRef.current = newPrice;
          
          setLivePrice(newPrice);
          setLastUpdate(new Date(apiData.timestamp));
          
          // Update day high/low from API
          setDayHigh(apiData.dayHigh || newPrice);
          setDayLow(apiData.dayLow || newPrice);
          
          // Update volume from API
          setVolume(apiData.volume || 0);
          
          // Update market state from API
          setMarketState(apiData.marketState || 'REGULAR');
          
          console.log(`💰 [Live Price] ${symbol}: ${newPrice} (${apiData.marketState})`);
        } else {
          console.warn(`⚠️ [Live Price] No price data returned for ${symbol}`);
        }
      } catch (error) {
        console.error(`❌ [Live Price] Fetch failed for ${symbol}:`, error);
      }
    };
    
    // Fetch immediately
    fetchLivePrice();
    
    // Then fetch every 3 seconds for active traders
    // 100% FREE - direct Yahoo Finance, no MCP wrapper, no Perplexity
    const interval = setInterval(fetchLivePrice, 1000);
    
    return () => clearInterval(interval);
  }, [isLive, symbol, initialPrice]); // Removed livePrice to prevent infinite intervals

  // Initial volume setup
  useEffect(() => {
    setVolume(Math.floor(Math.random() * 1000000));
    setDayHigh(initialPrice);
    setDayLow(initialPrice);
  }, [initialPrice]);

  return {
    livePrice,
    priceChange,
    isPriceIncreasing,
    lastUpdate,
    isLive,
    volume,
    dayHigh,
    dayLow,
    marketState,
  };
}
