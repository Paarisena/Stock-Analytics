"use client";
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, IndianRupee, Coins, Activity, Radio, Volume2, Clock, AlertTriangle,RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, CartesianGrid, Legend, BarChart, Bar } from 'recharts';
import ComprehensiveReportCard from './ComprehensiveReportCard';
import { callGeminiAPI } from '../utils/aiProviders';
import AnnualReportAccordion from './AnnualReportAccordion';
import TranscriptPDFViewer from './TranscriptPDFViewer';
import LivePriceDisplay from './stock/LivePrice/LivePriceDisplay';

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

// Animation variants for Framer Motion
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1] as any
    }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const scaleIn = {
  hidden: { scale: 0.95, opacity: 0 },
  visible: { 
    scale: 1, 
    opacity: 1,
    transition: { 
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1] as any
    }
  }
};

const priceFlash = {
  initial: { scale: 1 },
  flash: { 
    scale: [1, 1.05, 1],
    transition: { duration: 0.3 }
  }
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
  companyName?: string;
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
  earningsCall?: any;
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

  quarterlyReport?: {
    quarter: string;
    keyMetrics?: any;
    managementCommentary?: any;
    segmentPerformance?: any[];
    financialRatios?: any;
    cashFlow?: any;
    outlook?: any;
    competitivePosition?: any;
    summary?: string;
    source?: string;
    fromCache?: boolean;
  };
}

export default function StockCard({ data }: { data: StockData }) {
  const [activeIndicatorTab, setActiveIndicatorTab] = useState<'RSI' | 'MACD' | 'MA'>('RSI');
  const [isLive, setIsLive] = useState(true);
  
  // Prediction tracking state
  const [currentPrediction, setCurrentPrediction] = useState(data);
  const [previousPrediction, setPreviousPrediction] = useState<StockData | null>(null);
  const [predictionAge, setPredictionAge] = useState(0);
  
  // Deep analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [showFYAlert, setShowFYAlert] = useState(false);
  const [fyCheckData, setFYCheckData] = useState<any>(null);
  const [deepAnalysisData, setDeepAnalysisData] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRefreshingReport, setIsRefreshingReport] = useState(false);

  
  if (!data || !data.current || !data.shortTermPrediction || !data.longTermPrediction || !data.chartData || !data.longTermChartData) {
    return null;
  }
  
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
  }, [data]);
  
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

  // Process chart data
  const chartData = data.chartData.map(point => ({
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

  // Safely convert any value to a displayable string
  const safeString = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'object') {
      // Handle objects like {name, assets, revenues, netProfit, netCashFlows, reason}
      return Object.entries(val)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    }
    return String(val);
  };

  // Parse bullet points to remove markdown
  const parseBulletPoint = (text: any) => {
    const str = safeString(text);
    return str.replace(/\*\*/g, '').replace(/📍|🔮|📊|💹|⏰|🏢|📅|📈|📉|➡️/g, '').trim();
  };

    // Handle force refresh of annual report
  const handleRefreshAnnualReport = async () => {
    setIsRefreshingReport(true);
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `${data.symbol} stock price`,
          model: `${callGeminiAPI}`,
          forceRefresh: true  // Force refresh annual report from BSE India
        })
      });

      if (response.ok) {
        // Reload the page to show fresh data
        window.location.reload();
      } else {
        console.error('Failed to refresh annual report');
        alert('Failed to refresh annual report. Please try again.');
      }
    } catch (error) {
      console.error('Error refreshing annual report:', error);
      alert('Error refreshing annual report. Please try again.');
    } finally {
      setIsRefreshingReport(false);
    }
  };


  return (
    <div className="my-4 sm:my-6 lg:my-8 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-slate-700/50 shadow-2xl hover:border-cyan-500/30 transition-all duration-500 relative overflow-hidden">
      {/* Animated background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 -left-20 w-60 h-60 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>
      
      {/* Live Ticker Tape */}
      <motion.div 
        className="relative mb-4 sm:mb-6 bg-gradient-to-r from-cyan-900/30 via-blue-900/30 to-cyan-900/30 border border-cyan-500/30 rounded-xl sm:rounded-2xl overflow-hidden backdrop-blur-sm"
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${isLive ? 'text-red-400 animate-pulse' : 'text-gray-500'}`} />
            <span className="text-xs font-bold text-cyan-300 tracking-wider">LIVE</span>
          </div>
          <div className="flex-1 w-full sm:w-auto">
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-4 text-xs text-gray-300">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-cyan-400">Price:</span> 
                <span className="text-white">{currencySymbol}{formatPrice(data.current.price, currency)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-cyan-400">Change:</span> 
                <span className={data.current.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {data.current.change >= 0 ? '+' : ''}{currencySymbol}{Math.abs(data.current.change).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-cyan-400">Prev Close:</span> 
                <span className="text-white">{currencySymbol}{formatPrice(data.metadata.previousClose, currency)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-cyan-400">Market:</span> 
                <span className={data.current.marketState === 'REGULAR' ? 'text-green-400' : 'text-red-400'}>
                  {data.current.marketState === 'REGULAR' ? '● OPEN' : '● CLOSED'}
                </span>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{new Date(data.metadata.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      </motion.div>

      {/* Header with Live Price */}
      <motion.div 
        className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3"
        variants={scaleIn}
        initial="hidden"
        animate="visible"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-teal-400 bg-clip-text text-transparent">{data.symbol}</h3>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg backdrop-blur-sm ${data.current.change >= 0 ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
              {data.current.change >= 0 ? <TrendingUp size={18} className="animate-pulse" /> : <TrendingDown size={18} className="animate-pulse" />}
              <span className="text-xs sm:text-sm font-semibold">{data.current.change >= 0 ? '+' : ''}{data.current.changePercent.toFixed(2)}%</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm sm:text-base">{data.metadata.exchange}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 sm:p-4 bg-gradient-to-br from-cyan-600/20 to-blue-600/20 rounded-2xl backdrop-blur-sm border border-cyan-500/30 hover:scale-110 transition-transform duration-300">
            {getCurrencyIcon(currency)}
          </div>
        </div>
      </motion.div>

      {/* Live Current Price + Metrics - Extracted Component for Performance */}
      <LivePriceDisplay
        symbol={data.symbol}
        initialPrice={data.current.price}
        currency={currency}
        previousClose={data.metadata.previousClose}
        isLive={isLive}
      />

      {/* Price Chart with Prediction */}
      <div className="relative mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-cyan-400" />
            <h4 className="text-sm sm:text-base font-semibold text-white">Price Movement & Forecast</h4>
            <div className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-green-500/20 rounded-full">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-400 font-medium">Live</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded-lg">
              <div className="w-3 h-0.5 bg-blue-500"></div>
              <span className="text-gray-300">Historical</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded-lg">
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
          {data.chartData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800/60 backdrop-blur-sm rounded-xl z-10">
              <div className="text-center">
                <div className="text-gray-400 mb-2">📊 Loading chart data...</div>
                <div className="text-xs text-gray-500">Fetching real-time price movements</div>
              </div>
            </div>
          )}
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.chartData}>
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
                formatter={(value: any, name: string | undefined, props: any) => {
                  const type = props.payload.type === 'prediction' ? '(Forecast)' : '';
                    return [`${currencySymbol}${formatPrice(value, currency)} ${type}`, 'Price'];
                  }}
                  labelFormatter={(label: any) => label ? `Time: ${label}` : 'Time: N/A'}
                  />
                  
                  <ReferenceLine 
                  y={data.current.price} 
                  stroke="#f59e0b" 
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{ 
                    value: `Current: ${currencySymbol}${data.current.price.toFixed(2)}`, 
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
                  const historicalPoints = data.chartData.filter(d => d.type === 'historical');
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
        <div className="relative mb-6 sm:mb-8 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-slate-900/50 via-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-2xl sm:rounded-3xl shadow-xl backdrop-blur-sm hover:border-cyan-500/40 transition-all duration-300">
          {/* Trading Signal */}
          <div className="mb-6 sm:mb-8">
            <h4 className="text-sm sm:text-base font-bold text-white mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl">🎯</span> Trading Signal
              </span>
              {predictionAge > 0 && (
                <span className="text-xs text-gray-500 sm:ml-auto">
                  Updated {Math.floor(predictionAge / 60)}m {predictionAge % 60}s ago
                </span>
              )}
            </h4>
            <div className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] ${
              currentPrediction.tradingSignal.signal === 'STRONG_BUY' ? 'bg-green-900/30 border-green-500 shadow-green-500/20' :
              currentPrediction.tradingSignal.signal === 'BUY' ? 'bg-green-900/20 border-green-600 shadow-green-600/10' :
              currentPrediction.tradingSignal.signal === 'STRONG_SELL' ? 'bg-red-900/30 border-red-500 shadow-red-500/20' :
              currentPrediction.tradingSignal.signal === 'SELL' ? 'bg-red-900/20 border-red-600 shadow-red-600/10' :
              'bg-yellow-900/20 border-yellow-600 shadow-yellow-600/10'
            } shadow-lg`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">{currentPrediction.tradingSignal.signal.replace('_', ' ')}</span>
                <span className="text-sm text-gray-300 px-3 py-1 bg-slate-800/50 rounded-lg inline-flex items-center gap-2">
                  <span className="font-semibold">Strength:</span> {currentPrediction.tradingSignal.strength}
                </span>
              </div>
              <p className="text-sm sm:text-base text-gray-300 mb-3">{currentPrediction.tradingSignal.description}</p>
              <div className="text-xs sm:text-sm text-gray-400 space-y-2">
                {currentPrediction.tradingSignal.reasons.map((reason: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-cyan-400 mt-0.5">•</span>
                    <span>{safeString(reason)}</span>
                  </div>
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
                  const currentPricePercent = ((maxLevel - data.current.price) / range) * 100;

                  return (
                    <>
                      {/* Price levels */}
                      {levels.map((item, idx) => {
                        const position = ((maxLevel - item.level) / range) * 100;
                        const isNearCurrent = Math.abs(data.current.price - item.level) / item.level < 0.015; // Within 1.5%
                        const priceDistance = ((item.level - data.current.price) / data.current.price * 100).toFixed(2);
                        
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
                              <span className={`text-xs ${item.level > data.current.price ? 'text-red-400' : 'text-green-400'}`}>
                                {item.level > data.current.price ? '+' : ''}{priceDistance}%
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
                              🎯 Current: {currencySymbol}{data.current.price.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex-1 border-t-3 border-orange-500 shadow-lg shadow-orange-500/50"></div>
                        </div>
                      </div>

                      {/* Zone indicators */}
                      {data.current.price > currentPrediction.supportResistance.pivot && (
                        <div className="absolute top-2 right-2 px-3 py-1 bg-green-900/50 border border-green-500 rounded text-xs text-green-300">
                          📈 Above Pivot (Bullish Zone)
                        </div>
                      )}
                      {data.current.price < currentPrediction.supportResistance.pivot && (
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

      {/* Short Term Prediction */}
      <motion.div 
        className="relative mb-4 sm:mb-6 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-purple-900/30 via-purple-800/20 to-blue-900/20 border border-purple-500/40 rounded-2xl sm:rounded-3xl shadow-xl shadow-purple-500/10 backdrop-blur-sm hover:border-purple-500/60 transition-all duration-300"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        whileHover={{ scale: 1.02, boxShadow: '0 20px 50px rgba(168, 85, 247, 0.3)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>
        <h4 className="relative text-sm sm:text-base font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-3 sm:mb-4 flex items-center gap-2">
          <span className="text-xl sm:text-2xl">🔮</span> Short Term ({data.shortTermPrediction.timeframe}) Forecast
        </h4>
        <div className="relative flex flex-col sm:flex-row sm:items-baseline gap-2">
          <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white">
            {currencySymbol}{formatPrice(data.shortTermPrediction.price, currency)}
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-base sm:text-lg lg:text-xl font-semibold ${isShortTermPredictionPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isShortTermPredictionPositive ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(data.shortTermPrediction.change), currency)}
            </span>
            <span className={`text-sm sm:text-base ${isShortTermPredictionPositive ? 'text-green-400' : 'text-red-400'} px-2 py-0.5 bg-slate-800/50 rounded-lg`}>
              ({isShortTermPredictionPositive ? '+' : ''}{data.shortTermPrediction.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      </motion.div>

      {/* 1 Month Prediction */}
      {data.oneMonthPrediction && (
        <motion.div 
          className="relative mb-4 sm:mb-6 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-blue-900/30 via-indigo-800/20 to-purple-900/20 border border-blue-500/40 rounded-2xl sm:rounded-3xl shadow-xl shadow-blue-500/10 backdrop-blur-sm hover:border-blue-500/60 transition-all duration-300"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          whileHover={{ scale: 1.02, boxShadow: '0 20px 50px rgba(59, 130, 246, 0.3)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>
          <h4 className="relative text-sm sm:text-base font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">📈</span> 1 Month Forecast
            </span>
            {previousPrediction && previousPrediction.oneMonthPrediction && (
              (() => {
                const priceDiff = currentPrediction.oneMonthPrediction.expectedPrice - previousPrediction.oneMonthPrediction.expectedPrice;
                if (Math.abs(priceDiff) > 0.1) {
                  return (
                    <span className={`sm:ml-auto text-xs px-2 py-1 rounded-lg backdrop-blur-sm ${priceDiff > 0 ? 'text-green-400 bg-green-500/20' : 'text-red-400 bg-red-500/20'}`}>
                      {priceDiff > 0 ? '↑' : '↓'} {Math.abs(priceDiff).toFixed(2)}
                    </span>
                  );
                }
                return null;
              })()
            )}
          </h4>
          <div className="relative flex flex-col gap-2 sm:gap-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
                {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.expectedPrice, currency)}
              </span>
              <span className={`text-base sm:text-lg px-2 py-1 bg-slate-800/50 rounded-lg ${currentPrediction.oneMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({currentPrediction.oneMonthPrediction.changePercent >= 0 ? '+' : ''}{currentPrediction.oneMonthPrediction.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 text-xs sm:text-sm">
              <span className={`font-semibold ${currentPrediction.oneMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentPrediction.oneMonthPrediction.changePercent >= 0 ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(currentPrediction.oneMonthPrediction.change), currency)}
              </span>
              <span className="text-gray-400">
                <span className="hidden sm:inline">Conservative: {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.conservativePrice, currency)} | Optimistic: {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.optimisticPrice, currency)}</span>
                <span className="sm:hidden block space-y-1">
                  <div>Conservative: {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.conservativePrice, currency)}</div>
                  <div>Optimistic: {currencySymbol}{formatPrice(currentPrediction.oneMonthPrediction.optimisticPrice, currency)}</div>
                </span>
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* 3 Month Prediction */}
      {data.threeMonthPrediction && (
        <motion.div 
          className="relative mb-4 sm:mb-6 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-teal-900/30 via-emerald-800/20 to-cyan-900/20 border border-teal-500/40 rounded-2xl sm:rounded-3xl shadow-xl shadow-teal-500/10 backdrop-blur-sm hover:border-teal-500/60 transition-all duration-300"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          whileHover={{ scale: 1.02, boxShadow: '0 20px 50px rgba(20, 184, 166, 0.3)' }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>
          <h4 className="relative text-sm sm:text-base font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl">📊</span> 3 Month Forecast
            </span>
            {previousPrediction && previousPrediction.threeMonthPrediction && (
              (() => {
                const priceDiff = currentPrediction.threeMonthPrediction.expectedPrice - previousPrediction.threeMonthPrediction.expectedPrice;
                if (Math.abs(priceDiff) > 0.1) {
                  return (
                    <span className={`sm:ml-auto text-xs px-2 py-1 rounded-lg backdrop-blur-sm ${priceDiff > 0 ? 'text-green-400 bg-green-500/20' : 'text-red-400 bg-red-500/20'}`}>
                      {priceDiff > 0 ? '↑' : '↓'} {Math.abs(priceDiff).toFixed(2)}
                    </span>
                  );
                }
                return null;
              })()
            )}
          </h4>
          <div className="relative flex flex-col gap-2 sm:gap-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
                {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.expectedPrice, currency)}
              </span>
              <span className={`text-base sm:text-lg px-2 py-1 bg-slate-800/50 rounded-lg ${currentPrediction.threeMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ({currentPrediction.threeMonthPrediction.changePercent >= 0 ? '+' : ''}{currentPrediction.threeMonthPrediction.changePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 text-xs sm:text-sm">
              <span className={`font-semibold ${currentPrediction.threeMonthPrediction.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentPrediction.threeMonthPrediction.changePercent >= 0 ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(currentPrediction.threeMonthPrediction.change), currency)}
              </span>
              <span className="text-gray-400">
                <span className="hidden sm:inline">Conservative: {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.conservativePrice, currency)} | Optimistic: {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.optimisticPrice, currency)}</span>
                <span className="sm:hidden block space-y-1">
                  <div>Conservative: {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.conservativePrice, currency)}</div>
                  <div>Optimistic: {currencySymbol}{formatPrice(currentPrediction.threeMonthPrediction.optimisticPrice, currency)}</div>
                </span>
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Long Term Prediction */}
      <div className="relative mb-6 sm:mb-8 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-cyan-900/30 via-teal-800/20 to-blue-900/20 border border-cyan-500/40 rounded-2xl sm:rounded-3xl shadow-xl shadow-cyan-500/10 backdrop-blur-sm hover:border-cyan-500/60 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>
        <h4 className="relative text-sm sm:text-base font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-3 sm:mb-4 flex items-center gap-2">
          <span className="text-xl sm:text-2xl">🔮</span> Long Term ({data.longTermPrediction.timeframe}) Forecast
        </h4>
        <div className="relative flex flex-col gap-2 sm:gap-3">
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
            <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
              {currencySymbol}{formatPrice(data.longTermPrediction.expectedPrice, currency)}
            </span>
            <span className={`text-base sm:text-lg px-2 py-1 bg-slate-800/50 rounded-lg ${isLongTermPredictionPositive ? 'text-green-400' : 'text-red-400'}`}>
              ({isLongTermPredictionPositive ? '+' : ''}{data.longTermPrediction.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 text-xs sm:text-sm">
            <span className={`font-semibold ${isLongTermPredictionPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isLongTermPredictionPositive ? '+' : ''}{currencySymbol}{formatPrice(Math.abs(data.longTermPrediction.change), currency)}
            </span>
            <span className="text-gray-400">
              <span className="hidden sm:inline">Conservative: {currencySymbol}{formatPrice(data.longTermPrediction.conservativePrice, currency)} | Optimistic: {currencySymbol}{formatPrice(data.longTermPrediction.optimisticPrice, currency)}</span>
              <span className="sm:hidden block space-y-1">
                <div>Conservative: {currencySymbol}{formatPrice(data.longTermPrediction.conservativePrice, currency)}</div>
                <div>Optimistic: {currencySymbol}{formatPrice(data.longTermPrediction.optimisticPrice, currency)}</div>
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Short Term Chart */}
      <div className="relative mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-purple-400" />
            <h4 className="text-sm sm:text-base font-semibold text-white">6-Month Price Projection</h4>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded-lg">
              <div className="w-3 h-0.5 bg-red-500"></div>
              <span className="text-gray-300">Conservative</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded-lg">
              <div className="w-3 h-0.5 bg-purple-500"></div>
              <span className="text-gray-300">Expected</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded-lg">
              <div className="w-3 h-0.5 bg-green-500"></div>
              <span className="text-gray-300">Optimistic</span>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-900/50 to-slate-800/50 rounded-2xl p-3 sm:p-4 lg:p-6 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 backdrop-blur-sm">
          <ResponsiveContainer width="100%" height={250} className="sm:h-80 lg:h-96">
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
                formatter={(value: any, name: string | undefined) => {
                  const labels: Record<string, string> = {
                    'conservative': 'Conservative',
                    'expected': 'Expected',
                    'optimistic': 'Optimistic'
                  };
                  return [`${currencySymbol}${formatPrice(value, currency)}`, labels[name || ''] || (name || '')];
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

      {/* Earnings Call Transcript PDF Viewer */}
      {(() => {
        console.log('🔍 [Frontend] Earnings call data:', {
          hasEarningsCall: !!data.earningsCall,
          hasPdfUrl: !!data.earningsCall?.pdfUrl,
          pdfUrlLength: data.earningsCall?.pdfUrl?.length || 0,
          pdfUrlPreview: data.earningsCall?.pdfUrl?.substring(0, 100),
          quarter: data.earningsCall?.quarter
        });
        return null;
      })()}
      {data.earningsCall?.pdfUrl && (
        <div className="mb-6">
          <TranscriptPDFViewer
            pdfUrl={data.earningsCall.pdfUrl}
            quarter={data.earningsCall.quarter || 'Latest'}
            fiscalYear={data.earningsCall.fiscalYear || new Date().getFullYear().toString()}
            symbol={data.symbol}
            companyName={data.companyName}
          />
        </div>
      )}

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
                  <div className={`text-3xl font-bold ${
                    data.technicalIndicators?.rsi?.value 
                      ? data.technicalIndicators.rsi.value > 70 
                        ? 'text-red-400' 
                        : data.technicalIndicators.rsi.value < 30 
                          ? 'text-green-400' 
                          : 'text-indigo-300'
                      : 'text-gray-400'
                  }`}>
                    {data.technicalIndicators?.rsi?.value?.toFixed(2) || 'N/A'}
                  </div>
                  {data.technicalIndicators?.rsi?.signal && (
                    <div className="text-sm text-gray-400 mt-2">
                      Signal: <span className="font-semibold text-indigo-300">{data.technicalIndicators.rsi.signal}</span>
                    </div>
                  )}
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
                {data.technicalIndicators?.macd && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                      <span className="text-sm text-gray-400">MACD Line</span>
                      <span className="font-bold text-white">
                        {data.technicalIndicators.macd.value?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                      <span className="text-sm text-gray-400">Signal Line</span>
                      <span className="font-bold text-white">
                        {data.technicalIndicators.macd.signal?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                      <span className="text-sm text-gray-400">Histogram</span>
                      <span className={`font-bold ${
                        (data.technicalIndicators.macd.histogram || 0) > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {data.technicalIndicators.macd.histogram?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
                <div className="text-center mt-3">
                  <div className="text-xs text-gray-500 mb-1">Current Signal</div>
                  <div className="text-2xl font-bold">
                    {data.technicalIndicators?.macd?.trend === 'Bullish' ? (
                      <span className="text-green-400">🟢 Bullish</span>
                    ) : data.technicalIndicators?.macd?.trend === 'Bearish' ? (
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
                {data.technicalIndicators?.movingAverages && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                      <span className="text-sm text-gray-400">20-Day SMA</span>
                      <span className="font-bold text-white">
                        {data.technicalIndicators.movingAverages.sma20?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                      <span className="text-sm text-gray-400">50-Day SMA</span>
                      <span className="font-bold text-white">
                        {data.technicalIndicators.movingAverages.sma50?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-gray-700/30 rounded p-2">
                      <span className="text-sm text-gray-400">200-Day SMA</span>
                      <span className="font-bold text-white">
                        {data.technicalIndicators.movingAverages.sma200?.toFixed(2) || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
                <div className="text-center mt-3">
                  <div className="text-xs text-gray-500 mb-1">Signal Status</div>
                  <div className="text-lg font-bold">
                    {data.technicalIndicators?.movingAverages?.crossover === 'Golden Cross' ? (
                      <span className="text-yellow-400">🌟 Golden Cross</span>
                    ) : data.technicalIndicators?.movingAverages?.crossover === 'Death Cross' ? (
                      <span className="text-red-400">⚠️ Death Cross</span>
                    ) : (
                      <span className="text-gray-400">No Cross Signal</span>
                    )}
                  </div>
                  {data.technicalIndicators?.movingAverages?.trend && (
                    <div className="text-sm text-gray-400 mt-2">
                      Trend: <span className="font-semibold text-indigo-300">
                        {data.technicalIndicators.movingAverages.trend}
                      </span>
                    </div>
                  )}
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
          {data.bulletPoints.map((point: any, index: number) => (
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
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Annual Report Key Insights
              {data.annualReport.fromCache && (
                <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded-full">
                  Cached
                </span>
              )}
              {data.annualReport.source && (
                <span className="text-xs text-purple-400">
                  • {data.annualReport.source}
                </span>
              )}
            </h3>
            
            {/* Force Refresh Button */}
            <button
              onClick={handleRefreshAnnualReport}
              disabled={isRefreshingReport}
              className="px-3 py-2 bg-purple-600/80 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-lg"
              title="Force refresh annual report from BSE India (bypasses 6-month cache)"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingReport ? 'animate-spin' : ''}`} />
              <span>{isRefreshingReport ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

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
                    {data.annualReport.keyRisks.map((risk: any, idx: number) => (
                      <li key={idx} className="text-gray-300 text-sm flex items-start gap-2">
                        <span className="text-red-400 mt-1">•</span>
                        <span>{safeString(risk)}</span>
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
                    {data.annualReport.keyOpportunities.map((opp: any, idx: number) => (
                      <li key={idx} className="text-gray-300 text-sm flex items-start gap-2">
                        <span className="text-emerald-400 mt-1">•</span>
                        <span>{safeString(opp)}</span>
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
              {data.annualReport.remuneration && data.annualReport.remuneration.available !== false && data.annualReport.remuneration.executiveDirectors && (
              <div className="bg-gradient-to-br from-yellow-900/30 to-orange-900/30 rounded-lg p-4 border border-yellow-500/30">
                <h4 className="text-lg font-semibold text-yellow-300 mb-3 flex items-center gap-2">
                  <span className="text-xl">💼</span> Executive Remuneration ({data.annualReport.remuneration.fiscalYear})
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
                          <td className="text-right py-2"> {exec.remuneration?.totalRemuneration || exec.salary || 'N/A'}</td>
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

                {/* Show placeholder message if remuneration data is unavailable */}
                {data.annualReport.remuneration && data.annualReport.remuneration.available === false && (
                  <div className="bg-gradient-to-br from-yellow-900/20 to-orange-900/20 rounded-lg p-4 border border-yellow-500/20">
                    <h4 className="text-lg font-semibold text-yellow-300 mb-2 flex items-center gap-2">
                      <span className="text-xl">💼</span> Executive Remuneration
                    </h4>
                    <p className="text-sm text-gray-400 italic">
                      ℹ️ {data.annualReport.remuneration.note}
                    </p>
                    {data.annualReport.remuneration.fiscalYear && (
                      <p className="text-xs text-gray-500 mt-2">
                        Fiscal Year: {data.annualReport.remuneration.fiscalYear}
                      </p>
                    )}
                  </div>
                )}

            {/* Audit Report */}
            {data.annualReport.auditInformation && data.annualReport.auditInformation.available !== false && data.annualReport.auditInformation.auditor && (
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
                                  {data.annualReport.auditInformation.otherMatters.unauditedComponents.map((component: any, idx: number) => (
                                    <li key={idx} className="text-sm">{safeString(component)}</li>
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
                                <span className="text-xs text-slate-400 mb-1">Internal Controls Opinion:</span>
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
        <li key={idx} className="flex justify-between items-center">
          <span>{typeof sub === 'string' ? sub : (sub.name || 'Unknown')}</span>
          {typeof sub === 'object' && (
            <div className="flex items-center gap-2">
              {sub.cin && (
                <span className="text-xs font-mono bg-slate-700/50 px-2 py-1 rounded">
                  {sub.cin}
                </span>
              )}
              {sub.caroStatus && (
                <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded">
                  {sub.caroStatus}
                </span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  </div>
)}
                        
                        {data.annualReport.auditInformation.caro.subsidiariesCARONotIssued && 
                         data.annualReport.auditInformation.caro.subsidiariesCARONotIssued.length > 0 && (
                          <div className="bg-yellow-900/20 rounded-lg p-3 border border-yellow-500/30">
                            <p className="text-xs text-yellow-400 mb-1">📋 Subsidiaries - CARO Not Issued:</p>
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
                        {data.annualReport.auditInformation.internalFinancialControls.opinion && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Opinion:</span>
                            <span className={`font-semibold ${data.annualReport.auditInformation.internalFinancialControls.opinion.toLowerCase().includes('adequate') ? 'text-green-300' : 'text-red-300'}`}>
                              {data.annualReport.auditInformation.internalFinancialControls.opinion}
                            </span>
                          </div>
                        )}
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
                            <h6 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
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
                            <h6 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
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
                            <h6 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
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
                          <h6 className="text-sm font-semibold text-blue-200 mb-3 flex items-center gap-2">
                            <span>🧑‍🤝‍🧑</span> Component Auditors
                          </h6>
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
                          {Array.isArray(data.annualReport.auditInformation.consolidationScope.componentAuditors.firms) && 
                           data.annualReport.auditInformation.consolidationScope.componentAuditors.firms.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-600/30">
                              <p className="text-xs text-slate-400 mb-2">Audit Firms:</p>
                              <div className="flex flex-wrap gap-2">
                                {data.annualReport.auditInformation.consolidationScope.componentAuditors.firms.map((firm: any, idx: number) => (
                                  <span key={idx} className="text-xs bg-cyan-500/20 px-3 py-1 rounded-full text-cyan-200 border border-cyan-500/30">
                                    {safeString(firm)}
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

            {/* Detailed Cash Flow Statement from Annual Report */}
            {data.annualReport?.cashFlow && (
              <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/20 rounded-2xl p-5 border border-cyan-500/30 mb-6">
                <h4 className="text-base font-bold text-cyan-300 mb-4 flex items-center gap-2">
                  <span className="text-xl">💰</span> 
                  Consolidated Cash Flow Statement
                  {data.annualReport.cashFlow.reconciliation?.validationPassed ? (
                    <span className="ml-2 text-xs bg-green-500/20 px-2 py-1 rounded-full border border-green-500/40">
                      ✓ Validated
                    </span>
                  ) : (
                    <span className="ml-2 text-xs bg-yellow-500/20 px-2 py-1 rounded-full border border-yellow-500/40">
                      ⚠ {data.annualReport.cashFlow.reconciliation?.validationError || "Check Required"}
                    </span>
                  )}
                </h4>
                {/* Three-Column Layout - Operating, Investing, Financing */}
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  {/* Operating Activities */}
                  <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/20">
                    <h5 className="text-sm font-semibold text-green-300 mb-3 flex items-center gap-2">
                      🔄 Operating Activities
                    </h5>
                    <div className="space-y-2 text-xs">
                      {data.annualReport.cashFlow.operatingActivities?.netCashFromOperating && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Net Cash from Operating:</span>
                          <span className="text-white font-semibold">
                            ₹{renderValue(data.annualReport.cashFlow.operatingActivities.netCashFromOperating.current)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.operatingActivities?.cashGeneratedFromOperations && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Cash Generated:</span>
                          <span className="text-gray-300">
                            ₹{renderValue(data.annualReport.cashFlow.operatingActivities.cashGeneratedFromOperations.current)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.operatingActivities?.taxesPaid && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Taxes Paid:</span>
                          <span className="text-red-300">
                            ₹{renderValue(data.annualReport.cashFlow.operatingActivities.taxesPaid.current)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.yoyComparison?.operatingCashFlow?.changePercent && (
                        <div className={`mt-2 pt-2 border-t border-green-500/20 ${
                          data.annualReport.cashFlow.yoyComparison.operatingCashFlow.changePercent > 0 
                            ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {data.annualReport.cashFlow.yoyComparison.operatingCashFlow.changePercent > 0 ? '↑' : '↓'} 
                          {Math.abs(data.annualReport.cashFlow.yoyComparison.operatingCashFlow.changePercent)}% YoY
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Investing Activities */}
                  <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-500/20">
                    <h5 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
                      💼 Investing Activities
                    </h5>
                    <div className="space-y-2 text-xs">
                      {data.annualReport.cashFlow.investingActivities?.totalCapex && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Total Capex:</span>
                          <span className="text-white font-semibold">
                            ₹{Math.abs(Number(renderValue(data.annualReport.cashFlow.investingActivities.totalCapex.current)) || 0)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.investingActivities?.capexPPE && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">• PPE:</span>
                          <span className="text-gray-300">
                            ₹{Math.abs(Number(renderValue(data.annualReport.cashFlow.investingActivities.capexPPE.current)) || 0)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.investingActivities?.capexIntangibles && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">• Intangibles:</span>
                          <span className="text-gray-300">
                            ₹{Math.abs(Number(renderValue(data.annualReport.cashFlow.investingActivities.capexIntangibles.current)) || 0)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.investingActivities?.netCashFromInvesting && (
                        <div className="flex justify-between mt-2 pt-2 border-t border-blue-500/20">
                          <span className="text-gray-400">Net Cash:</span>
                          <span className="text-white font-semibold">
                            ₹{renderValue(data.annualReport.cashFlow.investingActivities.netCashFromInvesting.current)} Cr
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Financing Activities */}
                  <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-500/20">
                    <h5 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
                      🏦 Financing Activities
                    </h5>
                    <div className="space-y-2 text-xs">
                      {data.annualReport.cashFlow.financingActivities?.dividendsPaid && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Dividends Paid:</span>
                          <span className="text-white font-semibold">
                            ₹{Math.abs(Number(renderValue(data.annualReport.cashFlow.financingActivities.dividendsPaid.current)) || 0)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.financingActivities?.interestPaid && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Interest Paid:</span>
                          <span className="text-gray-300">
                            ₹{Math.abs(Number(renderValue(data.annualReport.cashFlow.financingActivities.interestPaid.current)) || 0)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.financingActivities?.netBorrowingChange && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Net Borrowing Change:</span>
                          <span className="text-gray-300">
                            ₹{renderValue(data.annualReport.cashFlow.financingActivities.netBorrowingChange.current)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.financingActivities?.netCashFromFinancing && (
                        <div className="flex justify-between mt-2 pt-2 border-t border-purple-500/20">
                          <span className="text-gray-400">Net Cash:</span>
                          <span className="text-white font-semibold">
                            ₹{renderValue(data.annualReport.cashFlow.financingActivities.netCashFromFinancing.current)} Cr
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {data.annualReport.cashFlow.derivedMetrics?.freeCashFlow && (
                    <div className="bg-gray-800/40 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">Free Cash Flow</div>
                      <div className="text-xl font-bold text-green-400">
                        ₹{renderValue(data.annualReport.cashFlow.derivedMetrics.freeCashFlow.current)} Cr
                      </div>
                      {data.annualReport.cashFlow.yoyComparison?.freeCashFlow?.changePercent && (
                        <div className={`text-xs mt-1 ${
                          data.annualReport.cashFlow.yoyComparison.freeCashFlow.changePercent > 0 
                            ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {data.annualReport.cashFlow.yoyComparison.freeCashFlow.changePercent > 0 ? '↑' : '↓'} 
                          {Math.abs(data.annualReport.cashFlow.yoyComparison.freeCashFlow.changePercent)}% YoY
                        </div>
                      )}
                    </div>
                  )}
                  {data.annualReport.cashFlow.derivedMetrics?.cashConversionRatio && (
                    <div className="bg-gray-800/40 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">Cash Conversion</div>
                      <div className="text-xl font-bold text-blue-400">
                        {renderValue(data.annualReport.cashFlow.derivedMetrics.cashConversionRatio.current)}%
                      </div>
                    </div>
                  )}
                  {data.annualReport.cashFlow.healthIndicators?.cashFlowQuality && (
                    <div className="bg-gray-800/40 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">CF Quality</div>
                      <div className={`text-lg font-bold ${
                        data.annualReport.cashFlow.healthIndicators.cashFlowQuality === 'Excellent' ? 'text-green-400' :
                        data.annualReport.cashFlow.healthIndicators.cashFlowQuality === 'Good' ? 'text-blue-400' :
                        'text-yellow-400'
                      }`}>
                        {renderValue(data.annualReport.cashFlow.healthIndicators.cashFlowQuality)}
                      </div>
                    </div>
                  )}
                  {data.annualReport.cashFlow.reconciliation?.closingCash && (
                    <div className="bg-gray-800/40 rounded-lg p-3">
                      <div className="text-xs text-gray-400 mb-1">Closing Cash</div>
                      <div className="text-xl font-bold text-white">
                        ₹{renderValue(data.annualReport.cashFlow.reconciliation.closingCash.current)} Cr
                      </div>
                      {data.annualReport.cashFlow.yoyComparison?.closingCash?.changePercent && (
                        <div className={`text-xs mt-1 ${
                          data.annualReport.cashFlow.yoyComparison.closingCash.changePercent > 0 
                            ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {data.annualReport.cashFlow.yoyComparison.closingCash.changePercent > 0 ? '↑' : '↓'} 
                          {Math.abs(data.annualReport.cashFlow.yoyComparison.closingCash.changePercent)}% YoY
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Working Capital Changes - Expandable */}
                {data.annualReport.cashFlow.workingCapitalChanges && (
                  <details className="bg-gray-800/30 rounded-lg p-3 mb-4">
                    <summary className="cursor-pointer text-sm font-semibold text-cyan-300 flex items-center gap-2">
                      📊 Working Capital Changes
                    </summary>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {data.annualReport.cashFlow.workingCapitalChanges.inventoryChange && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Inventory:</span>
                          <span className="text-white">
                            ₹{renderValue(data.annualReport.cashFlow.workingCapitalChanges.inventoryChange.current)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.workingCapitalChanges.receivablesChange && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Receivables:</span>
                          <span className="text-white">
                            ₹{renderValue(data.annualReport.cashFlow.workingCapitalChanges.receivablesChange.current)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.workingCapitalChanges.payablesChange && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Payables:</span>
                          <span className="text-white">
                            ₹{renderValue(data.annualReport.cashFlow.workingCapitalChanges.payablesChange.current)} Cr
                          </span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.workingCapitalChanges.otherWCChanges && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Other WC:</span>
                          <span className="text-white">
                            ₹{renderValue(data.annualReport.cashFlow.workingCapitalChanges.otherWCChanges.current)} Cr
                          </span>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* Health Indicators */}
                {data.annualReport.cashFlow.healthIndicators && (
                  <div className="bg-gray-800/30 rounded-lg p-3 mb-4">
                    <h5 className="text-sm font-semibold text-cyan-300 mb-2">Health Indicators</h5>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      {data.annualReport.cashFlow.healthIndicators.isOperatingCFPositive !== null && (
                        <div className="flex items-center gap-2">
                          <span className={data.annualReport.cashFlow.healthIndicators.isOperatingCFPositive ? 'text-green-400' : 'text-red-400'}>
                            {data.annualReport.cashFlow.healthIndicators.isOperatingCFPositive ? '✓' : '✗'}
                          </span>
                          <span className="text-gray-400">Operating CF Positive</span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.healthIndicators.isFreeCFPositive !== null && (
                        <div className="flex items-center gap-2">
                          <span className={data.annualReport.cashFlow.healthIndicators.isFreeCFPositive ? 'text-green-400' : 'text-red-400'}>
                            {data.annualReport.cashFlow.healthIndicators.isFreeCFPositive ? '✓' : '✗'}
                          </span>
                          <span className="text-gray-400">Free CF Positive</span>
                        </div>
                      )}
                      {data.annualReport.cashFlow.healthIndicators.workingCapitalTrend && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">WC Trend:</span>
                          <span className={
                            data.annualReport.cashFlow.healthIndicators.workingCapitalTrend === 'Improving' ? 'text-green-400' :
                            data.annualReport.cashFlow.healthIndicators.workingCapitalTrend === 'Deteriorating' ? 'text-red-400' :
                            'text-yellow-400'
                          }>
                            {renderValue(data.annualReport.cashFlow.healthIndicators.workingCapitalTrend)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Summary Paragraph */}
                {data.annualReport.cashFlow.summary && (
                  <div className="bg-gray-800/30 rounded-lg p-4">
                    <h5 className="text-sm font-semibold text-cyan-300 mb-2">Analysis</h5>
                    <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                      {data.annualReport.cashFlow.summary}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quarterly Report Insights - From HTML Table */}
      {data.quarterlyReport && (
        <div className="bg-gradient-to-br from-teal-900/40 to-cyan-900/40 rounded-xl p-6 border border-teal-500/30 backdrop-blur-md mt-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              <span className="text-3xl">📊</span>
              Quarterly Results Analysis - {data.quarterlyReport.quarter}
              {data.quarterlyReport.fromCache && (
                <span className="text-xs bg-teal-600/30 text-teal-300 px-2 py-1 rounded-full">
                  Cached
                </span>
              )}
              {data.quarterlyReport.source && (
                <span className="text-xs text-gray-400 bg-gray-800/30 px-2 py-1 rounded-full">
                  {data.quarterlyReport.source}
                </span>
              )}
            </h3>
            
            {/* Force Refresh Button for Quarterly */}
            <button
              onClick={async () => {
                setIsRefreshingReport(true);
                try {
                  const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      query: `${data.symbol} stock price`,
                      model: 'Sonar',
                      forceRefreshQuarterly: true
                    })
                  });
                  if (response.ok) {
                    window.location.reload();
                  } else {
                    alert('Failed to refresh quarterly report. Please try again.');
                  }
                } catch (error) {
                  console.error('Error refreshing quarterly report:', error);
                  alert('Error refreshing quarterly report. Please try again.');
                } finally {
                  setIsRefreshingReport(false);
                }
              }}
              disabled={isRefreshingReport}
              className="px-3 py-2 bg-teal-600/80 hover:bg-teal-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-lg"
              title="Force refresh quarterly report (bypasses 90-day cache)"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingReport ? 'animate-spin' : ''}`} />
              <span>{isRefreshingReport ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          <div className="space-y-6">
            {/* Executive Summary */}
            {data.quarterlyReport.summary && (
              <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 rounded-lg p-4 border border-indigo-500/30">
                <h4 className="text-lg font-semibold text-indigo-300 mb-2 flex items-center gap-2">
                  <span className="text-xl">📝</span> Executive Summary
                </h4>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                  {data.quarterlyReport.summary}
                </p>
              </div>
            )}

            {/* Key Metrics Grid - Latest Quarter */}
            {data.quarterlyReport.keyMetrics && (
              <div className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 rounded-lg p-4 border border-blue-500/20">
                <h4 className="text-lg font-semibold text-blue-300 mb-4 flex items-center gap-2">
                  <span className="text-xl">💰</span> Latest Quarter Financial Metrics
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Revenue */}
                  {data.quarterlyReport.keyMetrics.revenue && (
                    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                      <div className="text-xs text-gray-400 mb-1">Sales / Revenue</div>
                      <div className="text-xl font-bold text-white">
                        ₹{data.quarterlyReport.keyMetrics.revenue.value} Cr
                      </div>
                      {data.quarterlyReport.keyMetrics.revenue.yoyGrowth !== null && (
                        <div className={`text-xs mt-1 font-semibold ${
                          data.quarterlyReport.keyMetrics.revenue.yoyGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          YoY: {data.quarterlyReport.keyMetrics.revenue.yoyGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.revenue.yoyGrowth).toFixed(2)}%
                        </div>
                      )}
                      {data.quarterlyReport.keyMetrics.revenue.qoqGrowth !== null && (
                        <div className={`text-xs font-semibold ${
                          data.quarterlyReport.keyMetrics.revenue.qoqGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          QoQ: {data.quarterlyReport.keyMetrics.revenue.qoqGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.revenue.qoqGrowth).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  )}

                  {/* Net Profit */}
                  {data.quarterlyReport.keyMetrics.netProfit && (
                    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                      <div className="text-xs text-gray-400 mb-1">Net Profit</div>
                      <div className="text-xl font-bold text-white">
                        ₹{data.quarterlyReport.keyMetrics.netProfit.value} Cr
                      </div>
                      {data.quarterlyReport.keyMetrics.netProfit.yoyGrowth !== null && (
                        <div className={`text-xs mt-1 font-semibold ${
                          data.quarterlyReport.keyMetrics.netProfit.yoyGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          YoY: {data.quarterlyReport.keyMetrics.netProfit.yoyGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.netProfit.yoyGrowth).toFixed(2)}%
                        </div>
                      )}
                      {data.quarterlyReport.keyMetrics.netProfit.qoqGrowth !== null && (
                        <div className={`text-xs font-semibold ${
                          data.quarterlyReport.keyMetrics.netProfit.qoqGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          QoQ: {data.quarterlyReport.keyMetrics.netProfit.qoqGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.netProfit.qoqGrowth).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  )}

                  {/* Operating Profit */}
                  {data.quarterlyReport.keyMetrics.operatingProfit && (
                    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                      <div className="text-xs text-gray-400 mb-1">Operating Profit</div>
                      <div className="text-xl font-bold text-white">
                        ₹{data.quarterlyReport.keyMetrics.operatingProfit.value} Cr
                      </div>
                      {data.quarterlyReport.keyMetrics.operatingProfit.yoyGrowth !== null && (
                        <div className={`text-xs mt-1 font-semibold ${
                          data.quarterlyReport.keyMetrics.operatingProfit.yoyGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          YoY: {data.quarterlyReport.keyMetrics.operatingProfit.yoyGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.operatingProfit.yoyGrowth).toFixed(2)}%
                        </div>
                      )}
                      {data.quarterlyReport.keyMetrics.operatingProfit.qoqGrowth !== null && (
                        <div className={`text-xs font-semibold ${
                          data.quarterlyReport.keyMetrics.operatingProfit.qoqGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          QoQ: {data.quarterlyReport.keyMetrics.operatingProfit.qoqGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.operatingProfit.qoqGrowth).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  )}

                  {/* EPS */}
                  {data.quarterlyReport.keyMetrics.eps && (
                    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                      <div className="text-xs text-gray-400 mb-1">EPS (₹)</div>
                      <div className="text-xl font-bold text-white">
                        ₹{data.quarterlyReport.keyMetrics.eps.value}
                      </div>
                      {data.quarterlyReport.keyMetrics.eps.yoyGrowth !== null && (
                        <div className={`text-xs mt-1 font-semibold ${
                          data.quarterlyReport.keyMetrics.eps.yoyGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          YoY: {data.quarterlyReport.keyMetrics.eps.yoyGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.eps.yoyGrowth).toFixed(2)}%
                        </div>
                      )}
                      {data.quarterlyReport.keyMetrics.eps.qoqGrowth !== null && (
                        <div className={`text-xs font-semibold ${
                          data.quarterlyReport.keyMetrics.eps.qoqGrowth >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          QoQ: {data.quarterlyReport.keyMetrics.eps.qoqGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.quarterlyReport.keyMetrics.eps.qoqGrowth).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Margin Metrics */}
                {(data.quarterlyReport.financialRatios?.operatingMargin || data.quarterlyReport.financialRatios?.netMargin) && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                    {data.quarterlyReport.financialRatios.operatingMargin !== null && (
                      <div className="bg-gray-800/40 rounded-lg p-3">
                        <div className="text-xs text-gray-400">Operating Margin (OPM)</div>
                        <div className="text-2xl font-bold text-blue-400">
                          {data.quarterlyReport.financialRatios.operatingMargin}%
                        </div>
                      </div>
                    )}
                    {data.quarterlyReport.financialRatios.netMargin !== null && (
                      <div className="bg-gray-800/40 rounded-lg p-3">
                        <div className="text-xs text-gray-400">Net Margin</div>
                        <div className="text-2xl font-bold text-green-400">
                          {data.quarterlyReport.financialRatios.netMargin}%
                        </div>
                      </div>
                    )}
                    {data.quarterlyReport.financialRatios.taxRate !== null && (
                      <div className="bg-gray-800/40 rounded-lg p-3">
                        <div className="text-xs text-gray-400">Tax Rate</div>
                        <div className="text-2xl font-bold text-yellow-400">
                          {data.quarterlyReport.financialRatios.taxRate}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Management Commentary */}
            {data.quarterlyReport.managementCommentary && (
              <div className="bg-gradient-to-br from-orange-900/20 to-amber-900/20 rounded-lg p-5 border border-orange-500/20">
                <h4 className="text-base font-bold text-orange-300 mb-4 flex items-center gap-2">
                  <span className="text-xl">💬</span>
                  Management Commentary
                </h4>
                
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Business Highlights */}
                  {data.quarterlyReport.managementCommentary.businessHighlights && 
                   data.quarterlyReport.managementCommentary.businessHighlights.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold text-green-400 mb-2">✅ Highlights</h5>
                      <ul className="space-y-1.5">
                        {data.quarterlyReport.managementCommentary.businessHighlights.map((item: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-300">• {safeString(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Challenges */}
                  {data.quarterlyReport.managementCommentary.challenges && 
                   data.quarterlyReport.managementCommentary.challenges.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold text-red-400 mb-2">⚠️ Challenges</h5>
                      <ul className="space-y-1.5">
                        {data.quarterlyReport.managementCommentary.challenges.map((item: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-300">• {safeString(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Opportunities */}
                  {data.quarterlyReport.managementCommentary.opportunities && 
                   data.quarterlyReport.managementCommentary.opportunities.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold text-blue-400 mb-2">🚀 Opportunities</h5>
                      <ul className="space-y-1.5">
                        {data.quarterlyReport.managementCommentary.opportunities.map((item: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-300">• {safeString(item)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Future Guidance */}
                   {data.quarterlyReport.managementCommentary.futureGuidance && (
                    <div>
                      <h5 className="text-sm font-semibold text-purple-400 mb-2">🎯 Future Guidance</h5>
                      <div className="space-y-1.5 text-xs text-gray-300">
                        {/* Handle ARRAY format (from Screener quarterly data) */}
                        {Array.isArray(data.quarterlyReport.managementCommentary.futureGuidance) ? (
                          data.quarterlyReport.managementCommentary.futureGuidance.map((item: any, idx: number) => (
                            <div key={idx}>• {safeString(item)}</div>
                          ))
                        ) : (
                          /* Handle OBJECT format (from earnings call transcript) */
                          <>
                            {data.quarterlyReport.managementCommentary.futureGuidance.revenueTarget && (
                              <div>• <span className="text-gray-400">Revenue Target:</span> {data.quarterlyReport.managementCommentary.futureGuidance.revenueTarget}</div>
                            )}
                            {data.quarterlyReport.managementCommentary.futureGuidance.marginOutlook && (
                              <div>• <span className="text-gray-400">Margin Outlook:</span> {data.quarterlyReport.managementCommentary.futureGuidance.marginOutlook}</div>
                            )}
                            {data.quarterlyReport.managementCommentary.futureGuidance.capexPlan && (
                              <div>• <span className="text-gray-400">CAPEX Plan:</span> {data.quarterlyReport.managementCommentary.futureGuidance.capexPlan}</div>
                            )}
                            {data.quarterlyReport.managementCommentary.futureGuidance.orderInflowTarget && (
                              <div>• <span className="text-gray-400">Order Inflow Target:</span> {data.quarterlyReport.managementCommentary.futureGuidance.orderInflowTarget}</div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Segment Performance - Inferred from metrics */}
            {data.quarterlyReport.segmentPerformance && 
             data.quarterlyReport.segmentPerformance.length > 0 && (
              <div className="bg-gradient-to-br from-cyan-900/20 to-teal-900/20 rounded-lg p-4 border border-cyan-500/20">
                <h4 className="text-lg font-semibold text-cyan-300 mb-4 flex items-center gap-2">
                  <span className="text-xl">🏢</span> Segment-wise Performance
                </h4>
                <div className="space-y-3">
                  {data.quarterlyReport.segmentPerformance.map((segment: any, idx: number) => (
                    <div key={idx} className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-sm font-semibold text-white mb-2">{segment.segment}</h5>
                        {segment.growth && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            parseFloat(segment.growth) >= 0 ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
                          }`}>
                            {segment.growth}
                          </span>
                        )}
                      </div>
                      {segment.commentary && (
                        <p className="text-xs text-gray-300 mt-2">{segment.commentary}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outlook & Competitive Position */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Outlook */}
              {data.quarterlyReport.outlook && (
                <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-lg p-4 border border-indigo-500/20">
                  <h5 className="text-base font-semibold text-indigo-300 mb-3 flex items-center gap-2">
                    <span className="text-lg">🔮</span> Forward Outlook
                  </h5>
                  
                  {data.quarterlyReport.outlook.sentiment && (
                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3 ${
                      data.quarterlyReport.outlook.sentiment === 'Positive' ? 'bg-green-900/40 text-green-300 border border-green-500/30' :
                      data.quarterlyReport.outlook.sentiment === 'Negative' ? 'bg-red-900/40 text-red-300 border border-red-500/30' :
                      'bg-yellow-900/40 text-yellow-300 border border-yellow-500/30'
                    }`}>
                      {data.quarterlyReport.outlook.sentiment}
                      {data.quarterlyReport.outlook.confidenceLevel && ` • ${data.quarterlyReport.outlook.confidenceLevel} Confidence`}
                    </div>
                  )}

                  {data.quarterlyReport.outlook.seasonality && (
                    <div className="bg-gray-800/30 rounded-lg p-2 mb-3">
                      <div className="text-xs text-gray-400">Seasonality Insight:</div>
                      <div className="text-xs text-gray-300 mt-1">{data.quarterlyReport.outlook.seasonality}</div>
                    </div>
                  )}

                  {data.quarterlyReport.outlook.nextQuarterExpectation && (
                    <div className="bg-gray-800/30 rounded-lg p-2 mb-3">
                      <div className="text-xs text-indigo-400">Next Quarter (Q+1):</div>
                      <div className="text-xs text-gray-300 mt-1">{data.quarterlyReport.outlook.nextQuarterExpectation}</div>
                    </div>
                  )}

                  {data.quarterlyReport.outlook.keyDrivers && data.quarterlyReport.outlook.keyDrivers.length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs text-gray-400 mb-1">Key Drivers:</div>
                      <ul className="mt-1 space-y-1">
                        {data.quarterlyReport.outlook.keyDrivers.map((driver: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-300 flex items-start gap-1">
                            <span className="text-indigo-400">▸</span>
                            <span>{safeString(driver)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.quarterlyReport.outlook.risks && data.quarterlyReport.outlook.risks.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Risks:</div>
                      <ul className="space-y-1">
                        {data.quarterlyReport.outlook.risks.map((risk: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-300 flex items-start gap-1">
                            <span className="text-red-400">⚠</span>
                            <span>{safeString(risk)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Competitive Position */}
              {data.quarterlyReport.competitivePosition && (
                <div className="bg-gradient-to-br from-amber-900/20 to-yellow-900/20 rounded-lg p-4 border border-amber-500/20">
                  <h5 className="text-base font-semibold text-amber-300 mb-3 flex items-center gap-2">
                    <span className="text-lg">🏆</span> Competitive Position
                  </h5>

                  {data.quarterlyReport.competitivePosition.operatingLeverage && (
                    <div className="bg-gray-800/30 rounded-lg p-2 mb-3">
                      <div className="text-xs text-amber-400">Operating Leverage:</div>
                      <div className="text-xs text-gray-300 mt-1">{data.quarterlyReport.competitivePosition.operatingLeverage}</div>
                    </div>
                  )}

                  {data.quarterlyReport.competitivePosition.competitiveAdvantages && 
                   data.quarterlyReport.competitivePosition.competitiveAdvantages.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-400 mb-1">Competitive Advantages</div>
                      <ul className="space-y-1">
                        {data.quarterlyReport.competitivePosition.competitiveAdvantages.map((advantage: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-300">• {safeString(advantage)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.quarterlyReport.competitivePosition.industryTrends && 
                   data.quarterlyReport.competitivePosition.industryTrends.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Industry Trends</div>
                      <ul className="space-y-1">
                        {data.quarterlyReport.competitivePosition.industryTrends.map((trend: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-300">• {safeString(trend)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
  );
}
