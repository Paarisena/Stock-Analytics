'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend, BarChart, Bar, Cell,
} from 'recharts';

// ── Types ──
export interface FIIDIIData {
  /** FII (Foreign Institutional Investor) data */
  fii: {
    buyValue: number;   // in Crores
    sellValue: number;
    netValue: number;
  };
  /** DII (Domestic Institutional Investor) data */
  dii: {
    buyValue: number;   // in Crores
    sellValue: number;
    netValue: number;
  };
  /** Date of the data */
  date: string;
  /** Last 10 trading days history */
  history: {
    date: string;
    fiiNet: number;
    diiNet: number;
  }[];
  /** Cumulative FII net over history period */
  fiiCumulative: number;
  /** Cumulative DII net over history period */
  diiCumulative: number;
}

interface FIIDIIFlowProps {
  data: FIIDIIData;
  symbol?: string;
}

// ── Helpers ──
function formatCrores(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 100) return `${(val / 1).toFixed(0)} Cr`;
  return `${val.toFixed(1)} Cr`;
}

function getFlowSignal(fiiNet: number, diiNet: number): { label: string; color: string; emoji: string; description: string } {
  if (fiiNet > 500 && diiNet > 500)
    return { label: 'Strong Rally', color: '#22c55e', emoji: '🚀', description: 'Both FII + DII buying aggressively — bullish momentum' };
  if (fiiNet > 200)
    return { label: 'FII Bullish', color: '#3b82f6', emoji: '🌍', description: 'Foreign institutions accumulating — global confidence' };
  if (diiNet > 200 && fiiNet < -200)
    return { label: 'Rotation', color: '#f59e0b', emoji: '🔄', description: 'FII selling but DII absorbing — support forming' };
  if (fiiNet < -500 && diiNet < -200)
    return { label: 'Sell-Off', color: '#ef4444', emoji: '🔻', description: 'Both FII + DII exiting — bearish pressure' };
  if (fiiNet < -500)
    return { label: 'FII Exodus', color: '#ef4444', emoji: '✈️', description: 'Massive FII outflows — risk-off sentiment, global uncertainty' };
  if (diiNet > 300)
    return { label: 'DII Support', color: '#10b981', emoji: '🏦', description: 'Domestic institutions buying the dip — support building' };
  return { label: 'Neutral Flow', color: '#6b7280', emoji: '➡️', description: 'Balanced flows — no strong institutional conviction' };
}

// ── Component ──
export default function FIIDIIFlow({ data, symbol }: FIIDIIFlowProps) {
  const [chartView, setChartView] = useState<'bar' | 'area'>('bar');
  const signal = getFlowSignal(data.fii.netValue, data.dii.netValue);
  const totalNet = data.fii.netValue + data.dii.netValue;

  // Chart data
  const chartData = data.history.map((h) => ({
    date: h.date,
    fii: h.fiiNet,
    dii: h.diiNet,
    total: h.fiiNet + h.diiNet,
  }));

  return (
    <motion.div
      className="relative bg-gradient-to-br from-amber-900/20 via-slate-800/30 to-blue-900/20 border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-lg shadow-amber-500/5 backdrop-blur-sm hover:border-amber-500/50 transition-all duration-300"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <h4 className="text-sm font-bold bg-gradient-to-r from-amber-400 to-blue-400 bg-clip-text text-transparent flex items-center gap-2">
          <span className="text-lg">🏛️</span> FII / DII Cash Flows
          {symbol && <span className="text-[10px] text-gray-500 font-normal">Market-wide</span>}
        </h4>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border`}
            style={{ backgroundColor: `${signal.color}20`, borderColor: `${signal.color}60`, color: signal.color }}>
            <span>{signal.emoji}</span>
            {signal.label}
          </div>
          <span className="text-[10px] text-gray-600">{data.date}</span>
        </div>
      </div>

      {/* FII vs DII Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* FII Card */}
        <div className={`rounded-xl p-3 border transition-all ${
          data.fii.netValue >= 0
            ? 'bg-green-900/20 border-green-500/30'
            : 'bg-red-900/20 border-red-500/30'
        }`}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">🌍</span>
            <span className="text-xs font-semibold text-blue-300">FII (Foreign)</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div>
              <div className="text-[9px] text-gray-500">Buy</div>
              <div className="text-xs font-semibold text-green-400">{formatCrores(data.fii.buyValue)}</div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500">Sell</div>
              <div className="text-xs font-semibold text-red-400">{formatCrores(data.fii.sellValue)}</div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500">Net</div>
              <div className={`text-sm font-bold ${data.fii.netValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.fii.netValue >= 0 ? '+' : ''}{formatCrores(data.fii.netValue)}
              </div>
            </div>
          </div>
        </div>

        {/* DII Card */}
        <div className={`rounded-xl p-3 border transition-all ${
          data.dii.netValue >= 0
            ? 'bg-green-900/20 border-green-500/30'
            : 'bg-red-900/20 border-red-500/30'
        }`}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">🏦</span>
            <span className="text-xs font-semibold text-emerald-300">DII (Domestic)</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div>
              <div className="text-[9px] text-gray-500">Buy</div>
              <div className="text-xs font-semibold text-green-400">{formatCrores(data.dii.buyValue)}</div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500">Sell</div>
              <div className="text-xs font-semibold text-red-400">{formatCrores(data.dii.sellValue)}</div>
            </div>
            <div>
              <div className="text-[9px] text-gray-500">Net</div>
              <div className={`text-sm font-bold ${data.dii.netValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.dii.netValue >= 0 ? '+' : ''}{formatCrores(data.dii.netValue)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Net Summary Bar */}
      <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-gray-400">Total Institutional Net Flow</span>
          <span className={`text-sm font-bold ${totalNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalNet >= 0 ? '+' : ''}{formatCrores(totalNet)}
          </span>
        </div>
        {/* Visual flow bar */}
        <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="w-1/2 bg-gradient-to-r from-red-500/30 to-transparent"></div>
            <div className="w-1/2 bg-gradient-to-r from-transparent to-green-500/30"></div>
          </div>
          <div
            className="absolute top-0 bottom-0 w-1 rounded-full bg-white shadow-lg shadow-white/30 transition-all duration-500"
            style={{
              left: `${Math.min(Math.max(50 + (totalNet / 50), 5), 95)}%`,
            }}
          ></div>
        </div>
        <div className="flex justify-between text-[9px] text-gray-600 mt-1">
          <span>Net Outflow</span>
          <span>Net Inflow</span>
        </div>
      </div>

      {/* Signal Description */}
      <p className="text-xs text-gray-400 mb-4 italic leading-relaxed">
        {signal.description}
      </p>

      {/* Chart Toggle + Chart */}
      <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-gray-500">FII/DII Net — Last {chartData.length} Days (₹ Cr)</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setChartView('bar')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                chartView === 'bar' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-gray-500 border border-transparent'
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setChartView('area')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                chartView === 'area' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-gray-500 border border-transparent'
              }`}
            >
              Area
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={160}>
          {chartView === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis stroke="#4b5563" fontSize={9} tickLine={false} axisLine={false} width={45}
                tickFormatter={(v) => `${v > 0 ? '+' : ''}${(v / 1).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937', border: '1px solid #374151',
                  borderRadius: '0.75rem', color: '#f3f4f6', padding: '8px 12px', fontSize: '11px',
                }}
                formatter={(value: any, name?: string) => {
                  const label = name === 'fii' ? '🌍 FII Net' : name === 'dii' ? '🏦 DII Net' : '📊 Total';
                  return [`${value >= 0 ? '+' : ''}${formatCrores(value)}`, label];
                }}
              />
              <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
              <Bar dataKey="fii" radius={[3, 3, 0, 0]} maxBarSize={16}>
                {chartData.map((entry, index) => (
                  <Cell key={`fii-${index}`} fill={entry.fii >= 0 ? '#3b82f680' : '#ef444480'} />
                ))}
              </Bar>
              <Bar dataKey="dii" radius={[3, 3, 0, 0]} maxBarSize={16}>
                {chartData.map((entry, index) => (
                  <Cell key={`dii-${index}`} fill={entry.dii >= 0 ? '#10b98180' : '#f9731680'} />
                ))}
              </Bar>
              <Legend
                wrapperStyle={{ fontSize: '10px', color: '#9ca3af' }}
                formatter={(value) => value === 'fii' ? '🌍 FII' : '🏦 DII'}
              />
            </BarChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fiiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="diiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis stroke="#4b5563" fontSize={9} tickLine={false} axisLine={false} width={45}
                tickFormatter={(v) => `${v > 0 ? '+' : ''}${(v / 1).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937', border: '1px solid #374151',
                  borderRadius: '0.75rem', color: '#f3f4f6', padding: '8px 12px', fontSize: '11px',
                }}
                formatter={(value: any, name?: string) => {
                  const label = name === 'fii' ? '🌍 FII Net' : name === 'dii' ? '🏦 DII Net' : '📊 Total';
                  return [`${value >= 0 ? '+' : ''}${formatCrores(value)}`, label];
                }}
              />
              <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
              <Area type="monotone" dataKey="fii" stroke="#3b82f6" fill="url(#fiiGrad)" strokeWidth={2} connectNulls />
              <Area type="monotone" dataKey="dii" stroke="#10b981" fill="url(#diiGrad)" strokeWidth={2} connectNulls />
              <Legend
                wrapperStyle={{ fontSize: '10px', color: '#9ca3af' }}
                formatter={(value) => value === 'fii' ? '🌍 FII' : '🏦 DII'}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Cumulative Summary */}
      <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-500">
        <span>
          {data.history.length}D Cumulative: FII{' '}
          <span className={data.fiiCumulative >= 0 ? 'text-green-400' : 'text-red-400'}>
            {data.fiiCumulative >= 0 ? '+' : ''}{formatCrores(data.fiiCumulative)}
          </span>
          {' '}| DII{' '}
          <span className={data.diiCumulative >= 0 ? 'text-green-400' : 'text-red-400'}>
            {data.diiCumulative >= 0 ? '+' : ''}{formatCrores(data.diiCumulative)}
          </span>
        </span>
      </div>

      {/* Educational Details */}
      <details className="mt-3 group">
        <summary className="cursor-pointer text-[10px] text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 select-none">
          <span className="group-open:rotate-90 transition-transform">&#9654;</span>
          What are FII/DII flows?
        </summary>
        <div className="mt-2 text-[10px] text-gray-500 leading-relaxed space-y-1">
          <p><strong className="text-blue-400">FII</strong> = Foreign Institutional Investors (mutual funds, hedge funds, pension funds from abroad)</p>
          <p><strong className="text-emerald-400">DII</strong> = Domestic Institutional Investors (Indian mutual funds, insurance, banks)</p>
          <p><strong className="text-green-400">FII+DII both buying</strong> → Strong rally signal, market-wide bullishness</p>
          <p><strong className="text-yellow-400">FII selling, DII buying</strong> → Support forming, watch for reversal</p>
          <p><strong className="text-red-400">Both selling</strong> → Red flag, broad weakness</p>
          <p className="text-gray-600 mt-1">Note: FII/DII data is market-wide (cash segment), not stock-specific. It indicates overall institutional sentiment.</p>
        </div>
      </details>

      {/* Source */}
      <div className="mt-3 pt-2 border-t border-gray-700/20 text-[10px] text-gray-600 flex items-center gap-2">
        <span>🏛️ Source: NSE / NSDL</span>
        <span className="text-gray-700">•</span>
        <span>Feeds into RF + LR as market regime feature</span>
      </div>
    </motion.div>
  );
}
