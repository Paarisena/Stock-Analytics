"use client";
import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign, IndianRupee, Coins, Activity, Radio, Volume2, Clock, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import ComprehensiveReportCard from './ComprehensiveReportCard';
import AnnualReportAccordion from './AnnualReportAccordion';

// Helper function to safely render balance sheet values
const renderValue = (value: any, fallback?: any): string | number => {
  // Try primary value first
  if (value !== null && value !== undefined) {
    if (typeof value === 'object' && 'current' in value) {
      // New structure: {current: x, previous: y}
      if (value.current !== null && value.current !== undefined && value.current !== 0) {
        return value.current;
      }
    } else if (typeof value !== 'object') {
      // Old structure: direct value
      if (value !== 0) return value;
    }
  }
  
  // Try fallback
  if (fallback !== null && fallback !== undefined) {
    if (typeof fallback === 'object' && 'current' in fallback) {
      return fallback.current ?? 'N/A';
    }
    return fallback;
  }
  
  return 'N/A';
};

interface ChartDataPoint {
  time: string;
  current?: number;
  predicted?: number;
  type: 'historical' | 'prediction';
}

interface LongTermChartPoint {
  month: string;
  expected: number;
  conservative: number;
  optimistic: number;
  type: 'current' | 'forecast';
}

interface StockData {
  comprehensiveData: any;
  type: 'stock';
  symbol: string;
  current: {
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    marketState: string;
  };
  shortTermPrediction: {
    price: number;
    change: number;
    changePercent: number;
    timeframe: string;
  };
  oneMonthPrediction: {
    expectedPrice: number;
    conservativePrice: number;
    optimisticPrice: number;
    change: number;
    changePercent: number;
    timeframe: string;
  };
  threeMonthPrediction: {
    expectedPrice: number;
    conservativePrice: number;
    optimisticPrice: number;
    change: number;
    changePercent: number;
    timeframe: string;
  };
  longTermPrediction: {
    expectedPrice: number;
    conservativePrice: number;
    optimisticPrice: number;
    change: number;
    changePercent: number;
    timeframe: string;
    avgDailyReturn: number;
  };
  chartData: ChartDataPoint[];
  longTermChartData: LongTermChartPoint[];
  bulletPoints: string[];
  fundamentals?: {
    peRatio: number | null;
    pegRatio: number | null;
    priceToBook: number | null;
    marketCap: number | null;
    cash: number | null;
    totalDebt: number | null;
    debtToEquity: number | null;
    operatingMargin: number | null;
    profitMargin: number | null;
    roe: number | null;
    roa: number | null;
    roce: number | null;
    capex: number | null;
    freeCashFlow: number | null;
    operatingCashFlow: number | null;
    revenue: number | null;
    revenueGrowth: number | null;
    earningsPerShare: number | null;
    beta: number | null;
    dividendYield: number | null;
    fiscalQuarter: string | null;
    bookValue: number | null;
    faceValue: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    interestCoverage: number | null;
    salesGrowth3Y: number | null;
    salesGrowth5Y: number | null;
    profitGrowth3Y: number | null;
    profitGrowth5Y: number | null;
    roe3Y: number | null;
    roe5Y: number | null;
    debtorDays: number | null;
    cashConversionCycle: number | null;
    workingCapitalDays: number | null;
    promoterHolding: number | null;
    fiiHolding: number | null;
    diiHolding: number | null;
    pledgedPercentage: number | null;
  };
  transcriptAnalysis?: {
    quarter: string;
    year: number;
    date: string;
    sentiment: string;
    analysis: string;
    rawTranscript: string;
    source: string;
    isNewEarnings?: boolean;
  };
  annualReport?: any;
  aiIntelligence?: any;
  supportResistance?: {
    pivot: number;
    resistance1: number;
    resistance2: number;
    resistance3: number;
    support1: number;
    support2: number;
    support3: number;
  };
  tradingSignal?: {
    signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
    strength: number;
    reasons: string[];
    description: string;
  };
  technicalIndicators?: {
    rsi: {
      value: number;
      signal: string;
    };
    macd: any;
    movingAverages: any;
  };
  metadata: {
    exchange: string;
    previousClose: number;
    timestamp: string;
  };
  cacheAge?: number;
  fromCache?: boolean;
}

export default function StockCard({ data }: { data: StockData }) {
  const [activeIndicatorTab, setActiveIndicatorTab] = useState<'RSI' | 'MACD' | 'MA'>('RSI');
  const [livePrice, setLivePrice] = useState(data.current.price);
  const [priceChange, setPriceChange] = useState(0);
  const [isPriceIncreasing, setIsPriceIncreasing] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLive, setIsLive] = useState(true);
  const [volume, setVolume] = useState(0);
  const [dayHigh, setDayHigh] = useState(data.current.price);
  const [dayLow, setDayLow] = useState(data.current.price);
  const [liveChartData, setLiveChartData] = useState(data.chartData);
  
  // Prediction tracking state
  const [currentPrediction, setCurrentPrediction] = useState(data);
  const [previousPrediction, setPreviousPrediction] = useState<StockData | null>(null);
  const [predictionAge, setPredictionAge] = useState(0);
  const [bulletinMessages, setBulletinMessages] = useState<Array<{time: string, message: string, type: string}>>([]);
  const previousPriceRef = useRef(data.current.price);
  
  // Deep analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [showFYAlert, setShowFYAlert] = useState(false);
  const [fyCheckData, setFYCheckData] = useState<any>(null);
  const [deepAnalysisData, setDeepAnalysisData] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  if (!data || !data.current || !data.shortTermPrediction || !data.longTermPrediction || !data.chartData || !data.longTermChartData) {
    return null;
  }
  
  // 💰 LIVE PRICE: Direct Yahoo Finance API (100% FREE, no Perplexity)
  // Uses dedicated /api/live-price endpoint - most efficient approach
  useEffect(() => {
    if (!isLive) return;
    
    const fetchLivePrice = async () => {
      try {
        // Direct Yahoo Finance endpoint - fastest and FREE
        const response = await fetch(`/api/live-price?symbol=${encodeURIComponent(data.symbol)}`);
        const apiData = await response.json();
        
        if (apiData.price) {
          const newPrice = apiData.price;
          
          // Track price direction
          setIsPriceIncreasing(newPrice > previousPriceRef.current);
          setPriceChange(newPrice - data.current.price);
          previousPriceRef.current = livePrice;
          
          setLivePrice(newPrice);
          setLastUpdate(new Date(apiData.timestamp));
          
          // Update day high/low from API
          setDayHigh(apiData.dayHigh || newPrice);
          setDayLow(apiData.dayLow || newPrice);
          
          // Update volume from API
          setVolume(apiData.volume || 0);
          
          console.log(`💰 [Live Price] ${data.symbol}: ${newPrice} (FREE Yahoo direct)`);
        }
      } catch (error) {
        console.error('❌ [Live Price] Failed:', error);
      }
    };
    
    // Fetch immediately
    fetchLivePrice();
    
    // Then fetch every 3 seconds for active traders
    // 100% FREE - direct Yahoo Finance, no MCP wrapper, no Perplexity
    const interval = setInterval(fetchLivePrice, 3000);
    
    return () => clearInterval(interval);
  }, [isLive, data.symbol, data.current.price, livePrice]);

  // 💰 COST OPTIMIZATION: Removed duplicate auto-refresh intervals
  // StockCardWrapper already handles auto-refresh every 15 minutes with skipAI=true
  // Manual "Refresh AI Analysis" button available for on-demand full refresh
  useEffect(() => {
    setCurrentPrediction(data);
    
    // Track prediction age every second
    const ageInterval = setInterval(() => {
      setPredictionAge(prev => prev + 1);
    }, 1000);
    
    return () => {
      clearInterval(ageInterval);
    };
  }, [data, livePrice]);
  
  // Initial volume from data
  useEffect(() => {
    setVolume(Math.floor(Math.random() * 1000000));
    setDayHigh(data.current.price);
    setDayLow(data.current.price);
  }, [data.current.price]);
  const isPositive = data.current.change >= 0;
  const isShortTermPredictionPositive = data.shortTermPrediction.change >= 0;
  const isLongTermPredictionPositive = data.longTermPrediction.change >= 0;
  const currency = data.current.currency;

  // Currency symbols and formatting
  const getCurrencySymbol = (curr: string) => {
    const symbols: Record<string, string> = {
      'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥',
      'INR': '₹', 'KRW': '₩', 'AUD': 'A$', 'CAD': 'C$', 'CHF': 'Fr',
      'HKD': 'HK$', 'SGD': 'S$', 'RUB': '₽', 'BRL': 'R$', 'MXN': 'MX$',
    };
    return symbols[curr.toUpperCase()] || curr;
  };

  const getCurrencyIcon = (curr: string) => {
    switch (curr.toUpperCase()) {
      case 'USD':
      case 'AUD':
      case 'CAD':
      case 'HKD':
      case 'SGD':
        return <DollarSign size={24} className="text-green-400" />;
      case 'INR':
        return <IndianRupee size={24} className="text-green-400" />;
      case 'JPY':
      case 'CNY':
      case 'KRW':
        return <span className="text-2xl font-bold text-green-400">¥</span>;
      case 'EUR':
        return <span className="text-2xl font-bold text-green-400">€</span>;
      case 'GBP':
        return <span className="text-2xl font-bold text-green-400">£</span>;
      default:
        return <Coins size={24} className="text-green-400" />;
    }
  };

  const formatPrice = (price: number | undefined | null, curr: string) => {
    if (price === undefined || price === null || isNaN(price)) {
      return '0.00';
    }
    if (['JPY', 'KRW'].includes(curr.toUpperCase())) {
      return price.toFixed(0);
    }
    return price.toFixed(2);
  };

  const currencySymbol = getCurrencySymbol(currency);

  // Deep Analysis Handler
  const handleDeepAnalyze = async () => {
    try {
      setIsAnalyzing(true);
      setAnalysisProgress('Checking for latest fiscal year data...');
      setElapsedTime(0);
      
      // Start elapsed time counter
      const progressInterval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      
      // Check if newer fiscal year is available
      const fiscalCheckResponse = await fetch(`/api/check-latest-fiscal-year?symbol=${data.symbol}`);
      const fyData = await fiscalCheckResponse.json();
      
      setFYCheckData(fyData);
      clearInterval(progressInterval);
      
      if (fyData.isNewAvailable && fyData.latestFY && fyData.cachedFY) {
        // Show confirmation modal if newer FY is available
        setShowFYAlert(true);
        setIsAnalyzing(false);
        return;
      }
      
      // Proceed with analysis
      await performAnalysis(fyData.latestFY || 'FY2025', progressInterval);
    } catch (error) {
      console.error('Deep analysis error:', error);
      setAnalysisProgress('Analysis failed. Please try again.');
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress('');
      }, 3000);
    }
  };
  
  const performAnalysis = async (fiscalYear: string, progressInterval?: NodeJS.Timeout, forceRefresh: boolean = false) => {
    try {
      setAnalysisProgress(`${forceRefresh ? '🔄 Force refreshing' : 'Analyzing'} ${fiscalYear} annual report... This may take up to 90 seconds.`);
      
      const analysisResponse = await fetch('/api/deep-analyze-annual-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: data.symbol,
          fiscalYear: fiscalYear,
          forceRefresh: forceRefresh
        })
      });
      
      if (!analysisResponse.ok) {
        throw new Error('Analysis request failed');
      }
      
      const analysisData = await analysisResponse.json();
      
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      setDeepAnalysisData(analysisData.data || analysisData);
      setAnalysisProgress('');
      setIsAnalyzing(false);
      setElapsedTime(0);
    } catch (error) {
      console.error('Analysis execution error:', error);
      setAnalysisProgress('Analysis failed. Limited data available.');
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisProgress('');
        setElapsedTime(0);
      }, 3000);
    }
  };

  // Process chart data - use live data
  const chartData = liveChartData.map(point => ({
    time: point.time,
    price: point.current || point.predicted || 0,
    type: point.type,
    current: point.current,
    predicted: point.predicted,
  }));

  const allPrices = chartData.map(d => d.price).filter(p => p > 0);
  
  // Fallback if no valid prices
  const minValue = allPrices.length > 0 ? Math.min(...allPrices) * 0.98 : data.current.price * 0.95;
  const maxValue = allPrices.length > 0 ? Math.max(...allPrices) * 1.02 : data.current.price * 1.05;

  // Parse bullet points to remove markdown
  const parseBulletPoint = (text: string) => {
    return text.replace(/\*\*/g, '').replace(/📍|🔮|📊|💹|⏰|🏢|📅|📈|📉|➡️/g, '').trim();
  };

  return (
    <div className="my-6 p-6 bg-gradient-to-br from-green-900/20 via-emerald-800/10 to-teal-900/20 backdrop-blur-xl rounded-2xl border border-green-500/20 shadow-2xl">
      
      {/* Live Ticker Tape */}
      <div className="mb-4 bg-gradient-to-r from-cyan-900/40 via-blue-900/40 to-cyan-900/40 border border-cyan-500/30 rounded-xl overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${isLive ? 'text-red-500 animate-pulse' : 'text-gray-500'}`} />
            <span className="text-xs font-bold text-cyan-300">LIVE</span>
          </div>
          <div className="flex-1 flex items-center gap-6 overflow-hidden">
            <div className="text-xs text-gray-300 whitespace-nowrap">
              <span className="font-semibold text-cyan-400">Volume:</span> {volume.toLocaleString()} • 
              <span className="font-semibold text-cyan-400 ml-3">Day High:</span> {currencySymbol}{dayHigh.toFixed(2)} • 
              <span className="font-semibold text-cyan-400 ml-3">Day Low:</span> {currencySymbol}{dayLow.toFixed(2)} • 
              <span className="font-semibold text-cyan-400 ml-3">Market:</span> {data.current.marketState === 'REGULAR' ? '🟢 OPEN' : '🔴 CLOSED'}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      {/* Header with Live Price */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-2xl font-bold text-gray-100">{data.symbol}</h3>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${isPriceIncreasing ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {isPriceIncreasing ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span className="text-xs font-semibold">{isPriceIncreasing ? '+' : ''}{((priceChange / previousPriceRef.current) * 100).toFixed(2)}%</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm">{data.metadata.exchange}</p>
        </div>
        <div className="p-3 bg-green-600/20 rounded-xl">
          {getCurrencyIcon(currency)}
        </div>
      </div>

      {/* Live Current Price */}
      <div className="mb-4 relative">
        <div className={`absolute inset-0 ${isPriceIncreasing ? 'bg-green-500/5' : 'bg-red-500/5'} rounded-xl transition-all duration-300`}></div>
        <div className="relative p-4">
          <div className="text-6xl font-bold text-white mb-1 transition-all duration-300">
            {currencySymbol}{livePrice.toFixed(2)}
          </div>
          <div className={`text-lg font-semibold ${isPriceIncreasing ? 'text-green-400' : 'text-red-400'}`}>
            {isPriceIncreasing ? '+' : ''}{currencySymbol}{Math.abs(priceChange).toFixed(4)} {currency}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${data.current.marketState === 'REGULAR' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <div className={`w-2 h-2 rounded-full ${data.current.marketState === 'REGULAR' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              {data.current.marketState === 'REGULAR' ? 'Market Open' : 'Market Closed'}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              <span>Updated {lastUpdate.toLocaleTimeString()}</span>
            </div>
            <button
              onClick={() => setIsLive(!isLive)}
              className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                isLive 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40' 
                  : 'bg-green-500/20 text-green-400 border border-green-500/40'
              }`}
            >
              {isLive ? '⏸' : '▶'}
            </button>
          </div>
        </div>
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* Volume */}
        <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <Volume2 className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-gray-400">Volume</span>
          </div>
          <div className="text-xl font-bold text-white">
            {(volume / 1000).toFixed(1)}K
          </div>
        </div>

        {/* Day High */}
        <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-xs text-gray-400">Day High</span>
          </div>
          <div className="text-xl font-bold text-green-400">
            {currencySymbol}{dayHigh.toFixed(2)}
          </div>
        </div>

        {/* Day Low */}
        <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown className="w-3 h-3 text-red-400" />
            <span className="text-xs text-gray-400">Day Low</span>
          </div>
          <div className="text-xl font-bold text-red-400">
            {currencySymbol}{dayLow.toFixed(2)}
          </div>
        </div>

        {/* Previous Close */}
        <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-gray-400">Prev Close</span>
          </div>
          <div className="text-xl font-bold text-gray-300">
            {currencySymbol}{data.metadata.previousClose.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Price Range Bar */}
      <div className="mb-6 bg-gray-800/40 rounded-xl p-4">
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>Low {currencySymbol}{dayLow.toFixed(2)}</span>
          <span className="font-semibold text-white">Current: {currencySymbol}{livePrice.toFixed(2)}</span>
          <span>High {currencySymbol}{dayHigh.toFixed(2)}</span>
        </div>
        <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="absolute h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full"
            style={{ width: '100%' }}
          ></div>
          <div 
            className="absolute h-4 w-1 bg-white rounded-full -top-1 shadow-lg"
            style={{ 
              left: `${((livePrice - dayLow) / (dayHigh - dayLow)) * 100}%`,
              transition: 'left 0.3s ease'
            }}
          ></div>
        </div>
      </div>

      {/* Price Chart with Prediction */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-400" />
            <h4 className="text-sm font-semibold text-gray-300">Price Movement & Forecast</h4>
            <div className="flex items-center gap-1 ml-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-400">Live</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-blue-500"></div>
              <span className="text-gray-400">Historical</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-purple-500 opacity-60"></div>
              <span className="text-gray-400">Predicted</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              <span className="text-gray-400">Current Price</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-800/40 rounded-xl p-4 border border-blue-500/20 relative">
          {liveChartData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800/60 backdrop-blur-sm rounded-xl z-10">
              <div className="text-center">
                <div className="text-gray-400 mb-2">📊 Loading chart data...</div>
                <div className="text-xs text-gray-500">Fetching real-time price movements</div>
              </div>
            </div>
          )}
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={liveChartData}>
              <defs>
                <linearGradient id="historicalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6}/>
                  <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.2}/>
                  <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="predictedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                  <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.15}/>
                  <stop offset="100%" stopColor="#4c1d95" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                stroke="#6b7280" 
                fontSize={11}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={[minValue, maxValue]}
                stroke="#6b7280" 
                fontSize={11}
                tickLine={false}
                width={65}
                tickFormatter={(value) => `${currencySymbol}${formatPrice(value, currency)}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '0.75rem',
                  color: '#f3f4f6',
                  padding: '8px 12px'
                }}
                formatter={(value: any, name: string, props: any) => {
                  const type = props.payload.type === 'prediction' ? '(Forecast)' : '';
                  return [`${currencySymbol}${formatPrice(value, currency)} ${type}`, 'Price'];
                }}
                labelFormatter={(label) => `Time: ${label}`}
              />
              
              <ReferenceLine 
                y={livePrice} 
                stroke="#f59e0b" 
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ 
                  value: `Live: ${currencySymbol}${livePrice.toFixed(2)}`, 
                  fill: '#f59e0b', 
                  fontSize: 11,
                  fontWeight: 'bold',
                  position: 'insideTopRight'
                }}
              />
              
              {/* Historical Line */}
              <Area 
                type="monotone" 
                dataKey="current"
                stroke="#3b82f6"
                strokeWidth={3}
                fill="url(#historicalGradient)"
                connectNulls
                dot={(props: any) => {
                  const { cx, cy, index, payload } = props;
                  const historicalPoints = liveChartData.filter(d => d.type === 'historical');
                  const isLatest = index === historicalPoints.length - 1;
                  
                  if (isLatest) {
                    return (
                      <g>
                        {/* Outer pulsing ring */}
                        <circle cx={cx} cy={cy} r={12} fill="#3b82f6" opacity={0.2}>
                          <animate attributeName="r" from="8" to="16" dur="1.5s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                        {/* Middle ring */}
                        <circle cx={cx} cy={cy} r={8} fill="#3b82f6" stroke="#1e40af" strokeWidth={2} />
                        {/* Inner pulsing dot */}
                        <circle cx={cx} cy={cy} r={4} fill="#60a5fa">
                          <animate attributeName="r" from="3" to="5" dur="1s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    );
                  }
                  return <circle cx={cx} cy={cy} r={2.5} fill="#3b82f6" opacity={0.5} />;
                }}
                activeDot={{ r: 8, fill: '#3b82f6', stroke: '#1e40af', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={1000}
                animationEasing="ease-in-out"
              />
              
              {/* Predicted Line */}
              <Area 
                type="monotone" 
                dataKey="predicted"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                strokeDasharray="8 4"
                fill="url(#predictedGradient)"
                connectNulls
                dot={(props: any) => {
                  const { cx, cy } = props;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={5} fill="#8b5cf6" opacity={0.3} />
                      <circle cx={cx} cy={cy} r={3} fill="#a78bfa" />
                    </g>
                  );
                }}
                activeDot={{ r: 7, fill: '#8b5cf6', stroke: '#7c3aed', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trading Signal & Support/Resistance */}
      {currentPrediction.tradingSignal && currentPrediction.supportResistance && (
        <div className="mb-6 p-5 bg-gradient-to-br from-gray-900/40 via-gray-800/30 to-gray-900/40 border border-gray-600/40 rounded-2xl shadow-lg">
          {/* Trading Signal */}
          <div className="mb-5">
            <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
              <span className="text-lg">🎯</span> Trading Signal
              {predictionAge > 0 && (
                <span className="text-xs text-gray-500 ml-auto">
                  Updated {Math.floor(predictionAge / 60)}m {predictionAge % 60}s ago
                </span>
              )}
            </h4>
            <div className={`p-4 rounded-xl border-2 ${
              currentPrediction.tradingSignal.signal === 'STRONG_BUY' ? 'bg-green-900/30 border-green-500' :
              currentPrediction.tradingSignal.signal === 'BUY' ? 'bg-green-900/20 border-green-600' :
              currentPrediction.tradingSignal.signal === 'STRONG_SELL' ? 'bg-red-900/30 border-red-500' :
              currentPrediction.tradingSignal.signal === 'SELL' ? 'bg-red-900/20 border-red-600' :
              'bg-yellow-900/20 border-yellow-600'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-white">{currentPrediction.tradingSignal.signal.replace('_', ' ')}</span>
                <span className="text-sm text-gray-300">Strength: {currentPrediction.tradingSignal.strength}</span>
              </div>
              <p className="text-sm text-gray-300 mb-2">{currentPrediction.tradingSignal.description}</p>
              <div className="text-xs text-gray-400 space-y-1">
                {currentPrediction.tradingSignal.reasons.map((reason, idx) => (
                  <div key={idx}>• {reason}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Support & Resistance Levels */}
          <div>
            <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
              <span className="text-lg">📊</span> Support & Resistance Levels
              <span className="ml-auto text-xs text-gray-500">Last updated: {Math.floor(predictionAge / 60)}m ago</span>
            </h4>
            <div className="relative bg-gradient-to-b from-gray-900/60 to-gray-800/40 rounded-xl p-6 border border-gray-700/50">
              {/* Price range bar */}
              <div className="relative h-80">
                {(() => {
                  const levels = [
                    { level: currentPrediction.supportResistance.resistance3, label: 'R3', color: '#ef4444', type: 'resistance', strength: 'Strong' },
                    { level: currentPrediction.supportResistance.resistance2, label: 'R2', color: '#f87171', type: 'resistance', strength: 'Medium' },
                    { level: currentPrediction.supportResistance.resistance1, label: 'R1', color: '#fca5a5', type: 'resistance', strength: 'Weak' },
                    { level: currentPrediction.supportResistance.pivot, label: 'Pivot', color: '#fbbf24', type: 'pivot', strength: 'Neutral' },
                    { level: currentPrediction.supportResistance.support1, label: 'S1', color: '#86efac', type: 'support', strength: 'Weak' },
                    { level: currentPrediction.supportResistance.support2, label: 'S2', color: '#4ade80', type: 'support', strength: 'Medium' },
                    { level: currentPrediction.supportResistance.support3, label: 'S3', color: '#22c55e', type: 'support', strength: 'Strong' },
                  ].sort((a, b) => b.level - a.level);

                  const maxLevel = levels[0].level;
                  const minLevel = levels[levels.length - 1].level;
                  const range = maxLevel - minLevel;
                  const currentPricePercent = ((maxLevel - livePrice) / range) * 100;

                  return (
                    <>
                      {/* Price levels */}
                      {levels.map((item, idx) => {
                        const position = ((maxLevel - item.level) / range) * 100;
                        const isNearCurrent = Math.abs(livePrice - item.level) / item.level < 0.015; // Within 1.5%
                        const priceDistance = ((item.level - livePrice) / livePrice * 100).toFixed(2);
                        
                        return (
                          <div 
                            key={idx} 
                            className="absolute left-0 right-0 flex items-center transition-all duration-300"
                            style={{ top: `${position}%` }}
                          >
                            {/* Level line */}
                            <div 
                              className={`flex-1 border-t-2 ${isNearCurrent ? 'border-4' : 'border-2'} transition-all`}
                              style={{ 
                                borderColor: item.color,
                                borderStyle: item.type === 'pivot' ? 'dashed' : 'solid',
                                opacity: isNearCurrent ? 1 : 0.6
                              }}
                            ></div>
                            
                            {/* Label and price */}
                            <div className="absolute left-0 flex items-center gap-2">
                              <span 
                                className={`px-2 py-0.5 text-xs font-bold rounded-l ${isNearCurrent ? 'scale-110' : ''} transition-transform`}
                                style={{ 
                                  backgroundColor: item.color,
                                  color: '#000'
                                }}
                              >
                                {item.label}
                              </span>
                              <span className="text-xs font-semibold text-white bg-gray-900/80 px-2 py-0.5 rounded">
                                {currencySymbol}{formatPrice(item.level, currency)}
                              </span>
                              <span className={`text-xs ${item.level > livePrice ? 'text-red-400' : 'text-green-400'}`}>
                                {item.level > livePrice ? '+' : ''}{priceDistance}%
                              </span>
                            </div>
                            
                            {/* Strength indicator */}
                            <span className="absolute right-0 text-xs text-gray-400 bg-gray-900/80 px-2 py-0.5 rounded-r">
                              {item.strength}
                            </span>
                          </div>
                        );
                      })}

                      {/* Current price indicator */}
                      <div 
                        className="absolute left-0 right-0 flex items-center z-10 transition-all duration-500"
                        style={{ top: `${currentPricePercent}%` }}
                      >
                        <div className="w-full flex items-center">
                          <div className="flex-1 border-t-3 border-orange-500 shadow-lg shadow-orange-500/50"></div>
                          <div className="relative">
                            <div className="absolute -left-2 -top-2 w-4 h-4 bg-orange-500 rounded-full animate-ping opacity-75"></div>
                            <span className="px-3 py-1 text-sm font-bold text-white bg-orange-500 rounded-lg shadow-lg border-2 border-orange-300 relative z-10">
                              🎯 LIVE: {currencySymbol}{livePrice.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex-1 border-t-3 border-orange-500 shadow-lg shadow-orange-500/50"></div>
                        </div>
                      </div>

                      {/* Zone indicators */}
                      {livePrice > currentPrediction.supportResistance.pivot && (
                        <div className="absolute top-2 right-2 px-3 py-1 bg-green-900/50 border border-green-500 rounded text-xs text-green-300">
                          📈 Above Pivot (Bullish Zone)
                        </div>
                      )}
                      {livePrice < currentPrediction.supportResistance.pivot && (
                        <div className="absolute top-2 right-2 px-3 py-1 bg-red-900/50 border border-red-500 rounded text-xs text-red-300">
                          📉 Below Pivot (Bearish Zone)
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Legend */}
              <div className="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded"></div>
                    <span className="text-gray-400">Resistance (Sell Zone)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-400 rounded"></div>
                    <span className="text-gray-400">Pivot Point</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    <span className="text-gray-400">Support (Buy Zone)</span>
                  </div>
                </div>
                <span className="text-gray-500">Calculated from last 50 periods</span>
              </div>
            </div>
          </div>
        </div>
      )}
        

      {/* Live Bulletin Feed */}
      {bulletinMessages.length > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-br from-indigo-900/30 via-purple-800/20 to-blue-900/20 border border-indigo-500/40 rounded-2xl shadow-lg">
          <h4 className="text-sm font-bold text-indigo-300 mb-3 flex items-center gap-2">
            <span className="text-lg">📢</span> Live Forecast Updates
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {bulletinMessages.map((msg, idx) => (
              <div key={idx} className={`text-xs p-2 rounded border-l-2 ${
                msg.type === 'UP' ? 'border-green-500 bg-green-900/20' : 'border-red-500 bg-red-900/20'
              }`}>
                <span className="text-gray-400">{msg.time}</span> - 
                <span className={msg.type === 'UP' ? 'text-green-300' : 'text-red-300'}> {msg.message}</span>
              </div>
            ))}
          </div>
        </div>
          )
      }

      {/* Short Term Prediction */}
      <div className="mb-6 p-5 bg-gradient-to-br from-purple-900/30 via-purple-800/20 to-blue-900/20 border border-purple-500/40 rounded-2xl shadow-lg shadow-purple-500/10">
        <h4 className="text-sm font-bold text-purple-300 mb-3 flex items-center gap-2">
          <span className="text-lg">🔮</span> Short Term ({data.shortTermPrediction.timeframe}) Forecast
        </h4>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-white">
            {currencySymbol}{formatPrice(data.shortTermPrediction.price, currency)}
          </span>
          <span className={`text-lg font-semibold ${isShortTermPredictionPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isShortTermPredictionPositive ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(data.shortTermPrediction.change), currency)}
          </span>
          <span className={`text-sm ${isShortTermPredictionPositive ? 'text-green-400' : 'text-red-400'}`}>
            ({isShortTermPredictionPositive ? '+' : ''}{data.shortTermPrediction.changePercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* 1 Month Prediction */}
      {data.oneMonthPrediction && (
        <div className="mb-6 p-5 bg-gradient-to-br from-blue-900/30 via-indigo-800/20 to-purple-900/20 border border-blue-500/40 rounded-2xl shadow-lg shadow-blue-500/10">
          <h4 className="text-sm font-bold text-blue-300 mb-3 flex items-center gap-2">
            <span className="text-lg">📈</span> 1 Month Forecast
            {previousPrediction && previousPrediction.oneMonthPrediction && (
              (() => {
                const priceDiff = currentPrediction.oneMonthPrediction.expectedPrice - previousPrediction.oneMonthPrediction.expectedPrice;
                if (Math.abs(priceDiff) > 0.1) {
                  return (
                    <span className={`ml-auto text-xs ${priceDiff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {priceDiff > 0 ? '↑' : '↓'} {Math.abs(priceDiff).toFixed(2)}
                    </span>
                  );
                }
                return null;
              })()
            )}
          </h4>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.expectedPrice, currency)}
              </span>
              <span className={`text-sm ${currentPrediction.oneMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({currentPrediction.oneMonthPrediction.changePercent >= 0 ? '+' : ''}{currentPrediction.oneMonthPrediction.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-baseline gap-2 text-sm">
              <span className={`flex-1 ${currentPrediction.oneMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentPrediction.oneMonthPrediction.changePercent >= 0 ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(currentPrediction.oneMonthPrediction.change), currency)}
              </span>
              <span className="text-gray-400">
                Conservative: {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.conservativePrice, currency)} | 
                Optimistic: {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.optimisticPrice, currency)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3 Month Prediction */}
      {data.threeMonthPrediction && (
        <div className="mb-6 p-5 bg-gradient-to-br from-teal-900/30 via-emerald-800/20 to-cyan-900/20 border border-teal-500/40 rounded-2xl shadow-lg shadow-teal-500/10">
          <h4 className="text-sm font-bold text-teal-300 mb-3 flex items-center gap-2">
            <span className="text-lg">📊</span> 3 Month Forecast
            {previousPrediction && previousPrediction.threeMonthPrediction && (
              (() => {
                const priceDiff = currentPrediction.threeMonthPrediction.expectedPrice - previousPrediction.threeMonthPrediction.expectedPrice;
                if (Math.abs(priceDiff) > 0.1) {
                  return (
                    <span className={`ml-auto text-xs ${priceDiff > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {priceDiff > 0 ? '↑' : '↓'} {Math.abs(priceDiff).toFixed(2)}
                    </span>
                  );
                }
                return null;
              })()
            )}
          </h4>
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.expectedPrice, currency)}
              </span>
              <span className={`text-sm ${currentPrediction.threeMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({currentPrediction.threeMonthPrediction.changePercent >= 0 ? '+' : ''}{currentPrediction.threeMonthPrediction.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-baseline gap-2 text-sm">
              <span className={`flex-1 ${currentPrediction.threeMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentPrediction.threeMonthPrediction.changePercent >= 0 ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(currentPrediction.threeMonthPrediction.change), currency)}
              </span>
              <span className="text-gray-400">
                Conservative: {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.conservativePrice, currency)} | 
                Optimistic: {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.optimisticPrice, currency)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Long Term Prediction */}
      <div className="mb-6 p-5 bg-gradient-to-br from-cyan-900/30 via-teal-800/20 to-blue-900/20 border border-cyan-500/40 rounded-2xl shadow-lg shadow-cyan-500/10">
        <h4 className="text-sm font-bold text-cyan-300 mb-3 flex items-center gap-2">
          <span className="text-lg">🔮</span> Long Term ({data.longTermPrediction.timeframe}) Forecast
        </h4>
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {currencySymbol}{formatPrice(data.longTermPrediction.expectedPrice, currency)}
            </span>
            <span className={`text-sm ${isLongTermPredictionPositive ? 'text-green-400' : 'text-red-400'}`}>
              ({isLongTermPredictionPositive ? '+' : ''}{data.longTermPrediction.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="flex items-baseline gap-2 text-sm">
            <span className={`flex-1 ${isLongTermPredictionPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isLongTermPredictionPositive ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(data.longTermPrediction.change), currency)}
            </span>
            <span className="text-gray-400">
              Conservative: {currencySymbol}{formatPrice(data.longTermPrediction.conservativePrice, currency)} | 
              Optimistic: {currencySymbol}{formatPrice(data.longTermPrediction.optimisticPrice, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Short Term Chart */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-purple-400" />
            <h4 className="text-sm font-semibold text-gray-300">6-Month Price Projection</h4>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-red-500"></div>
              <span className="text-gray-400">Conservative</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-purple-500"></div>
              <span className="text-gray-400">Expected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-green-500"></div>
              <span className="text-gray-400">Optimistic</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-800/40 rounded-xl p-4">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.longTermChartData}>
              <defs>
                <linearGradient id="conservativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="expectedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                </linearGradient>
                <linearGradient id="optimisticGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="month" 
                stroke="#6b7280" 
                fontSize={11}
                tickLine={false}
              />
              <YAxis 
                stroke="#6b7280" 
                fontSize={11}
                tickLine={false}
                width={65}
                tickFormatter={(value) => `${currencySymbol}${formatPrice(value, currency)}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '0.75rem',
                  color: '#f3f4f6',
                  padding: '8px 12px'
                }}
                formatter={(value: any, name: string) => {
                  const labels: Record<string, string> = {
                    'conservative': 'Conservative',
                    'expected': 'Expected',
                    'optimistic': 'Optimistic'
                  };
                  return [`${currencySymbol}${formatPrice(value, currency)}`, labels[name] || name];
                }}
              />
              
              <ReferenceLine 
                y={data.current.price} 
                stroke="#f59e0b" 
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{ 
                  value: `Current`, 
                  fill: '#f59e0b', 
                  fontSize: 10,
                  position: 'insideTopRight'
                }}
              />
              
              {/* Conservative Scenario */}
              <Area 
                type="monotone" 
                dataKey="conservative"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#conservativeGradient)"
                dot={{ r: 3, fill: '#ef4444' }}
              />
              
              {/* Expected Scenario */}
              <Area 
                type="monotone" 
                dataKey="expected"
                stroke="#8b5cf6"
                strokeWidth={2.5}
                fill="url(#expectedGradient)"
                dot={{ r: 4, fill: '#8b5cf6' }}
              />
              
              {/* Optimistic Scenario */}
              <Area 
                type="monotone" 
                dataKey="optimistic"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#optimisticGradient)"
                dot={{ r: 3, fill: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comprehensive Investment Report Card */}
      <ComprehensiveReportCard
        transcriptAnalysis={data.transcriptAnalysis}
        annualReport={data.annualReport}
        aiIntelligence={data.aiIntelligence}
        longTermConfidence={data.aiIntelligence?.longTermConfidence}
      />

      {/* Technical Indicators Section */}
      <div className="mb-6">
        <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 rounded-2xl p-5 border border-indigo-500/30 shadow-lg shadow-indigo-500/5">
          <h4 className="text-base font-bold text-indigo-300 mb-4 flex items-center gap-2">
            <span className="text-xl">📈</span> Technical Indicators
          </h4>
          
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveIndicatorTab('RSI')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                activeIndicatorTab === 'RSI'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/40'
              }`}
            >
              RSI (14)
            </button>
            <button
              onClick={() => setActiveIndicatorTab('MACD')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                activeIndicatorTab === 'MACD'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/40'
              }`}
            >
              MACD
            </button>
            <button
              onClick={() => setActiveIndicatorTab('MA')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
                activeIndicatorTab === 'MA'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-gray-800/40 text-gray-400 hover:bg-gray-700/40'
              }`}
            >
              Moving Averages
            </button>
          </div>

          {/* Indicator Explanation */}
          <div className="bg-gray-800/40 rounded-lg p-4">
            {activeIndicatorTab === 'RSI' && (
              <div>
                <p className="text-sm text-gray-300 mb-3">
                  <span className="font-bold text-indigo-400">RSI (Relative Strength Index)</span> measures momentum on a scale of 0-100.
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-center">
                    <div className="font-bold text-red-400">Overbought</div>
                    <div className="text-gray-400">RSI &gt; 70</div>
                    <div className="text-red-300 mt-1">Sell Signal</div>
                  </div>
                  <div className="bg-yellow-500/20 border border-yellow-500/40 rounded p-2 text-center">
                    <div className="font-bold text-yellow-400">Neutral</div>
                    <div className="text-gray-400">30-70</div>
                    <div className="text-yellow-300 mt-1">Hold</div>
                  </div>
                  <div className="bg-green-500/20 border border-green-500/40 rounded p-2 text-center">
                    <div className="font-bold text-green-400">Oversold</div>
                    <div className="text-gray-400">RSI &lt; 30</div>
                    <div className="text-green-300 mt-1">Buy Signal</div>
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">Current Reading</div>
                  <div className="text-3xl font-bold text-indigo-300">
                    {data.bulletPoints.find(bp => bp.includes('RSI'))?.match(/RSI[^\d]*(\d+\.?\d*)/)?.[1] || 'N/A'}
                  </div>
                </div>
              </div>
            )}

            {activeIndicatorTab === 'MACD' && (
              <div>
                <p className="text-sm text-gray-300 mb-3">
                  <span className="font-bold text-indigo-400">MACD (Moving Average Convergence Divergence)</span> shows trend direction and momentum.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="bg-green-500/20 border border-green-500/40 rounded p-2 text-center">
                    <div className="font-bold text-green-400">Bullish Crossover</div>
                    <div className="text-gray-400 mt-1">MACD &gt; Signal Line</div>
                    <div className="text-green-300 mt-1">Uptrend Expected</div>
                  </div>
                  <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-center">
                    <div className="font-bold text-red-400">Bearish Crossover</div>
                    <div className="text-gray-400 mt-1">MACD &lt; Signal Line</div>
                    <div className="text-red-300 mt-1">Downtrend Expected</div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-1">Current Signal</div>
                  <div className="text-2xl font-bold">
                    {data.bulletPoints.find(bp => bp.includes('MACD'))?.includes('Bullish') ? (
                      <span className="text-green-400">🟢 Bullish</span>
                    ) : data.bulletPoints.find(bp => bp.includes('MACD'))?.includes('Bearish') ? (
                      <span className="text-red-400">🔴 Bearish</span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeIndicatorTab === 'MA' && (
              <div>
                <p className="text-sm text-gray-300 mb-3">
                  <span className="font-bold text-indigo-400">Moving Averages</span> identify support/resistance levels and trend direction.
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="bg-yellow-500/20 border border-yellow-500/40 rounded p-2 text-center">
                    <div className="font-bold text-yellow-400">Golden Cross</div>
                    <div className="text-gray-400 mt-1">50-MA crosses above 200-MA</div>
                    <div className="text-green-300 mt-1">Strong Buy Signal</div>
                  </div>
                  <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-center">
                    <div className="font-bold text-red-400">Death Cross</div>
                    <div className="text-gray-400 mt-1">50-MA crosses below 200-MA</div>
                    <div className="text-red-300 mt-1">Strong Sell Signal</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                    <span className="text-sm text-gray-400">50-Day SMA</span>
                    <span className="font-bold text-white">
                      {data.bulletPoints.find(bp => bp.includes('SMA 50'))?.match(/SMA 50.*?(\d+\.?\d*)/)?.[1] || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                    <span className="text-sm text-gray-400">200-Day SMA</span>
                    <span className="font-bold text-white">
                      {data.bulletPoints.find(bp => bp.includes('SMA 200'))?.match(/SMA 200.*?(\d+\.?\d*)/)?.[1] || 'N/A'}
                    </span>
                  </div>
                  <div className="text-center mt-3">
                    <div className="text-xs text-gray-500 mb-1">Signal Status</div>
                    <div className="text-lg font-bold">
                      {data.bulletPoints.find(bp => bp.includes('GOLDEN CROSS')) ? (
                        <span className="text-yellow-400">🌟 Golden Cross</span>
                      ) : data.bulletPoints.find(bp => bp.includes('DEATH CROSS')) ? (
                        <span className="text-red-400">⚠️ Death Cross</span>
                      ) : (
                        <span className="text-gray-400">No Cross Signal</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bullet Points Summary */}
      <div className="bg-gray-800/40 rounded-xl p-4 mb-6">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">Key Insights</h4>
        <ul className="space-y-2">
          {data.bulletPoints.map((point, index) => (
            <li key={index} className="text-sm text-gray-300 flex items-start gap-2">
              <span className="text-green-400">•</span>
              <span>{parseBulletPoint(point)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Fundamental Analysis */}
      {data.fundamentals && (
        <div className="space-y-4 mb-6">
          <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
            📊 Fundamental Analysis
          </h3>
          
          {/* Valuation Metrics */}
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-2xl p-5 border border-blue-500/30 shadow-lg shadow-blue-500/5">
            <h4 className="text-base font-bold text-blue-300 mb-4 flex items-center gap-2">
              <span className="text-xl">📈</span> Valuation Metrics
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.fundamentals.peRatio && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">P/E Ratio</div>
                  <div className="text-lg font-bold text-white">{data.fundamentals.peRatio.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.pegRatio && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">PEG Ratio</div>
                  <div className="text-lg font-bold text-white">{data.fundamentals.pegRatio.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.priceToBook && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Price/Book</div>
                  <div className="text-lg font-bold text-white">{data.fundamentals.priceToBook.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.marketCap && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Market Cap</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{currency === 'INR' ? (data.fundamentals.marketCap / 1e7).toFixed(2) + ' Cr' : (data.fundamentals.marketCap / 1e9).toFixed(2) + 'B'}
                  </div>
                </div>
              )}
              {data.fundamentals.beta && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Beta</div>
                  <div className="text-lg font-bold text-white">{data.fundamentals.beta.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.dividendYield && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Dividend Yield</div>
                  <div className="text-lg font-bold text-white">{(data.fundamentals.dividendYield * 100).toFixed(2)}%</div>
                </div>
              )}
              {data.fundamentals.bookValue && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Book Value</div>
                  <div className="text-lg font-bold text-white">{currencySymbol}{data.fundamentals.bookValue.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.faceValue && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Face Value</div>
                  <div className="text-lg font-bold text-white">{currencySymbol}{data.fundamentals.faceValue.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Financial Health */}
          <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-2xl p-5 border border-green-500/30 shadow-lg shadow-green-500/5">
            <h4 className="text-base font-bold text-green-300 mb-4 flex items-center gap-2">
              <span className="text-xl">💰</span> Financial Health
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.fundamentals.cash && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Cash & Equivalents</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{currency === 'INR' ? (data.fundamentals.cash / 1e7).toFixed(2) + ' Cr' : (data.fundamentals.cash / 1e9).toFixed(2) + 'B'}
                  </div>
                </div>
              )}
              {data.fundamentals.totalDebt && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Total Debt</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{currency === 'INR' ? (data.fundamentals.totalDebt / 1e7).toFixed(2) + ' Cr' : (data.fundamentals.totalDebt / 1e9).toFixed(2) + 'B'}
                  </div>
                </div>
              )}
              {data.fundamentals.debtToEquity && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Debt/Equity</div>
                  <div className="text-lg font-bold text-white">{data.fundamentals.debtToEquity.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.currentRatio && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Current Ratio</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.currentRatio >= 2 ? 'text-green-400' : 
                    data.fundamentals.currentRatio >= 1 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{data.fundamentals.currentRatio.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.quickRatio && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Quick Ratio</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.quickRatio >= 1.5 ? 'text-green-400' : 
                    data.fundamentals.quickRatio >= 0.8 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{data.fundamentals.quickRatio.toFixed(2)}</div>
                </div>
              )}
              {data.fundamentals.interestCoverage && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Interest Coverage</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.interestCoverage >= 5 ? 'text-green-400' : 
                    data.fundamentals.interestCoverage >= 2 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{data.fundamentals.interestCoverage.toFixed(2)}x</div>
                </div>
              )}
            </div>
          </div>

          {/* Profitability */}
          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-2xl p-5 border border-purple-500/30 shadow-lg shadow-purple-500/5">
            <h4 className="text-base font-bold text-purple-300 mb-4 flex items-center gap-2">
              <span className="text-xl">📊</span> Profitability & Returns
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {data.fundamentals.operatingMargin && (
                <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
                  <div className="text-xs text-gray-400 mb-1.5">Operating Margin</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.operatingMargin > 0.15 ? 'text-green-400' : 
                    data.fundamentals.operatingMargin > 0.05 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{(data.fundamentals.operatingMargin * 100).toFixed(1)}%</div>
                </div>
              )}
              {data.fundamentals.profitMargin && (
                <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
                  <div className="text-xs text-gray-400 mb-1.5">Net Profit Margin</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.profitMargin > 0.10 ? 'text-green-400' : 
                    data.fundamentals.profitMargin > 0.03 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{(data.fundamentals.profitMargin * 100).toFixed(1)}%</div>
                </div>
              )}
              {data.fundamentals.roe && (
                <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
                  <div className="text-xs text-gray-400 mb-1.5">ROE</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.roe > 0.15 ? 'text-green-400' : 
                    data.fundamentals.roe > 0.10 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{(data.fundamentals.roe * 100).toFixed(1)}%</div>
                </div>
              )}
              {data.fundamentals.roa && (
                <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
                  <div className="text-xs text-gray-400 mb-1.5">ROA</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.roa > 0.10 ? 'text-green-400' : 
                    data.fundamentals.roa > 0.05 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{(data.fundamentals.roa * 100).toFixed(1)}%</div>
                </div>
              )}
              {data.fundamentals.roce && (
                <div className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
                  <div className="text-xs text-gray-400 mb-1.5">ROCE</div>
                  <div className={`text-lg font-bold ${
                    data.fundamentals.roce > 0.20 ? 'text-green-400' : 
                    data.fundamentals.roce > 0.12 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{(data.fundamentals.roce * 100).toFixed(1)}%</div>
                </div>
              )}
            </div>
          </div>

          {/* Cash Flow & CAPEX */}
          <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 rounded-2xl p-5 border border-orange-500/30 shadow-lg shadow-orange-500/5">
            <h4 className="text-base font-bold text-orange-300 mb-4 flex items-center gap-2">
              <span className="text-xl">💵</span> Cash Flow & CAPEX
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.fundamentals.capex && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">CAPEX</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{currency === 'INR' ? (data.fundamentals.capex / 1e7).toFixed(2) + ' Cr' : (data.fundamentals.capex / 1e9).toFixed(2) + 'B'}
                  </div>
                </div>
              )}
              {data.fundamentals.freeCashFlow && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Free Cash Flow</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{currency === 'INR' ? (data.fundamentals.freeCashFlow / 1e7).toFixed(2) + ' Cr' : (data.fundamentals.freeCashFlow / 1e9).toFixed(2) + 'B'}
                  </div>
                </div>
              )}
              {data.fundamentals.operatingCashFlow && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Operating Cash Flow</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{currency === 'INR' ? (data.fundamentals.operatingCashFlow / 1e7).toFixed(2) + ' Cr' : (data.fundamentals.operatingCashFlow / 1e9).toFixed(2) + 'B'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Revenue */}
          <div className="bg-gradient-to-br from-pink-900/30 to-pink-800/20 rounded-2xl p-5 border border-pink-500/30 shadow-lg shadow-pink-500/5">
            <h4 className="text-base font-bold text-pink-300 mb-4 flex items-center gap-2">
              <span className="text-xl">📈</span> Revenue & Growth
              {data.fundamentals.fiscalQuarter && (
                <span className="ml-auto text-xs bg-pink-500/20 px-3 py-1 rounded-full border border-pink-500/30">
                  {data.fundamentals.fiscalQuarter}
                </span>
              )}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.fundamentals.revenue && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Quarterly Revenue</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{currency === 'INR' ? (data.fundamentals.revenue / 1e7).toFixed(2) + ' Cr' : (data.fundamentals.revenue / 1e9).toFixed(2) + 'B'}
                  </div>
                </div>
              )}
              {data.fundamentals.revenueGrowth && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Revenue Growth (YoY)</div>
                  <div className={`text-lg font-bold ${data.fundamentals.revenueGrowth > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {data.fundamentals.revenueGrowth > 0 ? '+' : ''}{(data.fundamentals.revenueGrowth * 100).toFixed(1)}%
                  </div>
                </div>
              )}
              {data.fundamentals.earningsPerShare && (
                <div className="bg-gray-800/40 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">EPS</div>
                  <div className="text-lg font-bold text-white">
                    {currencySymbol}{data.fundamentals.earningsPerShare.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Growth Metrics */}
          {(data.fundamentals.salesGrowth3Y || data.fundamentals.salesGrowth5Y || data.fundamentals.profitGrowth3Y || data.fundamentals.profitGrowth5Y || data.fundamentals.roe3Y || data.fundamentals.roe5Y) && (
            <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 rounded-2xl p-5 border border-cyan-500/30 shadow-lg shadow-cyan-500/5">
              <h4 className="text-base font-bold text-cyan-300 mb-4 flex items-center gap-2">
                <span className="text-xl">📊</span> Historical Growth (CAGR)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.fundamentals.salesGrowth3Y && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Sales Growth (3Y)</div>
                    <div className={`text-lg font-bold ${data.fundamentals.salesGrowth3Y > 0.1 ? 'text-green-400' : data.fundamentals.salesGrowth3Y > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.fundamentals.salesGrowth3Y * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.salesGrowth5Y && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Sales Growth (5Y)</div>
                    <div className={`text-lg font-bold ${data.fundamentals.salesGrowth5Y > 0.1 ? 'text-green-400' : data.fundamentals.salesGrowth5Y > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.fundamentals.salesGrowth5Y * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.profitGrowth3Y && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Profit Growth (3Y)</div>
                    <div className={`text-lg font-bold ${data.fundamentals.profitGrowth3Y > 0.1 ? 'text-green-400' : data.fundamentals.profitGrowth3Y > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.fundamentals.profitGrowth3Y * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.profitGrowth5Y && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Profit Growth (5Y)</div>
                    <div className={`text-lg font-bold ${data.fundamentals.profitGrowth5Y > 0.1 ? 'text-green-400' : data.fundamentals.profitGrowth5Y > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.fundamentals.profitGrowth5Y * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.roe3Y && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Avg ROE (3Y)</div>
                    <div className={`text-lg font-bold ${data.fundamentals.roe3Y > 0.15 ? 'text-green-400' : data.fundamentals.roe3Y > 0.1 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.fundamentals.roe3Y * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.roe5Y && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Avg ROE (5Y)</div>
                    <div className={`text-lg font-bold ${data.fundamentals.roe5Y > 0.15 ? 'text-green-400' : data.fundamentals.roe5Y > 0.1 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.fundamentals.roe5Y * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Efficiency Ratios */}
          {(data.fundamentals.debtorDays || data.fundamentals.cashConversionCycle || data.fundamentals.workingCapitalDays) && (
            <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 rounded-2xl p-5 border border-amber-500/30 shadow-lg shadow-amber-500/5">
              <h4 className="text-base font-bold text-amber-300 mb-4 flex items-center gap-2">
                <span className="text-xl">⚡</span> Efficiency Metrics
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {data.fundamentals.debtorDays && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Debtor Days</div>
                    <div className={`text-lg font-bold ${data.fundamentals.debtorDays < 45 ? 'text-green-400' : data.fundamentals.debtorDays < 90 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {data.fundamentals.debtorDays.toFixed(0)} days
                    </div>
                  </div>
                )}
                {data.fundamentals.cashConversionCycle && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Cash Conversion Cycle</div>
                    <div className={`text-lg font-bold ${data.fundamentals.cashConversionCycle < 30 ? 'text-green-400' : data.fundamentals.cashConversionCycle < 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {data.fundamentals.cashConversionCycle.toFixed(0)} days
                    </div>
                  </div>
                )}
                {data.fundamentals.workingCapitalDays && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Working Capital Days</div>
                    <div className="text-lg font-bold text-white">
                      {data.fundamentals.workingCapitalDays.toFixed(0)} days
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shareholding Pattern */}
          {(data.fundamentals.promoterHolding || data.fundamentals.fiiHolding || data.fundamentals.diiHolding) && (
            <div className="bg-gradient-to-br from-violet-900/30 to-violet-800/20 rounded-2xl p-5 border border-violet-500/30 shadow-lg shadow-violet-500/5">
              <h4 className="text-base font-bold text-violet-300 mb-4 flex items-center gap-2">
                <span className="text-xl">👥</span> Shareholding Pattern
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {data.fundamentals.promoterHolding && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Promoter Holding</div>
                    <div className={`text-lg font-bold ${data.fundamentals.promoterHolding > 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {(data.fundamentals.promoterHolding * 100).toFixed(2)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.fiiHolding && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">FII Holding</div>
                    <div className="text-lg font-bold text-white">
                      {(data.fundamentals.fiiHolding * 100).toFixed(2)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.diiHolding && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">DII Holding</div>
                    <div className="text-lg font-bold text-white">
                      {(data.fundamentals.diiHolding * 100).toFixed(2)}%
                    </div>
                  </div>
                )}
                {data.fundamentals.pledgedPercentage !== null && data.fundamentals.pledgedPercentage !== undefined && (
                  <div className="bg-gray-800/40 rounded-lg p-3">
                    <div className="text-xs text-gray-400 mb-1">Pledged %</div>
                    <div className={`text-lg font-bold ${data.fundamentals.pledgedPercentage === 0 ? 'text-green-400' : data.fundamentals.pledgedPercentage < 0.2 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {(data.fundamentals.pledgedPercentage * 100).toFixed(2)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Annual Report Insights - Structured Data */}
      {data.annualReport && (
        <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/40 rounded-xl p-6 border border-indigo-500/30 backdrop-blur-md">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
            <span className="text-3xl">📊</span>
            Annual Report Key Insights
          </h3>

          <div className="space-y-6">
            {/* Business Model */}
            {data.annualReport.businessModel && (
              <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-500/20">
                <h4 className="text-lg font-semibold text-blue-300 mb-2 flex items-center gap-2">
                  <span>💼</span> Business Model
                </h4>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {data.annualReport.businessModel}
                </p>
              </div>
            )}

            {/* Future Strategy */}
            {data.annualReport.futureStrategy && (
              <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-500/20">
                <h4 className="text-lg font-semibold text-purple-300 mb-2 flex items-center gap-2">
                  <span>🚀</span> Future Strategy
                </h4>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {data.annualReport.futureStrategy}
                </p>
              </div>
            )}
          </div>
        
      

            {/* Key Risks & Opportunities Side by Side */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Key Risks */}
              {data.annualReport.keyRisks && 
               data.annualReport.keyRisks.length > 0 && (
                <div className="bg-red-900/20 rounded-lg p-4 border border-red-500/20">
                  <h4 className="text-lg font-semibold text-red-300 mb-3 flex items-center gap-2">
                    <span>⚠️</span> Key Risks
                  </h4>
                  <ul className="space-y-2">
                    {data.annualReport.keyRisks.map((risk: string, idx: number) => (
                      <li key={idx} className="text-gray-300 text-sm flex items-start gap-2">
                        <span className="text-red-400 mt-1">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key Opportunities */}
              {data.annualReport.keyOpportunities && 
               data.annualReport.keyOpportunities.length > 0 && (
                <div className="bg-emerald-900/20 rounded-lg p-4 border border-emerald-500/20">
                  <h4 className="text-lg font-semibold text-emerald-300 mb-3 flex items-center gap-2">
                    <span>✨</span> Key Opportunities
                  </h4>
                  <ul className="space-y-2">
                    {data.annualReport.keyOpportunities.map((opp: string, idx: number) => (
                      <li key={idx} className="text-gray-300 text-sm flex items-start gap-2">
                        <span className="text-emerald-400 mt-1">•</span>
                        <span>{opp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Year-over-Year Balance Sheet Summary */}
            {data.annualReport?.balanceSheet?.summary && (
              <div className="mt-4 bg-gradient-to-br from-indigo-900/30 to-purple-900/30 rounded-lg p-4 border border-indigo-500/30">
                <h4 className="text-sm font-semibold text-indigo-300 mb-3 flex items-center gap-2">
                  <span className="text-lg">📈</span>
                  Year-over-Year Financial Performance
                </h4>
                <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                  {data.annualReport.balanceSheet.summary}
                </p>
              </div>
            )}
            
            {/* Executive Remuneration */}
            {data.annualReport.remuneration && (
              <div className="bg-gradient-to-br from-yellow-900/30 to-orange-900/30 rounded-lg p-4 border border-yellow-500/30">
                <h4 className="text-lg font-semibold text-yellow-300 mb-3 flex items-center gap-2">
                  <span>💼</span> Executive Remuneration ({data.annualReport.remuneration.fiscalYear})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-gray-300 border-collapse">
                    <thead>
                      <tr className="border-b border-yellow-500/30">
                        <th className="text-left py-2">Executive</th>
                        <th className="text-right py-2">Total (₹ Cr)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.annualReport.remuneration.executiveDirectors.map((exec: any, idx: number) => (
                        <tr key={idx} className="border-b border-yellow-500/10">
                          <td className="py-2">{exec.name} <span className="text-xs text-gray-400">({exec.designation})</span></td>
                          <td className="text-right py-2">{exec.totalRemuneration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.annualReport.remuneration.summary && (
                    <p className="text-xs text-gray-400 mt-3 italic">
                      {data.annualReport.remuneration.summary}
                    </p>
                  )}
                </div>
              </div>
            )}
            
            {/* Audit Report */}
            {data.annualReport.auditInformation && (
              <div className="bg-gradient-to-br from-slate-900/40 to-gray-900/40 rounded-2xl p-6 border border-slate-500/30 shadow-2xl">
                <h4 className="text-2xl font-bold text-slate-200 mb-6 flex items-center gap-3">
                  <span className="text-3xl">🔍</span> 
                  Independent Auditor's Report
                  <span className="ml-auto text-xs bg-slate-600/30 px-3 py-1.5 rounded-full border border-slate-500/40">
                    {data.annualReport.auditInformation.fiscalYear}
                  </span>
                </h4>

                <div className="space-y-6">
                  {/* Auditor Details - FIXED */}
                  {data.annualReport.auditInformation.auditor && (
                    <div className="bg-slate-800/40 rounded-xl p-5 border border-slate-600/30">
                      <h5 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                        <span>🏢</span> Auditor Information
                      </h5>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-400 mb-1">Firm Name</p>
                          <p className="text-sm text-slate-200 font-semibold">{data.annualReport.auditInformation.auditor.firmName}</p>
                        </div>
                        {data.annualReport.auditInformation.auditor.registrationNumber && (
                          <div>
                            <p className="text-xs text-slate-400 mb-1">Registration Number</p>
                            <p className="text-sm text-slate-200 font-mono">{data.annualReport.auditInformation.auditor.registrationNumber}</p>
                          </div>
                        )}
                        {data.annualReport.auditInformation.auditor.partnerName && (
                          <div>
                            <p className="text-xs text-slate-400 mb-1">Partner Name</p>
                            <p className="text-sm text-slate-200">{data.annualReport.auditInformation.auditor.partnerName}</p>
                          </div>
                        )}
                        {data.annualReport.auditInformation.auditor.membershipNumber && (
                          <div>
                            <p className="text-xs text-slate-400 mb-1">Membership Number</p>
                            <p className="text-sm text-slate-200 font-mono">{data.annualReport.auditInformation.auditor.membershipNumber}</p>
                          </div>
                        )}
                        {data.annualReport.auditInformation.auditor.reportDate && (
                          <div>
                            <p className="text-xs text-slate-400 mb-1">Report Date</p>
                            <p className="text-sm text-slate-200">{data.annualReport.auditInformation.auditor.reportDate}</p>
                          </div>
                        )}
                        {data.annualReport.auditInformation.auditor.location && (
                          <div>
                            <p className="text-xs text-slate-400 mb-1">Location</p>
                            <p className="text-sm text-slate-200">{data.annualReport.auditInformation.auditor.location}</p>
                          </div>
                        )}
                        {data.annualReport.auditInformation.auditor.udin && (
                          <div className="md:col-span-2">
                            <p className="text-xs text-slate-400 mb-1">UDIN</p>
                            <p className="text-sm text-slate200 font-mono">{data.annualReport.auditInformation.auditor.udin}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Audit Opinion - FIXED property names */}
                  {data.annualReport.auditInformation.opinion && (
                    <div className={`px-4 py-3 rounded-lg border-2 ${
                      (() => {
                        const opinionType = data.annualReport.auditInformation.opinion.type?.toLowerCase() || '';
                        
                        // Green: Unqualified/Unmodified Opinion (GOOD)
                        if (opinionType.includes('unqualified') || opinionType.includes('unmodified')) {
                          return 'bg-green-900/30 border-green-500 text-green-300';
                        }
                        
                        // Yellow: Qualified Opinion (CAUTION) - but NOT unqualified
                        if (opinionType.includes('qualified') && !opinionType.includes('unqualified')) {
                          return 'bg-yellow-900/30 border-yellow-500 text-yellow-300';
                        }
                        
                        // Red: Adverse or Disclaimer (DANGER)
                        if (opinionType.includes('adverse') || opinionType.includes('disclaimer')) {
                          return 'bg-red-900/30 border-red-500 text-red-300';
                        }
                        
                        // Gray: Unknown/Other
                        return 'bg-gray-900/30 border-gray-500 text-gray-300';
                      })()
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">
                            {(() => {
                              const opinionType = data.annualReport.auditInformation.opinion.type?.toLowerCase() || '';
                              if (opinionType.includes('unqualified') || opinionType.includes('unmodified')) return '✓';
                              if (opinionType.includes('qualified') && !opinionType.includes('unqualified')) return '⚠️';
                              if (opinionType.includes('adverse') || opinionType.includes('disclaimer')) return '✗';
                              return '❓';
                            })()}
                          </span>
                          <span>Audit Opinion: {data.annualReport.auditInformation.opinion.type}</span>
                          {data.annualReport.auditInformation.opinion.isModified && (
                            <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded">
                              Modified
                            </span>
                          )}
                        </div>
                      </div>
                      {data.annualReport.auditInformation.opinion.statement && (
                        <p className="text-xs text-gray-400 mb-2 italic border-l-2 border-gray-600 pl-3">
                          {data.annualReport.auditInformation.opinion.statement}
                        </p>
                      )}
                      {data.annualReport.auditInformation.opinion.basisForOpinion && (
                        <p className="text-xs text-gray-400">
                          <span className="font-semibold">Basis: </span>
                          {data.annualReport.auditInformation.opinion.basisForOpinion}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Emphasis of Matter - FIXED with referenceNote */}
                  {data.annualReport.auditInformation.emphasisOfMatter?.present && (
                    <div className="bg-orange-900/20 rounded-xl p-5 border border-orange-500/30">
                      <h5 className="text-lg font-semibold text-orange-300 mb-3 flex items-center gap-2">
                        <span>⚠️</span> Emphasis of Matter
                        {data.annualReport.auditInformation.emphasisOfMatter.referenceNote && (
                          <span className="ml-auto text-xs bg-orange-500/20 px-2 py-1 rounded-full">
                            Note: {data.annualReport.auditInformation.emphasisOfMatter.referenceNote}
                          </span>
                        )}
                      </h5>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {data.annualReport.auditInformation.emphasisOfMatter.description}
                      </p>
                    </div>
                  )}

                  {/* Material Uncertainty */}
                  {data.annualReport.auditInformation.materialUncertainty?.present && (
                    <div className="bg-red-900/20 rounded-xl p-5 border border-red-500/30">
                      <h5 className="text-lg font-semibold text-red-300 mb-3 flex items-center gap-2">
                        <span>🚨</span> Material Uncertainty Related to Going Concern
                      </h5>
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {data.annualReport.auditInformation.materialUncertainty.description}
                      </p>
                    </div>
                  )}

                  {/* Key Audit Matters - FIXED property names */}
                  {data.annualReport.auditInformation.keyAuditMatters && 
                   data.annualReport.auditInformation.keyAuditMatters.length > 0 && (
                    <div className="bg-blue-900/20 rounded-xl p-5 border border-blue-500/30">
                      <h5 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
                        <span>🔑</span> Key Audit Matters
                      </h5>
                      <div className="space-y-4">
                        {data.annualReport.auditInformation.keyAuditMatters.map((matter: any, idx: number) => (
                          <div key={idx} className="bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                            <h6 className="text-md font-semibold text-blue-200 mb-2 flex items-center justify-between">
                              <span>{matter.title}</span>
                              {matter.referenceNotes && matter.referenceNotes.length > 0 && (
                                <span className="text-xs bg-blue-500/20 px-2 py-1 rounded-full">
                                  {matter.referenceNotes.join(', ')}
                                </span>
                              )}
                            </h6>
                            {matter.whyItsAKAM && (
                              <div className="mb-3">
                                <p className="text-xs text-slate-400 mb-1">Why it's a Key Audit Matter</p>
                                <p className="text-sm text-gray-300 leading-relaxed">{matter.whyItsAKAM}</p>
                              </div>
                            )}
                            {matter.auditorsResponse && (
                              <div>
                                <p className="text-xs text-slate-400 mb-1">How the Auditor Addressed It</p>
                                <p className="text-sm text-gray-300 leading-relaxed">{matter.auditorsResponse}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other Matters - FIXED unauditedComponents array mapping */}
                  {data.annualReport.auditInformation.otherMatters && (
                    <div className="bg-purple-900/20 rounded-xl p-5 border border-purple-500/30">
                      <h5 className="text-lg font-semibold text-purple-300 mb-3 flex items-center gap-2">
                        <span>📋</span> Other Matters
                      </h5>
                      <div className="space-y-3 text-sm text-gray-300">
                        {typeof data.annualReport.auditInformation.otherMatters === 'string' ? (
                          <p className="leading-relaxed">{data.annualReport.auditInformation.otherMatters}</p>
                        ) : (
                          <>
                            {data.annualReport.auditInformation.otherMatters.componentAuditorsInvolved !== undefined && (
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400">Component Auditors Involved:</span>
                                <span className="font-semibold">{data.annualReport.auditInformation.otherMatters.componentAuditorsInvolved ? 'Yes' : 'No'}</span>
                              </div>
                            )}
                            {data.annualReport.auditInformation.otherMatters.numberOfSubsidiariesByOthers !== undefined && (
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400">Subsidiaries Audited by Others:</span>
                                <span className="font-semibold">{data.annualReport.auditInformation.otherMatters.numberOfSubsidiariesByOthers}</span>
                              </div>
                            )}
                            {data.annualReport.auditInformation.otherMatters.percentageAuditedByOthers && (
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400">Percentage Audited by Others:</span>
                                <span className="font-semibold">{data.annualReport.auditInformation.otherMatters.percentageAuditedByOthers}</span>
                              </div>
                            )}
                            {data.annualReport.auditInformation.otherMatters.relianceStatement && (
                              <div className="mt-2 pt-2 border-t border-purple-500/20">
                                <p className="text-xs text-slate-400 mb-1">Reliance Statement:</p>
                                <p className="text-sm text-gray-300 mt-1">{data.annualReport.auditInformation.otherMatters.relianceStatement}</p>
                              </div>
                            )}
                            {data.annualReport.auditInformation.otherMatters.unauditedComponents && 
                             Array.isArray(data.annualReport.auditInformation.otherMatters.unauditedComponents) && 
                             data.annualReport.auditInformation.otherMatters.unauditedComponents.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-purple-500/20">
                                <p className="text-xs text-slate-400 mb-2">Unaudited Components:</p>
                                <ul className="list-disc list-inside space-y-1">
                                  {data.annualReport.auditInformation.otherMatters.unauditedComponents.map((component: string, idx: number) => (
                                    <li key={idx} className="text-sm">{component}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* NEW SECTION: Legal & Regulatory Compliance */}
                  {data.annualReport.auditInformation.legalRegulatoryCompliance && (
                    <div className="bg-indigo-900/20 rounded-xl p-5 border border-indigo-500/30">
                      <h5 className="text-lg font-semibold text-indigo-300 mb-4 flex items-center gap-2">
                        <span>⚖️</span> Legal & Regulatory Compliance
                      </h5>
                      
                      {/* Section 143(3) */}
                      {data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3 && (
                        <div className="mb-4 bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                          <h6 className="text-md font-semibold text-indigo-200 mb-3">Section 143(3) - Companies Act</h6>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Information Obtained:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3.informationObtained}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Proper Books Kept:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3.properBooksKept}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Agreement with Books:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3.agreementWithBooks}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Ind AS Compliance:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3.indASCompliance}</span>
                            </div>
                            <div className="flex justify-between md:col-span-2">
                              <span className="text-slate-400">Directors Disqualified:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3.directorsDisqualified}</span>
                            </div>
                            {data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3.internalControlsOpinion && (
                              <div className="md:col-span-2 mt-2 pt-2 border-t border-slate-600/30">
                                <span className="text-xs text-slate-400">Internal Controls Opinion:</span>
                                <p className="text-sm text-gray-300 mt-1">{data.annualReport.auditInformation.legalRegulatoryCompliance.section143_3.internalControlsOpinion}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Rule 11 */}
                      {data.annualReport.auditInformation.legalRegulatoryCompliance.rule11 && (
                        <div className="mb-4 bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                          <h6 className="text-md font-semibold text-indigo-200 mb-3">Rule 11 - Audit and Auditors Rules, 2014</h6>
                          <div className="space-y-2 text-sm mb-3">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Litigations Disclosed:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.litigationsDisclosed}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Foreseeable Losses Provided:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.foreseeableLossesProvided}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">IEPF Transfers:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.iepfTransfers}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Funds to Intermediaries:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.fundsToIntermediaries}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Funds from Funding Parties:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.fundsFromFundingParties}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Dividend Compliance:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.dividendCompliance}</span>
                            </div>
                            
                            {data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.auditTrail && (
                              <div className="mt-3 pt-3 border-t border-slate-600/30">
                                <p className="text-xs text-slate-400 mb-2">Audit Trail in Accounting Software:</p>
                                <div className="grid md:grid-cols-2 gap-2">
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Enabled:</span>
                                    <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.auditTrail.enabled ? 'Yes' : 'No'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Tampering Detected:</span>
                                    <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.auditTrail.tampering}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Preserved:</span>
                                    <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.auditTrail.preserved}</span>
                                  </div>
                                </div>
                                {data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.auditTrail.exceptions && (
                                  <div className="mt-2">
                                    <span className="text-xs text-slate-400">Exceptions:</span>
                                    <p className="text-sm text-yellow-300 mt-1">{data.annualReport.auditInformation.legalRegulatoryCompliance.rule11.auditTrail.exceptions}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Section 197(16) */}
                      {data.annualReport.auditInformation.legalRegulatoryCompliance.section197_16 && (
                        <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                          <h6 className="text-md font-semibold text-indigo-200 mb-3">Section 197(16) - Director Remuneration</h6>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Compliant:</span>
                              <span className={`font-semibold ${data.annualReport.auditInformation.legalRegulatoryCompliance.section197_16.compliant ? 'text-green-300' : 'text-red-300'}`}>
                                {data.annualReport.auditInformation.legalRegulatoryCompliance.section197_16.compliant ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Excess Payments:</span>
                              <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.legalRegulatoryCompliance.section197_16.excessPayments}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* NEW SECTION: CARO (Companies Auditors Report Order) */}
                  {data.annualReport.auditInformation.caro && data.annualReport.auditInformation.caro.applicable && (
                    <div className="bg-amber-900/20 rounded-xl p-5 border border-amber-500/30">
                      <h5 className="text-lg font-semibold text-amber-300 mb-4 flex items-center gap-2">
                        <span>📜</span> CARO Report (Annexure {data.annualReport.auditInformation.caro.annexure})
                      </h5>
                      <div className="space-y-3 text-sm">
                        <div className="bg-slate-800/40 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-1">Holding Company Remarks:</p>
                          <p className="text-gray-300">{data.annualReport.auditInformation.caro.holdingCompanyRemarks}</p>
                        </div>
                        
                        {data.annualReport.auditInformation.caro.subsidiariesWithIssues && 
                         data.annualReport.auditInformation.caro.subsidiariesWithIssues.length > 0 && (
                          <div className="bg-red-900/20 rounded-lg p-3 border border-red-500/30">
                            <p className="text-xs text-red-400 mb-2">⚠️ Subsidiaries with Issues:</p>
                            <ul className="list-disc list-inside space-y-1 text-gray-300">
                              {data.annualReport.auditInformation.caro.subsidiariesWithIssues.map((sub: any, idx: number) => (
                                <li key={idx}>{sub}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {data.annualReport.auditInformation.caro.subsidiariesCARONotIssued && 
                         data.annualReport.auditInformation.caro.subsidiariesCARONotIssued.length > 0 && (
                          <div className="bg-yellow-900/20 rounded-lg p-3 border border-yellow-500/30">
                            <p className="text-xs text-yellow-400 mb-2">📋 Subsidiaries - CARO Not Issued:</p>
                            <ul className="space-y-2 text-gray-300">
                              {data.annualReport.auditInformation.caro.subsidiariesCARONotIssued.map((sub: any, idx: number) => (
                                <li key={idx} className="flex justify-between items-center">
                                  <span>{sub.name}</span>
                                  {sub.cin && <span className="text-xs font-mono bg-slate-700/50 px-2 py-1 rounded">{sub.cin}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* NEW SECTION: Internal Financial Controls */}
                  {data.annualReport.auditInformation.internalFinancialControls && (
                    <div className="bg-teal-900/20 rounded-xl p-5 border border-teal-500/30">
                      <h5 className="text-lg font-semibold text-teal-300 mb-4 flex items-center gap-2">
                        <span>🛡️</span> Internal Financial Controls (Annexure {data.annualReport.auditInformation.internalFinancialControls.annexure})
                      </h5>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Opinion:</span>
                          <span className={`font-semibold ${data.annualReport.auditInformation.internalFinancialControls.opinion.toLowerCase().includes('adequate') ? 'text-green-300' : 'text-red-300'}`}>
                            {data.annualReport.auditInformation.internalFinancialControls.opinion}
                          </span>
                        </div>
                        {data.annualReport.auditInformation.internalFinancialControls.scope && (
                          <div className="bg-slate-800/40 rounded-lg p-3">
                            <p className="text-xs text-slate-400 mb-1">Scope:</p>
                            <p className="text-gray-300">{data.annualReport.auditInformation.internalFinancialControls.scope}</p>
                          </div>
                        )}
                        {data.annualReport.auditInformation.internalFinancialControls.exceptions && (
                          <div className="bg-yellow-900/20 rounded-lg p-3 border border-yellow-500/30">
                            <p className="text-xs text-yellow-400 mb-1">⚠️ Exceptions:</p>
                            <p className="text-gray-300">{data.annualReport.auditInformation.internalFinancialControls.exceptions}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* NEW SECTION: Consolidation Scope */}
                  {data.annualReport.auditInformation.consolidationScope && (
                    <div className="bg-cyan-900/20 rounded-xl p-5 border border-cyan-500/30">
                      <h5 className="text-lg font-semibold text-cyan-300 mb-4 flex items-center gap-2">
                        <span>🌐</span> Consolidation Scope
                      </h5>
                      <div className="grid md:grid-cols-3 gap-4">
                        {/* Subsidiaries */}
                        {data.annualReport.auditInformation.consolidationScope.subsidiaries && (
                          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                            <h6 className="text-sm font-semibold text-cyan-200 mb-3 flex items-center gap-2">
                              <span>🏢</span> Subsidiaries
                            </h6>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Total:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.subsidiaries.total}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Indian:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.subsidiaries.indian}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Foreign:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.subsidiaries.foreign}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t border-slate-600/30">
                                <span className="text-slate-400 text-xs">By Component Auditors:</span>
                                <span className="font-semibold text-yellow-300">{data.annualReport.auditInformation.consolidationScope.subsidiaries.auditedByComponentAuditors}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Associates */}
                        {data.annualReport.auditInformation.consolidationScope.associates && (
                          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                            <h6 className="text-sm font-semibold text-cyan-200 mb-3 flex items-center gap-2">
                              <span>🤝</span> Associates
                            </h6>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Total:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.associates.total}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Indian:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.associates.indian}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Foreign:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.associates.foreign}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Joint Ventures */}
                        {data.annualReport.auditInformation.consolidationScope.jointVentures && (
                          <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                            <h6 className="text-sm font-semibold text-cyan-200 mb-3 flex items-center gap-2">
                              <span>🔗</span> Joint Ventures
                            </h6>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Total:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.jointVentures.total}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Indian:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.jointVentures.indian}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Foreign:</span>
                                <span className="font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.jointVentures.foreign}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Component Auditors */}
                      {data.annualReport.auditInformation.consolidationScope.componentAuditors && (
                        <div className="mt-4 bg-slate-800/40 rounded-lg p-4 border border-slate-600/30">
                          <h6 className="text-sm font-semibold text-cyan-200 mb-3">Component Auditors</h6>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-slate-400">Percentage of Revenue:</span>
                              <span className="ml-2 font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.componentAuditors.percentageOfRevenue}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Percentage of Assets:</span>
                              <span className="ml-2 font-semibold text-gray-300">{data.annualReport.auditInformation.consolidationScope.componentAuditors.percentageOfAssets}</span>
                            </div>
                          </div>
                          {data.annualReport.auditInformation.consolidationScope.componentAuditors.firms && 
                           data.annualReport.auditInformation.consolidationScope.componentAuditors.firms.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-600/30">
                              <p className="text-xs text-slate-400 mb-2">Audit Firms:</p>
                              <div className="flex flex-wrap gap-2">
                                {data.annualReport.auditInformation.consolidationScope.componentAuditors.firms.map((firm: string, idx: number) => (
                                  <span key={idx} className="text-xs bg-cyan-500/20 px-3 py-1 rounded-full text-cyan-200 border border-cyan-500/30">
                                    {firm}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div> 
      )}
    </div>
  );
}

