'use client';

import { useState, useEffect } from 'react';
import StockCard from './StockCard';

interface StockCardWrapperProps {
  query: string;
  onAlert?: (alert: any) => void;
}

export default function StockCardWrapper({ query, onAlert }: StockCardWrapperProps) {
  const [data, setData] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Trigger manual refresh
  const [loadingPercentage, setLoadingPercentage] = useState(0);
  const [loadingStage, setLoadingStage] = useState('Initializing...');
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let isInitialLoad = true;

    const fetchStockData = async (isAutoRefresh: boolean = false) => {
      try {
        setLoading(true);
        setError(null);
        
        // Initialize loading stages
        if (!isAutoRefresh) {
          setIsInitialLoading(true);
          setLoadingPercentage(10);
          setLoadingStage('Initializing...');
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // 💰 COST OPTIMIZATION: Skip expensive AI calls on auto-refresh
        // Only fetch AI analysis on initial load or manual refresh
        const skipAI = isAutoRefresh;
        
        console.log(`🔄 ${isAutoRefresh ? 'Auto-refresh' : 'Initial load'} - skipAI=${skipAI}`);
        
        // Stage 1: Starting API call
        if (!isAutoRefresh) {
          setLoadingPercentage(20);
          setLoadingStage('Connecting to API...');
        }
        
        const startTime = Date.now();
        
        // Create a progress simulator that runs during the API call
        let progressInterval: NodeJS.Timeout | null = null;
        if (!isAutoRefresh) {
          let currentProgress = 20;
          progressInterval = setInterval(() => {
            if (currentProgress < 75) {
              currentProgress += 2;
              setLoadingPercentage(currentProgress);
              
              // Update stage based on progress
              if (currentProgress >= 20 && currentProgress < 40) {
                setLoadingStage('Fetching stock data...');
              } else if (currentProgress >= 40 && currentProgress < 60) {
                setLoadingStage('Analyzing fundamentals...');
              } else if (currentProgress >= 60 && currentProgress < 75) {
                setLoadingStage('Processing AI predictions...');
              }
            }
          }, 400); // Update every 400ms to show smooth progress
        }
        
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `${query} stock price`,
            model: 'Sonar',
            skipAI: skipAI  // Skip AI on auto-refresh to save costs
          })
        });
        
        // Clear progress simulator once API responds
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        
        // API responded - jump to 80%
        if (!isAutoRefresh) {
          setLoadingPercentage(80);
          setLoadingStage('Loading price data...');
          console.log(`⏱️ API Response Time: ${Date.now() - startTime}ms`);
        }
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log('API Response:', result); // Debug log
        console.log(`⏱️ Total Time: ${Date.now() - startTime}ms`);
        
        // Stage 4: Processing data
        if (!isAutoRefresh) {
          setLoadingPercentage(90);
          setLoadingStage('Preparing dashboard...');
        }

        if (mounted) {
          // Check multiple possible response structures
          if (result?.type === 'stock') {
            setData(result);
          } else if (result.result?.type === 'stock') {
            setData(result.result);
          } else if (result.realtimeData?.type === 'stock') {
            // This is the correct path from the API
            setData(result.realtimeData);
          } else if (result.stocks && result.stocks.length > 0) {
            setData(result.stocks[0]);
          } else {
            console.error('Unexpected response structure:', result);
            setError(`Unable to load stock data for ${query}. Please try searching from the main page first.`);
          }
          
          // Stage 5: Finalizing - only after data is successfully set
          if (!isAutoRefresh && result) {
            setLoadingPercentage(95);
            setLoadingStage('Finalizing...');
            
            // Small delay to show completion
            await new Promise(resolve => setTimeout(resolve, 200));
            setLoadingPercentage(100);
            setLoadingStage('Complete!');
            
            // Hide loading overlay
            await new Promise(resolve => setTimeout(resolve, 300));
            setIsInitialLoading(false);
          }
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to fetch stock data');
          console.error('Error fetching stock:', err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Initial load or manual refresh - fetch full data including AI
    fetchStockData(false); // skipAI = false (full fetch including AI)

    // Auto-refresh every 15 minutes (price updates only, skip AI)
   
  }, [query, refreshTrigger]);

  if (loading && isInitialLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
        <div className="relative w-full max-w-md mx-4">
          {/* Animated Background Orbs */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>

          {/* Loading Card */}
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 border border-cyan-500/20 shadow-2xl">
            {/* Animated Stock Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="text-6xl animate-bounce">📈</div>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 blur-xl opacity-50 animate-pulse"></div>
              </div>
            </div>

            {/* Company Info */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                {query.toUpperCase()}
              </h2>
              <p className="text-gray-400 text-sm">Loading stock analysis...</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-300">{loadingStage}</span>
                <span className="text-sm font-bold text-cyan-400">{loadingPercentage}%</span>
              </div>
              <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                  style={{ width: `${loadingPercentage}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                </div>
              </div>
            </div>

            {/* Loading Stages */}
            <div className="space-y-3">
              {[
                { stage: 'Initializing', percent: 20 },
                { stage: 'Fetching Data', percent: 40 },
                { stage: 'Analyzing', percent: 60 },
                { stage: 'Loading Price', percent: 80 },
                { stage: 'Complete', percent: 100 }
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    loadingPercentage >= item.percent 
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500' 
                      : 'bg-slate-700/50'
                  } transition-all duration-300`}>
                    {loadingPercentage >= item.percent ? (
                      <span className="text-white text-xs">✓</span>
                    ) : (
                      <span className="text-gray-500 text-xs">{index + 1}</span>
                    )}
                  </div>
                  <span className={`text-sm ${
                    loadingPercentage >= item.percent 
                      ? 'text-cyan-400 font-medium' 
                      : 'text-gray-500'
                  } transition-all duration-300`}>
                    {item.stage}
                  </span>
                </div>
              ))}
            </div>

            {/* Loading Tip */}
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <p className="text-xs text-center text-gray-400">
                💡 <span className="text-cyan-400">Tip:</span> Live prices update automatically every 3 seconds
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-8 max-w-md">
          <div className="text-red-400 text-lg font-medium mb-2">⚠️ Error</div>
          <div className="text-gray-300">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      {/* Long-Term Investment Analysis */}
      

      <StockCard data={data} />
    </div>
  );
}
