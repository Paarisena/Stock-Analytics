import { motion } from 'framer-motion';
import { Volume2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

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

interface MetricsGridProps {
  volume: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
  currency: string;
}

const formatNumber = (num: number): string => {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(0);
};

const formatPrice = (price: number, curr: string): string => {
  if (['JPY', 'KRW'].includes(curr.toUpperCase())) {
    return price.toFixed(0);
  }
  return price.toFixed(2);
};

const getCurrencySymbol = (curr: string): string => {
  const symbols: Record<string, string> = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥',
    'INR': '₹', 'KRW': '₩', 'AUD': 'A$', 'CAD': 'C$', 'CHF': 'Fr',
    'HKD': 'HK$', 'SGD': 'S$', 'RUB': '₽', 'BRL': 'R$', 'MXN': 'MX$',
  };
  return symbols[curr.toUpperCase()] || curr;
};

export default function MetricsGrid({ volume, dayHigh, dayLow, previousClose, currency }: MetricsGridProps) {
  const currencySymbol = getCurrencySymbol(currency);

  return (
    <motion.div 
      className="grid grid-cols-2 gap-3 w-full lg:w-[400px]"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Volume */}
      <motion.div 
        className="bg-gradient-to-br from-blue-600/20 to-blue-500/10 rounded-xl p-3 border border-blue-500/30 hover:scale-105 transition-transform duration-300"
        variants={scaleIn}
      >
        <div className="flex items-center gap-2 mb-1">
          <Volume2 className="w-4 h-4 text-blue-400" />
          <span className="text-xs text-gray-400">Volume</span>
        </div>
        <div className="text-lg font-bold text-white">{formatNumber(volume)}</div>
      </motion.div>

      {/* Day High */}
      <motion.div 
        className="bg-gradient-to-br from-green-600/20 to-green-500/10 rounded-xl p-3 border border-green-500/30 hover:scale-105 transition-transform duration-300"
        variants={scaleIn}
      >
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-green-400" />
          <span className="text-xs text-gray-400">Day High</span>
        </div>
        <div className="text-lg font-bold text-white">
          {currencySymbol}{formatPrice(dayHigh, currency)}
        </div>
      </motion.div>

      {/* Day Low */}
      <motion.div 
        className="bg-gradient-to-br from-red-600/20 to-red-500/10 rounded-xl p-3 border border-red-500/30 hover:scale-105 transition-transform duration-300"
        variants={scaleIn}
      >
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-red-400" />
          <span className="text-xs text-gray-400">Day Low</span>
        </div>
        <div className="text-lg font-bold text-white">
          {currencySymbol}{formatPrice(dayLow, currency)}
        </div>
      </motion.div>

      {/* Previous Close */}
      <motion.div 
        className="bg-gradient-to-br from-purple-600/20 to-purple-500/10 rounded-xl p-3 border border-purple-500/30 hover:scale-105 transition-transform duration-300"
        variants={scaleIn}
      >
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-purple-400" />
          <span className="text-xs text-gray-400">Prev Close</span>
        </div>
        <div className="text-lg font-bold text-white">
          {currencySymbol}{formatPrice(previousClose, currency)}
        </div>
      </motion.div>
    </motion.div>
  );
}
