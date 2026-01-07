'use client';

import { useState, useEffect } from 'react';
import type { BulkChangeCheckResponse } from '@/DB/interface';

interface ComparisonGridProps {
  symbols: string[];
  onSelectStock: (symbol: string) => void;
  onSwitchToDetailed: () => void;
}

interface StockSummary {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  prediction1M: number;
  prediction3M: number;
  prediction6M: number;
  signal: string;
  rsi: number;
  aiConfidence?: number;
  hybridConfidence?: number;
  hybridReliability?: string;
  longTermConfidence?: number;
  longTermRecommendation?: string;
  loading: boolean;
  error?: string;
}

export default function ComparisonGrid({
  symbols,
  onSelectStock,
  onSwitchToDetailed,
}: ComparisonGridProps) {
  const [stocks, setStocks] = useState<StockSummary[]>([]);
  const [sortBy, setSortBy] = useState<'change' | 'prediction' | 'signal'>('change');
  const [stockUpdates, setStockUpdates] = useState<{[symbol: string]: string[]}>({});
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // 🔍 BULK CHANGE DETECTION: Check all stocks with single API call
  useEffect(() => {
    if (symbols.length === 0) return;

    const checkAllStocksForChanges = async () => {
      console.log('🔍 [Bulk Check] Checking all stocks for prediction/transcript changes...');
      
      try {
        const response = await fetch('/api/check-all-changes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols: symbols
          })
        });
        
        if (!response.ok) {
          console.error('Failed to check for changes');
          return;
        }
        
        const result: BulkChangeCheckResponse = await response.json();
        
        // Identify stocks that need updates
        const needsUpdate: string[] = [];
        const updateInfo: {[symbol: string]: string[]} = {};
        
        Object.entries(result.changes).forEach(([symbol, change]) => {
          if (change.hasChanges && change.needsFullRefresh) {
            needsUpdate.push(symbol);
            updateInfo[symbol] = change.reasons;
            console.log(`🔔 [${symbol}] Changes detected:`, change.reasons);
          }
        });
        
        if (needsUpdate.length > 0) {
          console.log(`📊 ${needsUpdate.length} stocks need updates:`, needsUpdate);
          
          // Show notification banner
          setStockUpdates(updateInfo);
          setShowUpdateBanner(true);
          
          // Auto-refresh changed stocks silently in background
          needsUpdate.forEach(symbol => {
            refreshSingleStock(symbol);
          });
        } else {
          console.log('✅ All stocks are up to date');
        }
        
      } catch (error) {
        console.error('❌ Failed to check for changes:', error);
      }
    };
    
    // Check on mount (after 2 seconds to let initial load complete)
    const initialCheckTimer = setTimeout(checkAllStocksForChanges, 2000);
    
    // Check every 6 hours during session
    const interval = setInterval(checkAllStocksForChanges, 6 * 60 * 60 * 1000);
    
    return () => {
      clearTimeout(initialCheckTimer);
      clearInterval(interval);
    };
  }, [symbols]);

  // Refresh single stock with full AI
  const refreshSingleStock = async (symbol: string) => {
    try {
      console.log(`🔄 Refreshing ${symbol} with fresh predictions...`);
      
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${symbol} stock price`,
          model: 'Sonar',
          skipAI: false  // Full refresh with AI
        })
      });
      
      const data = await response.json();
      
      if (data.realtimeData?.type === 'stock') {
        const stock = data.realtimeData;
        const index = stocks.findIndex(s => s.symbol === symbol);
        
        if (index !== -1) {
          setStocks(prev => {
            const newStocks = [...prev];
            newStocks[index] = {
              symbol,
              currentPrice: stock.current.price,
              change: stock.current.change,
              changePercent: stock.current.changePercent,
              prediction1M: stock.oneMonthPrediction?.expectedPrice || 0,
              prediction3M: stock.threeMonthPrediction?.expectedPrice || 0,
              prediction6M: stock.longTermPrediction?.expectedPrice || 0,
              signal: stock.tradingSignal?.signal || 'HOLD',
              rsi: stock.technicalIndicators?.rsi?.value || 50,
              aiConfidence: stock.aiIntelligence?.overallConfidence,
              hybridConfidence: stock.aiIntelligence?.hybridConfidence?.hybridConfidence,
              hybridReliability: stock.aiIntelligence?.hybridConfidence?.reliability,
              longTermConfidence: stock.aiIntelligence?.longTermConfidence?.longTermConfidence,
              longTermRecommendation: stock.aiIntelligence?.longTermConfidence?.recommendation,
              loading: false,
            };
            return newStocks;
          });
          
          console.log(`✅ [${symbol}] Updated with fresh predictions`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to refresh ${symbol}:`, error);
    }
  };

  useEffect(() => {
    if (symbols.length === 0) return;

    // Initialize loading states
    setStocks(
      symbols.map(symbol => ({
        symbol,
        currentPrice: 0,
        change: 0,
        changePercent: 0,
        prediction1M: 0,
        prediction3M: 0,
        prediction6M: 0,
        signal: 'LOADING',
        rsi: 50,
        loading: true,
      }))
    );

    // Fetch data for all stocks
    symbols.forEach(async (symbol, index) => {
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `${symbol} stock price`,
            model: 'Sonar',
            skipAI: true  // 💰 COST OPTIMIZATION: Grid view only needs prices, not expensive AI analysis
          })
        });
        const data = await response.json();

        if (data.realtimeData?.type === 'stock') {
          const stock = data.realtimeData;
          setStocks(prev => {
            const newStocks = [...prev];
            newStocks[index] = {
              symbol,
              currentPrice: stock.current.price,
              change: stock.current.change,
              changePercent: stock.current.changePercent,
              prediction1M: stock.oneMonthPrediction?.expectedPrice || 0,
              prediction3M: stock.threeMonthPrediction?.expectedPrice || 0,
              prediction6M: stock.longTermPrediction?.expectedPrice || 0,
              signal: stock.tradingSignal?.signal || 'HOLD',
              rsi: stock.technicalIndicators?.rsi?.value || 50,
              aiConfidence: stock.aiIntelligence?.overallConfidence,
              hybridConfidence: stock.aiIntelligence?.hybridConfidence?.hybridConfidence,
              hybridReliability: stock.aiIntelligence?.hybridConfidence?.reliability,
              longTermConfidence: stock.aiIntelligence?.longTermConfidence?.longTermConfidence,
              longTermRecommendation: stock.aiIntelligence?.longTermConfidence?.recommendation,
              loading: false,
            };
            return newStocks;
          });
        }
      } catch (error) {
        setStocks(prev => {
          const newStocks = [...prev];
          newStocks[index] = {
            ...newStocks[index],
            loading: false,
            error: 'Failed to load',
          };
          return newStocks;
        });
      }
    });
  }, [symbols]);

  const sortedStocks = [...stocks].sort((a, b) => {
    if (sortBy === 'change') return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    if (sortBy === 'prediction') {
      const aGain = ((a.prediction3M - a.currentPrice) / a.currentPrice) * 100;
      const bGain = ((b.prediction3M - b.currentPrice) / b.currentPrice) * 100;
      return bGain - aGain;
    }
    // Sort by signal strength
    const signalOrder = { STRONG_BUY: 5, BUY: 4, HOLD: 3, SELL: 2, STRONG_SELL: 1 };
    return (signalOrder[b.signal as keyof typeof signalOrder] || 3) - (signalOrder[a.signal as keyof typeof signalOrder] || 3);
  });

  const getSignalColor = (signal: string) => {
    if (signal.includes('BUY')) return 'text-green-400 bg-green-500/20 border-green-500';
    if (signal.includes('SELL')) return 'text-red-400 bg-red-500/20 border-red-500';
    return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
  };

  const handleRowClick = (symbol: string) => {
    onSelectStock(symbol);
    onSwitchToDetailed();
  };

  return (
    <div className="space-y-4">
      {/* Update Notification Banner */}
      {showUpdateBanner && Object.keys(stockUpdates).length > 0 && (
        <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 backdrop-blur-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-blue-400 font-semibold mb-2">
                <span className="text-xl">📊</span>
                <span>{Object.keys(stockUpdates).length} stock{Object.keys(stockUpdates).length !== 1 ? 's have' : ' has'} new predictions available</span>
              </div>
              <div className="space-y-1 text-sm text-blue-300">
                {Object.entries(stockUpdates).map(([symbol, reasons]) => (
                  <div key={symbol} className="flex items-start gap-2">
                    <span className="font-semibold">{symbol}:</span>
                    <span>{reasons.join(', ')}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-blue-300/80">
                ✅ Predictions automatically updated in background
              </div>
            </div>
            <button
              onClick={() => setShowUpdateBanner(false)}
              className="text-blue-400 hover:text-blue-300 ml-4 text-xl leading-none"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between bg-black/30 backdrop-blur-lg rounded-lg p-4 border border-white/10">
        <div className="text-white font-medium">
          Comparing {symbols.length} stock{symbols.length !== 1 ? 's' : ''}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSortBy('change')}
            className={`px-3 py-1 rounded text-sm font-medium transition-all ${
              sortBy === 'change'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            Sort by Change
          </button>
          <button
            onClick={() => setSortBy('prediction')}
            className={`px-3 py-1 rounded text-sm font-medium transition-all ${
              sortBy === 'prediction'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            Sort by Potential
          </button>
          <button
            onClick={() => setSortBy('signal')}
            className={`px-3 py-1 rounded text-sm font-medium transition-all ${
              sortBy === 'signal'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            Sort by Signal
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedStocks.map((stock) => {
          const gain1M = stock.currentPrice > 0 ? ((stock.prediction1M - stock.currentPrice) / stock.currentPrice) * 100 : 0;
          const gain3M = stock.currentPrice > 0 ? ((stock.prediction3M - stock.currentPrice) / stock.currentPrice) * 100 : 0;
          const gain6M = stock.currentPrice > 0 ? ((stock.prediction6M - stock.currentPrice) / stock.currentPrice) * 100 : 0;

          return (
            <div
              key={stock.symbol}
              onClick={() => !stock.loading && !stock.error && handleRowClick(stock.symbol)}
              className="bg-gradient-to-br from-black/40 to-black/20 backdrop-blur-lg rounded-lg p-5 border border-white/10 hover:border-blue-500/50 transition-all cursor-pointer hover:shadow-xl hover:scale-105"
            >
              {stock.loading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : stock.error ? (
                <div className="flex items-center justify-center h-48 text-red-400">
                  {stock.error}
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {stock.symbol.replace('.NS', '').replace('.BO', '')}
                      </h3>
                      <div className="text-2xl font-bold text-white mt-1">
                        ₹{stock.currentPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className={`text-right ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      <div className="text-sm font-medium">
                        {stock.changePercent >= 0 ? '↑' : '↓'} {Math.abs(stock.changePercent).toFixed(2)}%
                      </div>
                      <div className="text-xs">
                        {stock.change >= 0 ? '+' : ''}₹{stock.change.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Signal Badge */}
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold border mb-4 ${getSignalColor(stock.signal)}`}>
                    {stock.signal}
                  </div>

                  {/* Predictions */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">1M Target:</span>
                      <span className={`font-bold ${gain1M >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ₹{stock.prediction1M.toFixed(2)} ({gain1M >= 0 ? '+' : ''}{gain1M.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">3M Target:</span>
                      <span className={`font-bold ${gain3M >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ₹{stock.prediction3M.toFixed(2)} ({gain3M >= 0 ? '+' : ''}{gain3M.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">6M Target:</span>
                      <span className={`font-bold ${gain6M >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ₹{stock.prediction6M.toFixed(2)} ({gain6M >= 0 ? '+' : ''}{gain6M.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  {/* Technical Indicators */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10">
                    <div>
                      <div className="text-xs text-gray-400">RSI</div>
                      <div className={`font-bold text-sm ${
                        stock.rsi > 70 ? 'text-red-400' : stock.rsi < 30 ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {stock.rsi.toFixed(0)}
                      </div>
                    </div>
                    {stock.hybridConfidence !== undefined ? (
                      <div className="col-span-2">
                        <div className="text-xs text-gray-400">Hybrid Confidence</div>
                        <div className="flex items-center gap-1">
                          <div className={`font-bold text-sm ${
                            stock.hybridConfidence > 70 ? 'text-green-400' :
                            stock.hybridConfidence > 50 ? 'text-blue-400' :
                            stock.hybridConfidence > 30 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {stock.hybridConfidence}%
                          </div>
                          <div className={`text-xs px-1 rounded ${
                            stock.hybridReliability === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                            stock.hybridReliability === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {stock.hybridReliability}
                          </div>
                        </div>
                      </div>
                    ) : stock.aiConfidence !== undefined ? (
                      <div className="col-span-2">
                        <div className="text-xs text-gray-400">AI Confidence</div>
                        <div className="font-bold text-sm text-blue-400">
                          {stock.aiConfidence}%
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {symbols.length === 0 && (
        <div className="flex items-center justify-center h-64 bg-black/30 rounded-lg border border-white/10">
          <div className="text-center text-gray-400">
            <div className="text-4xl mb-2">📊</div>
            <p>Add stocks to your watchlist to compare</p>
          </div>
        </div>
      )}
    </div>
  );
}
