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

  useEffect(() => {
    let mounted = true;
    let isInitialLoad = true;

    const fetchStockData = async (isAutoRefresh: boolean = false) => {
      try {
        setLoading(true);
        setError(null);
        
        // 💰 COST OPTIMIZATION: Skip expensive AI calls on auto-refresh
        // Only fetch AI analysis on initial load or manual refresh
        const skipAI = isAutoRefresh;
        
        console.log(`🔄 ${isAutoRefresh ? 'Auto-refresh' : 'Initial load'} - skipAI=${skipAI}`);
        
        // Make a POST request instead of GET to match the API route
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
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log('API Response:', result); // Debug log

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <div className="text-white text-lg font-medium">Loading stock data...</div>
          <div className="text-gray-400 text-sm mt-2">Fetching AI predictions and technical analysis</div>
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
      {/* Refresh AI Analysis Button (always visible) */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setRefreshTrigger(prev => prev + 1)} // Trigger manual refresh with AI
          className="px-4 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg"
          title="Refresh AI analysis and predictions (includes fresh Perplexity API call)"
          disabled={loading}
        >
          <span>🤖</span>
          <span className="font-medium">
            {loading ? 'Refreshing...' : 'Refresh AI Analysis'}
          </span>
          <span className="text-xs opacity-75">(~$0.005)</span>
        </button>
      </div>
      
      {/* Warning: AI Data Not Available */}
      {!data.aiIntelligence && !loading && (
        <div className="mb-6 bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-4 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="text-yellow-400 font-semibold">AI Analysis Not Available</div>
              <div className="text-gray-400 text-sm mt-1">
                Auto-refresh only updates prices to save costs. Click "Refresh AI Analysis" above for fresh AI predictions.
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* AI Intelligence Banner */}
      {data.aiIntelligence && (
        <div className="mb-6 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg p-5 backdrop-blur-lg">
          <div className="flex items-start gap-4">
            <div className="text-3xl">🤖</div>
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg mb-3">AI Market Intelligence</h3>
              
              {/* Dual Confidence Display: Short-Term + Long-Term */}
              {data.aiIntelligence.hybridConfidence && (
                <div className="mb-4 space-y-3">
                  {/* Long-Term Confidence (PRIMARY - Top) */}
                  {data.aiIntelligence.longTermConfidence && (
                    <div className="p-4 bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg border-2 border-green-500/40">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-green-400 font-bold text-sm">🏔️ LONG-TERM INVESTMENT SCORE</div>
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300">
                              {data.aiIntelligence.longTermConfidence.stability} STABILITY
                            </span>
                            {data.aiIntelligence.longTermConfidence.reliability && (
                              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                                data.aiIntelligence.longTermConfidence.reliability === 'HIGH' ? 'bg-green-500/30 text-green-300 border border-green-500/50' :
                                data.aiIntelligence.longTermConfidence.reliability === 'MEDIUM' ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50' :
                                'bg-red-500/30 text-red-300 border border-red-500/50'
                              }`}>
                                {data.aiIntelligence.longTermConfidence.reliability} CONFIDENCE
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className={`text-4xl font-bold ${
                              data.aiIntelligence.longTermConfidence.longTermConfidence > 70 ? 'text-green-400' :
                              data.aiIntelligence.longTermConfidence.longTermConfidence > 55 ? 'text-blue-400' :
                              data.aiIntelligence.longTermConfidence.longTermConfidence > 40 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {data.aiIntelligence.longTermConfidence.longTermConfidence}%
                            </span>
                            <div className="text-xs text-gray-400">
                              <div>Horizon: {data.aiIntelligence.longTermConfidence.investmentHorizon}</div>
                              <div className="text-gray-500">Changes: Monthly</div>
                              {data.aiIntelligence.longTermConfidence.agreementStatus && (
                                <div className={`text-xs mt-1 ${
                                  data.aiIntelligence.longTermConfidence.reliability === 'HIGH' ? 'text-green-400' :
                                  data.aiIntelligence.longTermConfidence.reliability === 'MEDIUM' ? 'text-yellow-400' :
                                  'text-red-400'
                                }`}>
                                  {data.aiIntelligence.longTermConfidence.agreementStatus}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`text-right px-4 py-3 rounded-lg border-2 ${
                          data.aiIntelligence.longTermConfidence.recommendation === 'STRONG_BUY' ? 'bg-green-600/30 border-green-500' :
                          data.aiIntelligence.longTermConfidence.recommendation === 'BUY' ? 'bg-green-600/20 border-green-500/50' :
                          data.aiIntelligence.longTermConfidence.recommendation === 'ACCUMULATE' ? 'bg-blue-600/20 border-blue-500/50' :
                          data.aiIntelligence.longTermConfidence.recommendation === 'HOLD' ? 'bg-yellow-600/20 border-yellow-500/50' :
                          data.aiIntelligence.longTermConfidence.recommendation === 'REDUCE' ? 'bg-orange-600/20 border-orange-500/50' :
                          'bg-red-600/30 border-red-500'
                        }`}>
                          <div className="text-xs text-gray-400">Long-Term Action</div>
                          <div className="text-lg font-bold text-white mt-1">
                            {data.aiIntelligence.longTermConfidence.recommendation.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-300 italic border-t border-white/10 pt-2">
                        💡 {data.aiIntelligence.longTermConfidence.description}
                      </div>
                      
                      {/* Entry Strategy - NEW FEATURE */}
                      {data.aiIntelligence.longTermConfidence.entryStrategy && (
                        <div className="mt-3 space-y-3">
                          {/* ACTION PLAN - Most Important Section */}
                          <div className="p-4 bg-gradient-to-r from-green-900/40 to-blue-900/40 rounded-lg border-2 border-green-500/50">
                            <div className="text-sm font-bold text-green-300 mb-3 flex items-center gap-2">
                              📋 YOUR ACTION PLAN
                              <span className="text-xs text-gray-400 font-normal">(Clear buy/stop points)</span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* BUY Points */}
                              <div className="bg-black/40 rounded-lg p-3 border border-green-500/30">
                                <div className="text-xs font-bold text-green-400 mb-2 flex items-center gap-1">
                                  🎯 WHEN TO BUY:
                                </div>
                                <div className="space-y-2 text-xs">
                                  <div className="flex items-start gap-2">
                                    <span className="text-green-400 font-bold min-w-[60px]">BEST:</span>
                                    <div>
                                      <div className="text-white font-bold">
                                        {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.entryZones.ideal.price}
                                      </div>
                                      <div className="text-gray-400 text-xs">{data.aiIntelligence.longTermConfidence.entryStrategy.entryZones.ideal.description}</div>
                                      {data.aiIntelligence.longTermConfidence.entryStrategy.entryZones.ideal.basis && (
                                        <div className="text-purple-300 text-xs italic">
                                          📍 Based on: {data.aiIntelligence.longTermConfidence.entryStrategy.entryZones.ideal.basis}
                                        </div>
                                      )}
                                      <div className="text-green-300 text-xs">
                                        ⚡ Set limit order & be patient
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="border-t border-white/10 pt-2 flex items-start gap-2">
                                    <span className="text-blue-400 font-bold min-w-[60px]">GOOD:</span>
                                    <div>
                                      <div className="text-white font-bold">
                                        {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.entryZones.good.price}
                                      </div>
                                      <div className="text-gray-400 text-xs">Fair price at pivot point</div>
                                      <div className="text-blue-300 text-xs">
                                        ⚡ Acceptable entry for long-term
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="border-t border-white/10 pt-2 flex items-start gap-2">
                                    <span className="text-yellow-400 font-bold min-w-[60px]">NOW:</span>
                                    <div>
                                      <div className="text-white font-bold">
                                        {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.currentPrice}
                                      </div>
                                      <div className="text-gray-400 text-xs">Current market price</div>
                                      <div className={`text-xs ${
                                        data.aiIntelligence.longTermConfidence.entryStrategy.entryTiming.quality === 'EXCELLENT' ? 'text-green-300' :
                                        data.aiIntelligence.longTermConfidence.entryStrategy.entryTiming.quality === 'GOOD' ? 'text-blue-300' :
                                        data.aiIntelligence.longTermConfidence.entryStrategy.entryTiming.quality === 'FAIR' ? 'text-yellow-300' :
                                        'text-red-300'
                                      }`}>
                                        ⚡ {data.aiIntelligence.longTermConfidence.entryStrategy.entryTiming.current}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="border-t border-red-500/30 pt-2 flex items-start gap-2">
                                    <span className="text-red-400 font-bold min-w-[60px]">AVOID:</span>
                                    <div>
                                      <div className="text-white font-bold line-through">
                                        {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.entryZones.avoid.price}
                                      </div>
                                      <div className="text-gray-400 text-xs">Near resistance - overpriced</div>
                                      <div className="text-red-300 text-xs">
                                        ⚠️ DON'T BUY - Wait for pullback
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* STOP LOSS Points */}
                              <div className="bg-black/40 rounded-lg p-3 border border-red-500/30">
                                <div className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1">
                                  🛡️ WHERE TO SET STOP LOSS:
                                </div>
                                <div className="space-y-3">
                                  <div className="bg-red-500/10 rounded p-2 border border-red-500/30">
                                    <div className="text-xs text-gray-400 mb-1">Stop Loss Price:</div>
                                    <div className="text-red-400 font-bold text-2xl">
                                      {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.stopLoss}
                                    </div>
                                    <div className="text-red-300 text-xs mt-1">
                                      {data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.stopLossPercent} from current price
                                    </div>
                                  </div>
                                  
                                  <div className="text-xs space-y-1 text-gray-300">
                                    <div className="flex items-center gap-2">
                                      <span className="text-yellow-400">⚠️</span>
                                      <span>If price breaks below this level = EXIT immediately</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-green-400">✅</span>
                                      <span>Risk/Reward Ratio: <strong className="text-white">1:{data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.riskRewardRatio}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-blue-400">🎯</span>
                                      <span>Risk Level: <strong className="text-white">{data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.riskLevel}</strong></span>
                                    </div>
                                  </div>
                                  
                                  <div className="bg-yellow-500/10 rounded p-2 border border-yellow-500/30 mt-2">
                                    <div className="text-xs font-bold text-yellow-400 mb-1">💰 Position Size:</div>
                                    <div className="text-yellow-300 text-xs">
                                      {data.aiIntelligence.longTermConfidence.entryStrategy.positionSizing.recommended}
                                    </div>
                                    <div className="text-gray-400 text-xs mt-1">
                                      {data.aiIntelligence.longTermConfidence.entryStrategy.positionSizing.reasoning}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Detailed Price Targets */}
                          <div className="p-3 bg-gradient-to-r from-blue-900/20 to-green-900/20 rounded border border-blue-500/30">
                            <div className="text-xs font-bold text-blue-300 mb-2">🎯 Price Targets (6-12 Months):</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <div className="text-xs font-bold text-gray-300 mb-1">🎯 Price Targets:</div>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between bg-green-500/10 p-1 rounded">
                                  <span className="text-gray-400">Short-term (1-3M):</span>
                                  <span className="text-green-400 font-bold">
                                    {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.targets.shortTerm.price} 
                                    ({data.aiIntelligence.longTermConfidence.entryStrategy.targets.shortTerm.upside})
                                  </span>
                                </div>
                                <div className="flex justify-between bg-blue-500/10 p-1 rounded">
                                  <span className="text-gray-400">Medium-term (3-6M):</span>
                                  <span className="text-blue-400 font-bold">
                                    {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.targets.mediumTerm.price}
                                    ({data.aiIntelligence.longTermConfidence.entryStrategy.targets.mediumTerm.upside})
                                  </span>
                                </div>
                                <div className="flex justify-between bg-purple-500/10 p-1 rounded">
                                  <span className="text-gray-400">Long-term (6-12M):</span>
                                  <span className="text-purple-400 font-bold">
                                    {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.targets.longTerm.price}
                                    ({data.aiIntelligence.longTermConfidence.entryStrategy.targets.longTerm.upside})
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div>
                              <div className="text-xs font-bold text-gray-300 mb-1">🛡️ Risk Management:</div>
                              <div className="bg-red-500/10 rounded p-2 border border-red-500/30">
                                <div className="flex justify-between mb-1">
                                  <span className="text-gray-400 text-xs">Stop Loss:</span>
                                  <span className="text-red-400 font-bold text-sm">
                                    {data.aiIntelligence.longTermConfidence.entryStrategy.currency} {data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.stopLoss}
                                  </span>
                                </div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-gray-400 text-xs">Max Loss:</span>
                                  <span className="text-red-400 text-sm">
                                    {data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.stopLossPercent}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-400 text-xs">Risk/Reward:</span>
                                  <span className={`text-sm font-bold ${
                                    parseFloat(data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.riskRewardRatio) > 2 ? 'text-green-400' :
                                    parseFloat(data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.riskRewardRatio) > 1 ? 'text-yellow-400' :
                                    'text-red-400'
                                  }`}>
                                    1:{data.aiIntelligence.longTermConfidence.entryStrategy.riskManagement.riskRewardRatio}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Long-Term Breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                        <div className="bg-green-500/10 rounded p-2 border border-green-500/20">
                          <div className="text-gray-400">Fundamentals</div>
                          <div className="text-green-400 font-bold text-base">
                            {data.aiIntelligence.longTermConfidence.breakdown.fundamentalQuality?.score || 0}
                          </div>
                          <div className="text-gray-500">{data.aiIntelligence.longTermConfidence.breakdown.fundamentalQuality?.weight || '50%'} weight</div>
                        </div>
                        <div className="bg-blue-500/10 rounded p-2 border border-blue-500/20">
                          <div className="text-gray-400">Annual Report</div>
                          <div className="text-blue-400 font-bold text-base">
                            {data.aiIntelligence.longTermConfidence.breakdown.annualReportQuality?.score || 0}
                          </div>
                          <div className="text-gray-500">{data.aiIntelligence.longTermConfidence.breakdown.annualReportQuality?.weight || '15%'} weight</div>
                        </div>
                        <div className="bg-purple-500/10 rounded p-2 border border-purple-500/20">
                          <div className="text-gray-400">Quarterly Report</div>
                          <div className="text-purple-400 font-bold text-base">
                            {data.aiIntelligence.longTermConfidence.breakdown.quarterlyReportQuality?.score || 0}
                          </div>
                          <div className="text-gray-500">{data.aiIntelligence.longTermConfidence.breakdown.quarterlyReportQuality?.weight || '25%'} weight</div>
                        </div>
                        <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
                          <div className="text-gray-400">AI + Analyst</div>
                          <div className="text-orange-400 font-bold text-base">
                            {(data.aiIntelligence.longTermConfidence.breakdown.aiSentiment?.score || 0) + (data.aiIntelligence.longTermConfidence.breakdown.analystView?.score || 0)}
                          </div>
                          <div className="text-gray-500">10% weight</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Short-Term Hybrid Confidence (SECONDARY - Bottom) */}
                  <div className="p-3 bg-black/30 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-gray-400 text-xs">⚡ Short-Term Trading Score</div>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            data.aiIntelligence.hybridConfidence.reliability === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                            data.aiIntelligence.hybridConfidence.reliability === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {data.aiIntelligence.hybridConfidence.reliability}
                          </span>
                          <span className="text-gray-500 text-xs">Changes: Daily</span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className={`text-2xl font-bold ${
                            data.aiIntelligence.hybridConfidence.hybridConfidence > 70 ? 'text-green-400' :
                            data.aiIntelligence.hybridConfidence.hybridConfidence > 50 ? 'text-blue-400' :
                            data.aiIntelligence.hybridConfidence.hybridConfidence > 30 ? 'text-yellow-400' :
                            'text-red-400'
                          }`}>
                            {data.aiIntelligence.hybridConfidence.hybridConfidence}%
                          </span>
                          <span className="text-xs text-gray-400">
                            {data.aiIntelligence.hybridConfidence.agreement}
                          </span>
                        </div>
                      </div>
                      <div className={`text-right px-4 py-2 rounded-lg ${
                      data.aiIntelligence.hybridConfidence.recommendation === 'STRONG_BUY' ? 'bg-green-600/30 border border-green-500' :
                      data.aiIntelligence.hybridConfidence.recommendation === 'BUY' ? 'bg-green-600/20 border border-green-500/50' :
                      data.aiIntelligence.hybridConfidence.recommendation === 'HOLD' ? 'bg-yellow-600/20 border border-yellow-500/50' :
                      data.aiIntelligence.hybridConfidence.recommendation === 'SELL' ? 'bg-red-600/20 border border-red-500/50' :
                      'bg-red-600/30 border border-red-500'
                    }`}>
                      <div className="text-xs text-gray-400">Hybrid Action</div>
                      <div className="text-sm font-bold text-white mt-1">
                        {data.aiIntelligence.hybridConfidence.recommendation.replace('_', ' ')}
                      </div>
                      {data.aiIntelligence.hybridConfidence.aiRecommendation && 
                       data.aiIntelligence.hybridConfidence.aiRecommendation !== data.aiIntelligence.hybridConfidence.recommendation && (
                        <div className="text-xs text-orange-400 mt-1">
                          ⚠️ AI: {data.aiIntelligence.hybridConfidence.aiRecommendation}
                        </div>
                      )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Actionable Insights */}
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <div className="text-xs font-bold text-blue-400 mb-2">💡 What This Means:</div>
                    {(() => {
                      const confidence = data.aiIntelligence.hybridConfidence.hybridConfidence;
                      const recommendation = data.aiIntelligence.hybridConfidence.recommendation;
                      const aiRecommendation = data.aiIntelligence.hybridConfidence.aiRecommendation;
                      const hasConflict = aiRecommendation && aiRecommendation !== recommendation;
                      
                      // High confidence scenarios
                      if (confidence > 70) {
                        // Check for conflict first
                        if (hasConflict) {
                          return (
                            <div className="text-xs text-gray-300">
                              <strong className="text-yellow-400">⚠️ Mixed Signals (High Confidence):</strong> Score is {confidence}% but{' '}
                              {recommendation === 'BUY' && (aiRecommendation === 'HOLD' || aiRecommendation === 'SELL') ? (
                                <>technicals are very strong while AI shows caution due to news concerns. <span className="text-orange-300">Trade with reduced position size and tight stop loss.</span></>
                              ) : recommendation === 'HOLD' && (aiRecommendation === 'BUY' || aiRecommendation === 'STRONG_BUY') ? (
                                <>AI is bullish but technicals show weakness. <span className="text-blue-300">Wait for technical confirmation before entry.</span></>
                              ) : (
                                <>signals are mixed between technical and fundamental factors. <span className="text-yellow-300">Proceed cautiously.</span></>
                              )}
                            </div>
                          );
                        }
                        
                        // No conflict - strong opportunity
                        return (
                          <div className="text-xs text-gray-300">
                            <strong className="text-green-400">Strong Opportunity:</strong> All factors align - AI sentiment, technicals, and fundamentals support this move. {recommendation === 'STRONG_BUY' ? 'Consider entering position.' : recommendation === 'BUY' ? 'Good entry point.' : 'Position looks solid.'}
                          </div>
                        );
                      }
                      
                      // Medium confidence (50-70%)
                      return null; // Will continue to existing logic
                    })() || (data.aiIntelligence.hybridConfidence.hybridConfidence > 50 ? (
                      <div className="text-xs text-gray-300">
                        {(() => {
                          // Check for specific risky scenarios
                          const technicalDetails = data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details;
                          const isNearSupport = technicalDetails?.supportResistance?.status?.includes('Support');
                          const isBelowMAs = technicalDetails?.movingAverages?.status?.includes('Below');
                          const isStrongBullish = technicalDetails?.macd?.status?.includes('Strong Bullish');
                          const weakFundamentals = data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.raw < 50;
                          const recommendation = data.aiIntelligence.hybridConfidence.recommendation;
                          const aiRecommendation = data.aiIntelligence.hybridConfidence.aiRecommendation;
                          const hasConflict = aiRecommendation && aiRecommendation !== recommendation;
                          const technicalRaw = data.aiIntelligence.hybridConfidence.breakdown.technicalScore.raw;
                          const aiRaw = data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.raw;
                          
                          // AI-Technical Conflict
                          if (hasConflict && technicalRaw > 80 && aiRaw < 70) {
                            return (
                              <>
                                <strong className="text-orange-400">⚠️ Signal Conflict:</strong> Technicals very bullish ({technicalRaw}%) but AI sentiment cautious ({aiRaw}%). 
                                <span className="text-yellow-300"> News shows bearish catalysts. Action downgraded from {aiRecommendation} to {recommendation}.</span>
                                <span className="text-gray-400"> Consider: Strong chart setup vs negative news - wait for news clarity or use tight stop loss.</span>
                              </>
                            );
                          }
                          
                          if (hasConflict && aiRaw > 80 && technicalRaw < 70) {
                            return (
                              <>
                                <strong className="text-orange-400">⚠️ Signal Conflict:</strong> AI very bullish ({aiRaw}%) but technicals weak ({technicalRaw}%). 
                                <span className="text-yellow-300"> Positive news but chart shows resistance.</span>
                                <span className="text-gray-400"> Consider: Wait for technical confirmation before entry.</span>
                              </>
                            );
                          }
                          
                          // Risky Buy Scenario: Near support in downtrend
                          if ((recommendation === 'BUY' || recommendation === 'STRONG_BUY') && isNearSupport && isBelowMAs) {
                            return (
                              <>
                                <strong className="text-yellow-400">⚠️ Risky Buy Setup:</strong> Price at support in downtrend. 
                                <span className="text-yellow-300"> BUY only if price bounces above moving averages.</span> Use tight stop loss below support. 
                                {weakFundamentals && <span className="text-orange-300"> Fundamentals weak - take 50% position size.</span>}
                              </>
                            );
                          }
                          
                          // Reversal Play: Oversold with bullish MACD
                          if (technicalDetails?.rsi?.status?.includes('Oversold') && isStrongBullish) {
                            return (
                              <>
                                <strong className="text-blue-400">🔄 Reversal Setup:</strong> RSI oversold with bullish MACD crossover. 
                                <span className="text-green-300"> Good risk/reward ratio. Enter with stop below recent low.</span>
                                {weakFundamentals && <span className="text-orange-300"> Watch fundamentals - may limit upside.</span>}
                              </>
                            );
                          }
                          
                          // Weak Technicals
                          if (data.aiIntelligence.hybridConfidence.breakdown.technicalScore.raw < 50) {
                            return '⚠️ Technical indicators show weakness. Check support/resistance levels before entry.';
                          }
                          
                          // Weak Fundamentals
                          if (weakFundamentals) {
                            return '⚠️ Fundamentals need improvement. Monitor P/E ratio and debt levels. Consider shorter timeframe trades.';
                          }
                          
                          // AI vs Technical Disagreement
                          if (data.aiIntelligence.hybridConfidence.agreement.includes('Disagreement')) {
                            return '⚠️ AI optimistic but technicals disagree. Wait for technical confirmation before entry.';
                          }
                          
                          // Default moderate message
                          return 'Mixed signals detected. Consider smaller position size or wait for clarity.';
                        })()}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-300">
                        <strong className="text-red-400">High Risk:</strong> {
                          data.aiIntelligence.hybridConfidence.breakdown.technicalScore.raw < 40 ?
                            '🚨 Technical indicators are bearish. Price may decline further. Avoid long positions.' :
                          data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.raw < 40 ?
                            '🚨 Negative news sentiment. Market conditions unfavorable. Stay on sidelines.' :
                          data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.raw < 30 ?
                            '🚨 Weak fundamentals - high debt or poor margins detected. Avoid or short.' :
                            '🚨 Multiple risk factors present. Avoid entry or reduce existing exposure.'
                        }
                      </div>
                    ))}
                  </div>
                  
                  {/* Detailed Breakdown with Explanations */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                    <div className="bg-purple-500/10 rounded p-2 border border-purple-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-gray-400">AI Sentiment</div>
                        <div className={`text-xs px-1 rounded ${
                          data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.raw > 70 ? 'bg-green-500/20 text-green-400' :
                          data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.raw > 50 ? 'bg-blue-500/20 text-blue-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.status}
                        </div>
                      </div>
                      <div className="text-purple-400 font-bold text-lg">
                        {data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.score}
                        <span className="text-gray-500 text-xs ml-1">/{Math.round(40 * data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.raw / 100)}</span>
                      </div>
                      <div className="text-gray-500 text-xs">{data.aiIntelligence.hybridConfidence.breakdown.aiConfidence.weight} weight</div>
                    </div>
                    
                    <div className="bg-blue-500/10 rounded p-2 border border-blue-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-gray-400">Technical</div>
                        {Object.keys(data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details).length > 0 && (
                          <div className={`text-xs px-1 rounded ${
                            data.aiIntelligence.hybridConfidence.breakdown.technicalScore.raw > 70 ? 'bg-green-500/20 text-green-400' :
                            data.aiIntelligence.hybridConfidence.breakdown.technicalScore.raw > 50 ? 'bg-blue-500/20 text-blue-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.rsi?.status || 
                             data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.macd?.status?.split(' ')[0] || 'OK'}
                          </div>
                        )}
                      </div>
                      <div className="text-blue-400 font-bold text-lg">
                        {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.score}
                        <span className="text-gray-500 text-xs ml-1">/{Math.round(35 * data.aiIntelligence.hybridConfidence.breakdown.technicalScore.raw / 100)}</span>
                      </div>
                      <div className="text-gray-500 text-xs">{data.aiIntelligence.hybridConfidence.breakdown.technicalScore.weight} weight</div>
                    </div>
                    
                    <div className="bg-green-500/10 rounded p-2 border border-green-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-gray-400">Fundamentals</div>
                        <div className={`text-xs px-1 rounded ${
                          data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.raw > 60 ? 'bg-green-500/20 text-green-400' :
                          data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.raw > 40 ? 'bg-blue-500/20 text-blue-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.raw > 60 ? 'Strong' :
                           data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.raw > 40 ? 'Fair' : 'Weak'}
                        </div>
                      </div>
                      <div className="text-green-400 font-bold text-lg">
                        {data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.score}
                        <span className="text-gray-500 text-xs ml-1">/{Math.round(15 * data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.raw / 100)}</span>
                      </div>
                      <div className="text-gray-500 text-xs">{data.aiIntelligence.hybridConfidence.breakdown.fundamentalScore.weight} weight</div>
                    </div>
                    
                    <div className="bg-orange-500/10 rounded p-2 border border-orange-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-gray-400">Volatility</div>
                        <div className={`text-xs px-1 rounded ${
                          data.aiIntelligence.hybridConfidence.breakdown.volatilityScore.details.status?.includes('Low') ? 'bg-green-500/20 text-green-400' :
                          data.aiIntelligence.hybridConfidence.breakdown.volatilityScore.details.status?.includes('Moderate') ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {data.aiIntelligence.hybridConfidence.breakdown.volatilityScore.details.status?.split(' ')[0] || 'OK'}
                        </div>
                      </div>
                      <div className="text-orange-400 font-bold text-lg">
                        {data.aiIntelligence.hybridConfidence.breakdown.volatilityScore.score}
                        <span className="text-gray-500 text-xs ml-1">/10</span>
                      </div>
                      <div className="text-gray-500 text-xs">{data.aiIntelligence.hybridConfidence.breakdown.volatilityScore.weight} weight</div>
                    </div>
                  </div>
                  
                  {/* Key Technical Details */}
                  {Object.keys(data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details).length > 0 && (
                    <div className="text-xs text-gray-400 space-y-1 p-2 bg-black/20 rounded">
                      <div className="font-bold text-gray-300 mb-1">📊 Technical Details:</div>
                      {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.rsi && (
                        <div>• RSI: {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.rsi.status} ({data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.rsi.value?.toFixed(0)})</div>
                      )}
                      {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.macd && (
                        <div>• MACD: {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.macd.status}</div>
                      )}
                      {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.movingAverages && (
                        <div>• Moving Averages: {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.movingAverages.status}</div>
                      )}
                      {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.supportResistance && (
                        <div>• S/R Position: {data.aiIntelligence.hybridConfidence.breakdown.technicalScore.details.supportResistance.status}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-400">AI Recommendation</div>
                  <div className={`font-bold mt-1 ${
                    data.aiIntelligence.recommendation?.includes('BUY') ? 'text-green-400' :
                    data.aiIntelligence.recommendation?.includes('SELL') ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {data.aiIntelligence.recommendation || 'ANALYZING...'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">AI Confidence (Raw)</div>
                  <div className="font-bold text-purple-400 mt-1">
                    {data.aiIntelligence.overallConfidence || 50}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Analyst Consensus</div>
                  <div className="font-bold text-blue-400 mt-1">
                    {data.aiIntelligence.analystConsensus || 'N/A'}
                  </div>
                </div>
              </div>
              
              {/* Recent News */}
              {data.aiIntelligence.news && data.aiIntelligence.news.length > 0 && (
                <div className="mt-4">
                  <div className="text-gray-400 text-xs mb-2">📰 Recent News:</div>
                  <div className="space-y-1">
                    {data.aiIntelligence.news.slice(0, 3).map((headline: string, i: number) => (
                      <div key={i} className="text-gray-300 text-xs">• {headline}</div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Upcoming Catalysts */}
              {data.aiIntelligence.catalysts && data.aiIntelligence.catalysts.length > 0 && (
                <div className="mt-3">
                  <div className="text-gray-400 text-xs mb-2">🚀 Upcoming Catalysts:</div>
                  <div className="space-y-1">
                    {data.aiIntelligence.catalysts.slice(0, 2).map((catalyst: string, i: number) => (
                      <div key={i} className="text-blue-300 text-xs">• {catalyst}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-bold rounded-full">
                HYBRID AI+MATH
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Model: {data.metadata?.predictionModel || 'Mathematical'}
              </div>
            </div>
          </div>
        </div>
      )}

      <StockCard data={data} />
    </div>
  );
}
