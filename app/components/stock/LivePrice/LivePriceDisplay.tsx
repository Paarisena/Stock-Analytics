"use client";

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useLivePrice } from '../hooks/useLivePrice';
import MetricsGrid from './MetricsGrid';

const priceFlash = {
  initial: { scale: 1 },
  flash: { 
    scale: [1, 1.05, 1],
    transition: { duration: 0.3 }
  }
};

interface LivePriceDisplayProps {
  symbol: string;
  initialPrice: number;
  currency: string;
  previousClose: number;
  isLive: boolean;
}

const getCurrencySymbol = (curr: string): string => {
  const symbols: Record<string, string> = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥',
    'INR': '₹', 'KRW': '₩', 'AUD': 'A$', 'CAD': 'C$', 'CHF': 'Fr',
    'HKD': 'HK$', 'SGD': 'S$', 'RUB': '₽', 'BRL': 'R$', 'MXN': 'MX$',
  };
  return symbols[curr.toUpperCase()] || curr;
};

const formatPrice = (price: number, curr: string): string => {
  if (['JPY', 'KRW'].includes(curr.toUpperCase())) {
    return price.toFixed(0);
  }
  return price.toFixed(2);
};

export default function LivePriceDisplay({ 
  symbol, 
  initialPrice, 
  currency, 
  previousClose,
  isLive 
}: LivePriceDisplayProps) {
  const { 
    livePrice, 
    priceChange, 
    isPriceIncreasing, 
    volume, 
    dayHigh, 
    dayLow,
    marketState 
  } = useLivePrice({ symbol, initialPrice, isLive });

  const currencySymbol = getCurrencySymbol(currency);
  const changePercent = ((priceChange / initialPrice) * 100).toFixed(2);

  return (
    <motion.div 
      className="mb-4 sm:mb-6 relative"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className={`absolute inset-0 ${isPriceIncreasing ? 'bg-green-500/10' : 'bg-red-500/10'} rounded-2xl backdrop-blur-sm transition-all duration-300`}></div>
      <div className="relative p-4 sm:p-6 bg-gradient-to-br from-slate-900/50 to-slate-800/50 rounded-2xl border border-slate-700/50 hover:border-cyan-500/40 transition-all duration-300">
        
        {/* Desktop: Price on left, Metrics on right */}
        <div className="hidden lg:flex gap-6">
          {/* Live Price Panel */}
          <div className="flex-1">
            <motion.div 
              className="text-4xl sm:text-5xl font-bold text-white mb-2 transition-all duration-300 tracking-tight"
              animate={isPriceIncreasing !== undefined ? "flash" : "initial"}
              variants={priceFlash}
              key={livePrice}
            >
              {currencySymbol}{formatPrice(livePrice, currency)}
            </motion.div>
            <div className={`text-base sm:text-lg font-semibold mb-3 ${isPriceIncreasing ? 'text-green-400' : 'text-red-400'}`}>
              {isPriceIncreasing ? <TrendingUp className="inline w-5 h-5 mr-1" /> : <TrendingDown className="inline w-5 h-5 mr-1" />}
              {priceChange >= 0 ? '+' : ''}{currencySymbol}{priceChange.toFixed(2)} ({priceChange >= 0 ? '+' : ''}{changePercent}%)
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
                marketState === 'REGULAR' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                <div className={`w-2 h-2 rounded-full ${marketState === 'REGULAR' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-xs font-semibold">{marketState === 'REGULAR' ? 'OPEN' : 'CLOSED'}</span>
              </div>
              <div className="text-xs text-gray-400 px-2 py-1 bg-slate-800/50 rounded-lg">
                {symbol}
              </div>
              <div className="text-xs text-gray-400 px-2 py-1 bg-slate-800/50 rounded-lg">
                {currency}
              </div>
              <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                isPriceIncreasing 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {isPriceIncreasing ? '↑ UP' : '↓ DOWN'}
              </div>
            </div>
          </div>

          {/* Metrics Grid on Right */}
          <MetricsGrid
            volume={volume}
            dayHigh={dayHigh}
            dayLow={dayLow}
            previousClose={previousClose}
            currency={currency}
          />
        </div>

        {/* Mobile/Tablet: Original Stacked Layout */}
        <div className="lg:hidden">
          <motion.div 
            className="text-4xl sm:text-5xl font-bold text-white mb-2 transition-all duration-300 tracking-tight"
            animate={isPriceIncreasing !== undefined ? "flash" : "initial"}
            variants={priceFlash}
            key={livePrice}
          >
            {currencySymbol}{formatPrice(livePrice, currency)}
          </motion.div>
          <div className={`text-base sm:text-lg font-semibold mb-3 ${isPriceIncreasing ? 'text-green-400' : 'text-red-400'}`}>
            {isPriceIncreasing ? <TrendingUp className="inline w-5 h-5 mr-1" /> : <TrendingDown className="inline w-5 h-5 mr-1" />}
            {priceChange >= 0 ? '+' : ''}{currencySymbol}{priceChange.toFixed(2)} ({priceChange >= 0 ? '+' : ''}{changePercent}%)
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${
              marketState === 'REGULAR' 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${marketState === 'REGULAR' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="text-xs font-semibold">{marketState === 'REGULAR' ? 'OPEN' : 'CLOSED'}</span>
            </div>
            <div className="text-xs text-gray-400 px-2 py-1 bg-slate-800/50 rounded-lg">
              {symbol}
            </div>
            <div className="text-xs text-gray-400 px-2 py-1 bg-slate-800/50 rounded-lg">
              {currency}
            </div>
            <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${
              isPriceIncreasing 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {isPriceIncreasing ? '↑ UP' : '↓ DOWN'}
            </div>
          </div>

          {/* Metrics Grid Below on Mobile */}
          <div className="mt-4">
            <MetricsGrid
              volume={volume}
              dayHigh={dayHigh}
              dayLow={dayLow}
              previousClose={previousClose}
              currency={currency}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
