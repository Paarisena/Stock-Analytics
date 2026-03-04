'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

// ── Types ──
export interface DeliveryVolumeData {
  /** Current day delivery % (0-100) */
  deliveryPercent: number;
  /** Total traded volume */
  tradedVolume: number;
  /** Delivery volume (shares actually transferred) */
  deliveryVolume: number;
  /** Last 10 days of delivery % for trend */
  history: {
    date: string;
    deliveryPercent: number;
    tradedVolume: number;
    deliveryVolume: number;
  }[];
  /** Average delivery % over the history period */
  avgDeliveryPercent: number;
  /** Data source */
  source?: 'nse_live' | 'estimated';
  /** ML volume/delivery predictions for next 5 days */
  mlVolumePredictions?: {
    volumePredictions: { day: number; volume: number; change_pct: number }[];
    deliveryPredictions: { day: number; delivery_pct: number }[];
    volumeTrend: string;
    deliveryTrend: string;
    confidence: number;
    trainingTimeMs: number;
  } | null;
  /** Gemini qualitative volume reasoning */
  geminiVolumeContext?: {
    volumeOutlook: string;
    direction: string;
    reasoning: string;
    catalysts: string[];
    confidence: string;
  } | null;
}

interface DeliveryVolumeProps {
  data: DeliveryVolumeData;
  symbol: string;
  currencySymbol?: string;
}

// ── Helpers ──
function formatVolume(vol: number): string {
  if (vol >= 1_00_00_000) return `${(vol / 1_00_00_000).toFixed(2)} Cr`;
  if (vol >= 1_00_000) return `${(vol / 1_00_000).toFixed(2)} L`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)} K`;
  return vol.toLocaleString();
}

function getDeliverySignal(pct: number, avg: number): { label: string; color: string; description: string } {
  const ratio = pct / (avg || 1);
  if (pct >= 70 && ratio >= 1.2)
    return { label: 'Strong Accumulation', color: '#22c55e', description: 'High delivery % with above-avg volume — smart money buying' };
  if (pct >= 60 && ratio >= 1.1)
    return { label: 'Accumulation', color: '#4ade80', description: 'Above normal delivery — genuine buying interest' };
  if (pct >= 50)
    return { label: 'Neutral', color: '#eab308', description: 'Average delivery % — no clear signal' };
  if (pct >= 35)
    return { label: 'Trading Activity', color: '#f97316', description: 'Low delivery — mostly intraday speculation' };
  return { label: 'Distribution', color: '#ef4444', description: 'Very low delivery % — traders offloading, no real buying' };
}

// ── Component ──
export default function DeliveryVolume({ data, symbol }: DeliveryVolumeProps) {
  const signal = getDeliverySignal(data.deliveryPercent, data.avgDeliveryPercent);
  const trend = data.history.length >= 3
    ? data.history[data.history.length - 1].deliveryPercent - data.history[0].deliveryPercent
    : 0;

  // Chart data for bar chart
  const chartData = data.history.map((h) => ({
    date: h.date,
    deliveryPct: h.deliveryPercent,
    tradedVol: h.tradedVolume,
    deliveryVol: h.deliveryVolume,
  }));

  return (
    <motion.div
      className="relative bg-gradient-to-br from-indigo-900/25 via-slate-800/30 to-cyan-900/20 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 shadow-lg shadow-indigo-500/5 backdrop-blur-sm hover:border-indigo-500/50 transition-all duration-300"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <h4 className="text-sm font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
          <span className="text-lg">📦</span> Delivery Volume Analysis
          <span className="text-[10px] text-gray-500 font-normal">{symbol}</span>
        </h4>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border`}
          style={{ backgroundColor: `${signal.color}20`, borderColor: `${signal.color}60`, color: signal.color }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: signal.color }}></div>
          {signal.label}
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40">
          <div className="text-[10px] text-gray-400 mb-0.5">Delivery %</div>
          <div className="text-xl font-bold" style={{ color: signal.color }}>
            {data.deliveryPercent.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40">
          <div className="text-[10px] text-gray-400 mb-0.5">Avg Delivery %</div>
          <div className="text-xl font-bold text-gray-200">
            {data.avgDeliveryPercent.toFixed(1)}%
          </div>
        </div>
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40">
          <div className="text-[10px] text-gray-400 mb-0.5">Traded Vol</div>
          <div className="text-lg font-bold text-gray-200">
            {formatVolume(data.tradedVolume)}
          </div>
        </div>
        <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/40">
          <div className="text-[10px] text-gray-400 mb-0.5">10D Trend</div>
          <div className={`text-lg font-bold ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Signal Description */}
      <p className="text-xs text-gray-400 mb-4 italic leading-relaxed">
        {signal.description}
      </p>

      {/* Delivery % Bar Chart — 10 Day Trend */}
      {chartData.length > 0 && (
        <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
          <div className="text-[10px] text-gray-500 mb-2">Delivery % — Last {chartData.length} Days</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                stroke="#4b5563"
                fontSize={9}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#4b5563"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                width={35}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.75rem',
                  color: '#f3f4f6',
                  padding: '8px 12px',
                  fontSize: '11px',
                }}
                formatter={(value: any) => [`${value.toFixed(1)}%`, 'Delivery %']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <ReferenceLine
                y={data.avgDeliveryPercent}
                stroke="#6366f1"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                label={{ value: `Avg: ${data.avgDeliveryPercent.toFixed(0)}%`, fill: '#818cf8', fontSize: 9, position: 'right' }}
              />
              <Bar dataKey="deliveryPct" radius={[4, 4, 0, 0]} maxBarSize={24}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.deliveryPct >= 60 ? '#22c55e' : entry.deliveryPct >= 45 ? '#eab308' : '#ef4444'}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ML Volume Forecast */}
      {data.mlVolumePredictions && (
        <div className="mt-4 bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
          <div className="text-[10px] text-gray-500 mb-2 flex items-center gap-2">
            <span>ML Volume Forecast (Next 5 Days)</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
              data.mlVolumePredictions.volumeTrend === 'increasing' ? 'bg-green-500/20 text-green-400' :
              data.mlVolumePredictions.volumeTrend === 'decreasing' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {data.mlVolumePredictions.volumeTrend}
            </span>
            {data.mlVolumePredictions.deliveryTrend !== 'neutral' && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                data.mlVolumePredictions.deliveryTrend === 'accumulation' ? 'bg-green-500/20 text-green-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {data.mlVolumePredictions.deliveryTrend}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {data.mlVolumePredictions.volumePredictions.map((v, i) => (
              <div key={i} className="bg-gray-900/40 rounded-lg p-2 text-center">
                <div className="text-[9px] text-gray-500">Day {v.day}</div>
                <div className="text-[11px] font-semibold text-gray-200">{formatVolume(v.volume)}</div>
                <div className={`text-[9px] font-semibold ${v.change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {v.change_pct >= 0 ? '+' : ''}{v.change_pct}%
                </div>
                {data.mlVolumePredictions!.deliveryPredictions[i] && (
                  <div className="text-[9px] text-indigo-400 mt-0.5">
                    Del: {data.mlVolumePredictions!.deliveryPredictions[i].delivery_pct}%
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-gray-600 flex items-center gap-2">
            <span>Confidence: {(data.mlVolumePredictions.confidence * 100).toFixed(0)}%</span>
            <span className="text-gray-700">|</span>
            <span>Trained in {data.mlVolumePredictions.trainingTimeMs}ms</span>
          </div>
        </div>
      )}

      {/* Gemini Volume Insight */}
      {data.geminiVolumeContext && (
        <div className="mt-3 bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-xl p-3 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-blue-400 font-semibold">AI Volume Insight</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
              data.geminiVolumeContext.volumeOutlook === 'spike_likely' ? 'bg-green-500/20 text-green-400' :
              data.geminiVolumeContext.volumeOutlook === 'above_average' ? 'bg-emerald-500/20 text-emerald-400' :
              data.geminiVolumeContext.volumeOutlook === 'dry_up_likely' ? 'bg-red-500/20 text-red-400' :
              data.geminiVolumeContext.volumeOutlook === 'below_average' ? 'bg-orange-500/20 text-orange-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {data.geminiVolumeContext.volumeOutlook.replace(/_/g, ' ')}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${
              data.geminiVolumeContext.direction === 'bullish_volume' ? 'text-green-400' :
              data.geminiVolumeContext.direction === 'bearish_volume' ? 'text-red-400' :
              'text-gray-400'
            }`}>
              {data.geminiVolumeContext.direction.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed">{data.geminiVolumeContext.reasoning}</p>
          {data.geminiVolumeContext.catalysts?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.geminiVolumeContext.catalysts.map((c, i) => (
                <span key={i} className="text-[9px] bg-gray-700/40 text-gray-400 px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* What This Means — Educational */}
      <details className="mt-3 group">
        <summary className="cursor-pointer text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 select-none">
          <span className="group-open:rotate-90 transition-transform">&#9654;</span>
          What is Delivery Volume?
        </summary>
        <div className="mt-2 text-[10px] text-gray-500 leading-relaxed space-y-1">
          <p><strong className="text-gray-400">Delivery %</strong> = shares actually transferred to demat accounts / total shares traded.</p>
          <p><strong className="text-green-400">&gt;60%</strong> = Real buying (investors holding) — Bullish signal</p>
          <p><strong className="text-yellow-400">45-60%</strong> = Mixed (some holding, some trading) — Neutral</p>
          <p><strong className="text-red-400">&lt;45%</strong> = Mostly speculation (intraday) — No conviction</p>
        </div>
      </details>

      {/* Source */}
      <div className="mt-3 pt-2 border-t border-gray-700/20 text-[10px] text-gray-600 flex items-center gap-2 flex-wrap">
        <span>Source: {data.source === 'nse_live' ? 'NSE Live API' : data.source === 'estimated' ? 'Volume Estimation' : 'NSE Bhavcopy'}</span>
        {data.mlVolumePredictions && (
          <>
            <span className="text-gray-700">+</span>
            <span>ML Forecast ({data.mlVolumePredictions.trainingTimeMs}ms)</span>
          </>
        )}
        {data.geminiVolumeContext && (
          <>
            <span className="text-gray-700">+</span>
            <span>Gemini AI Context</span>
          </>
        )}
      </div>
    </motion.div>
  );
}
