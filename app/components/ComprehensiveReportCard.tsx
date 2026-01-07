'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target, BarChart3, FileText, Sparkles, Calendar } from 'lucide-react';
import AnnualReportCard from './AnnualReportCard';

interface ComprehensiveReportCardProps {
  transcriptAnalysis?: {
    quarter: string;
    year: number;
    date: string;
    sentiment: string;
    analysis: string;
    source: string;
    isNewEarnings?: boolean;
  };
  annualReport?: {
    fiscalYear: number | string;
    filingDate?: string;
    reportDate?: string;
    reportUrl?: string;
    strategy?: {
      initiatives?: string[];
      marketPosition?: string;
      chairmanMessage?: string;
      businessOverview?: string;
    };
    capex?: {
      threeYearTotal?: number;
      threeYearPlan?: number;
      breakdown?: Record<string, any>;
      focusAreas?: string[];
      majorProjects?: string[];
      expectedROI?: string;
    };
    risks?: {
      macroeconomic?: string[];
      operational?: string[];
      legal?: string[];
      competitive?: string[];
      business?: string[];
      financial?: string[];
      regulatory?: string[];
      totalCount?: number;
    };
    segments?: Array<{
      name: string;
      revenue: number;
      growth: number;
      margin?: number;
    }>;
    longTermGuidance?: {
      revenueTargets?: string;
      marginTargets?: string;
      marketShareGoals?: string;
    };
    futureOutlook?: {
      growthStrategy?: string;
      marginGoals?: string;
      marketTargets?: string;
    };
    source?: string;
  };
  aiIntelligence?: {
    catalysts?: string[];
    risks?: string[];
    news?: string[];
    socialSentiment?: string;
    overallConfidence?: number;
    recommendation?: string;
    longTermConfidence?: {
      longTermConfidence: number;
      breakdown: {
        technicalTrend?: {
          score: number;
          weight: string;
        };
        fundamentalQuality?: {
          score: number;
          weight: string;
        };
        annualReportQuality?: {
          score: number;
          weight: string;
        };
        aiSentiment?: {
          score: number;
          weight: string;
        };
        analystView?: {
          score: number;
          weight: string;
        };
      };
      recommendation: string;
      investmentHorizon?: string;
    };
  };
  longTermConfidence?: {
    longTermConfidence: number;
    breakdown: {
      technicalTrend?: {
        score: number;
        weight: string;
      };
      fundamentalQuality?: {
        score: number;
        weight: string;
      };
      annualReportQuality?: {
        score: number;
        weight: string;
      };
      aiSentiment?: {
        score: number;
        weight: string;
      };
      analystView?: {
        score: number;
        weight: string;
      };
    };
    recommendation: string;
    investmentHorizon?: string;
  };
}

export default function ComprehensiveReportCard({
  transcriptAnalysis,
  annualReport,
  aiIntelligence,
  longTermConfidence: directLongTermConfidence
}: ComprehensiveReportCardProps) {
  const [expandedSections, setExpandedSections] = useState({
    quarterly: false,
    annual: false,
    prediction: false,
    breakdown: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Parse quarterly highlights and risks from analysis text
  const parseQuarterlyData = () => {
    if (!transcriptAnalysis?.analysis) return { highlights: [], risks: [], guidance: '' };

    const analysis = transcriptAnalysis.analysis;
    
    // Extract HIGHLIGHTS section
    const highlightsMatch = analysis.match(/HIGHLIGHTS?:\s*([\s\S]*?)(?=GUIDANCE|RISKS|SUMMARY|$)/i);
    const highlights = highlightsMatch?.[1]
      ?.split('\n')
      .map(line => line.trim().replace(/^[-•*]\s*/, ''))
      .filter(line => line.length > 10) || [];

    // Extract RISKS section
    const risksMatch = analysis.match(/RISKS?:\s*([\s\S]*?)(?=SUMMARY|$)/i);
    const risks = risksMatch?.[1]
      ?.split('\n')
      .map(line => line.trim().replace(/^[-•*]\s*/, ''))
      .filter(line => line.length > 10) || [];

    // Extract GUIDANCE section
    const guidanceMatch = analysis.match(/GUIDANCE:\s*([\s\S]*?)(?=RISKS|SUMMARY|$)/i);
    const guidance = guidanceMatch?.[1]?.trim() || '';

    return { highlights, risks, guidance };
  };

  // Get all risk factors from annual report
  const getAnnualRisks = () => {
    if (!annualReport?.risks) return [];
    
    const risks = annualReport.risks;
    const allRisks: Array<{ category: string; items: string[] }> = [];

    if (risks.macroeconomic?.length) allRisks.push({ category: 'Macroeconomic', items: risks.macroeconomic });
    if (risks.operational?.length) allRisks.push({ category: 'Operational', items: risks.operational });
    if (risks.legal?.length) allRisks.push({ category: 'Legal/Regulatory', items: risks.legal });
    if (risks.competitive?.length) allRisks.push({ category: 'Competitive', items: risks.competitive });
    if (risks.business?.length) allRisks.push({ category: 'Business', items: risks.business });
    if (risks.financial?.length) allRisks.push({ category: 'Financial', items: risks.financial });
    if (risks.regulatory?.length) allRisks.push({ category: 'Regulatory', items: risks.regulatory });

    return allRisks;
  };

  // Use either direct prop or nested in aiIntelligence
  const longTermConfidence = directLongTermConfidence || aiIntelligence?.longTermConfidence;

  const quarterlyData = parseQuarterlyData();
  const annualRisks = getAnnualRisks();
  
  // Count total data points
  const hasQuarterlyData = transcriptAnalysis?.analysis;
  const hasAnnualData = annualReport?.fiscalYear;
  const hasPredictionData = (aiIntelligence?.catalysts?.length || 0) > 0 || (aiIntelligence?.risks?.length || 0) > 0;
  const hasBreakdownData = longTermConfidence?.breakdown;

  // Don't render if no data
  if (!hasQuarterlyData && !hasAnnualData && !hasPredictionData && !hasBreakdownData) {
    return null;
  }

  return (
    <div className="my-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <FileText className="w-6 h-6 text-blue-400" />
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Comprehensive Investment Report
        </h2>
      </div>

      {/* Quarterly Performance Section */}
      {hasQuarterlyData && (
        <div className="bg-gradient-to-br from-blue-900/20 via-indigo-800/10 to-purple-900/20 backdrop-blur-xl rounded-2xl border border-blue-500/20 shadow-2xl overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('quarterly')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-blue-500/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-blue-400" />
              <div className="text-left">
                <h3 className="text-lg font-semibold text-white">Quarterly Earnings Analysis</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {transcriptAnalysis?.quarter} {transcriptAnalysis?.year} • {transcriptAnalysis?.date}
                  {transcriptAnalysis?.isNewEarnings && (
                    <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
                      🔔 New Earnings
                    </span>
                  )}
                </p>
                {!expandedSections.quarterly && (
                  <p className="text-xs text-gray-500 mt-1">
                    Sentiment: {transcriptAnalysis?.sentiment?.split('-')[0]?.trim()} • 
                    {quarterlyData.highlights.length} Highlights • 
                    {quarterlyData.risks.length} Risks
                  </p>
                )}
              </div>
            </div>
            {expandedSections.quarterly ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {expandedSections.quarterly && (
            <div className="px-6 pb-6 space-y-4">
              {/* Sentiment */}
              <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700/30">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-400 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-1">Overall Sentiment</h4>
                    <p className="text-white">{transcriptAnalysis?.sentiment}</p>
                  </div>
                </div>
              </div>

              {/* Highlights */}
              {quarterlyData.highlights.length > 0 && (
                <div className="p-4 bg-green-900/20 rounded-xl border border-green-500/20">
                  <div className="flex items-start gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                    <h4 className="text-sm font-semibold text-green-300">Key Highlights</h4>
                  </div>
                  <ul className="space-y-2">
                    {quarterlyData.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-green-400 mt-1">🟢</span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Guidance */}
              {quarterlyData.guidance && (
                <div className="p-4 bg-blue-900/20 rounded-xl border border-blue-500/20">
                  <div className="flex items-start gap-2 mb-2">
                    <Target className="w-5 h-5 text-blue-400 mt-0.5" />
                    <h4 className="text-sm font-semibold text-blue-300">Management Guidance</h4>
                  </div>
                  <p className="text-sm text-gray-300">{quarterlyData.guidance}</p>
                </div>
              )}

              {/* Risks */}
              {quarterlyData.risks.length > 0 && (
                <div className="p-4 bg-red-900/20 rounded-xl border border-red-500/20">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                    <h4 className="text-sm font-semibold text-red-300">Concerns & Risks</h4>
                  </div>
                  <ul className="space-y-2">
                    {quarterlyData.risks.map((risk, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-red-400 mt-1">🔴</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-gray-500 text-right">
                Source: {transcriptAnalysis?.source} • Cached 24h
              </p>
            </div>
          )}
        </div>
      )}

      {/* Annual Strategic View Section - Now using separate component */}
      <AnnualReportCard annualReport={annualReport} />

      {/* AI Future Prediction Section */}
      {hasPredictionData && (
        <div className="bg-gradient-to-br from-green-900/20 via-emerald-800/10 to-teal-900/20 backdrop-blur-xl rounded-2xl border border-green-500/20 shadow-2xl overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('prediction')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-green-500/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-green-400" />
              <div className="text-left">
                <h3 className="text-lg font-semibold text-white">AI Future Prediction Analysis</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Catalysts vs Risks • Next 1-6 Months
                </p>
                {!expandedSections.prediction && (
                  <p className="text-xs text-gray-500 mt-1">
                    {aiIntelligence?.catalysts?.length || 0} Positive Catalysts • 
                    {aiIntelligence?.risks?.length || 0} Negative Risks
                    {aiIntelligence?.overallConfidence && (
                      <span className="ml-2">• AI Confidence: {aiIntelligence.overallConfidence}%</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            {expandedSections.prediction ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {expandedSections.prediction && (
            <div className="px-6 pb-6">
              {/* AI Recommendation Header */}
              {aiIntelligence?.recommendation && (
                <div className="mb-4 p-4 bg-gray-800/40 rounded-xl border border-gray-700/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-400">AI Recommendation</p>
                      <p className={`text-xl font-bold ${
                        aiIntelligence.recommendation.includes('BUY') ? 'text-green-400' :
                        aiIntelligence.recommendation === 'HOLD' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {aiIntelligence.recommendation.replace('_', ' ')}
                      </p>
                    </div>
                    {aiIntelligence.overallConfidence && (
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Confidence</p>
                        <p className="text-2xl font-bold text-white">{aiIntelligence.overallConfidence}%</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Two Column: Catalysts vs Risks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Positive Catalysts */}
                <div className="p-4 bg-green-900/20 rounded-xl border border-green-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    <h4 className="text-sm font-semibold text-green-300">
                      Positive Catalysts ({aiIntelligence?.catalysts?.length || 0})
                    </h4>
                  </div>
                  {aiIntelligence?.catalysts && aiIntelligence.catalysts.length > 0 ? (
                    <ul className="space-y-2">
                      {aiIntelligence.catalysts.map((catalyst, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-green-400 mt-1">🟢</span>
                          <span>{catalyst}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No positive catalysts identified</p>
                  )}
                </div>

                {/* Negative Risks */}
                <div className="p-4 bg-red-900/20 rounded-xl border border-red-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-5 h-5 text-red-400" />
                    <h4 className="text-sm font-semibold text-red-300">
                      Negative Risks ({aiIntelligence?.risks?.length || 0})
                    </h4>
                  </div>
                  {aiIntelligence?.risks && aiIntelligence.risks.length > 0 ? (
                    <ul className="space-y-2">
                      {aiIntelligence.risks.map((risk, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-red-400 mt-1">🔴</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No major risks identified</p>
                  )}
                </div>
              </div>

              {/* Recent News */}
              {aiIntelligence?.news && aiIntelligence.news.length > 0 && (
                <div className="mt-4 p-4 bg-blue-900/20 rounded-xl border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <h4 className="text-sm font-semibold text-blue-300">Recent News (Last 7 Days)</h4>
                  </div>
                  <ul className="space-y-2">
                    {aiIntelligence.news.slice(0, 5).map((newsItem, idx) => (
                      <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span>{newsItem}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Social Sentiment */}
              {aiIntelligence?.socialSentiment && (
                <div className="mt-4 p-3 bg-gray-800/40 rounded-xl border border-gray-700/30 text-center">
                  <p className="text-xs text-gray-400">Social Sentiment</p>
                  <p className={`text-lg font-semibold ${
                    aiIntelligence.socialSentiment === 'POSITIVE' ? 'text-green-400' :
                    aiIntelligence.socialSentiment === 'NEGATIVE' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {aiIntelligence.socialSentiment}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confidence Breakdown Section */}
      {hasBreakdownData && (
        <div className="bg-gradient-to-br from-orange-900/20 via-amber-800/10 to-yellow-900/20 backdrop-blur-xl rounded-2xl border border-orange-500/20 shadow-2xl overflow-hidden transition-all duration-300">
          <button
            onClick={() => toggleSection('breakdown')}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-orange-500/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-orange-400" />
              <div className="text-left">
                <h3 className="text-lg font-semibold text-white">Long-term Confidence Breakdown</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Investment Score: {longTermConfidence?.longTermConfidence}% • 
                  {longTermConfidence?.recommendation && ` ${longTermConfidence.recommendation.replace('_', ' ')}`}
                </p>
                {!expandedSections.breakdown && longTermConfidence?.investmentHorizon && (
                  <p className="text-xs text-gray-500 mt-1">
                    Horizon: {longTermConfidence.investmentHorizon}
                  </p>
                )}
              </div>
            </div>
            {expandedSections.breakdown ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {expandedSections.breakdown && (
            <div className="px-6 pb-6 space-y-3">
              {/* Overall Score */}
              <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700/30 text-center">
                <p className="text-sm text-gray-400 mb-1">Overall Investment Score</p>
                <p className="text-4xl font-bold text-white mb-2">{longTermConfidence?.longTermConfidence}%</p>
                <p className={`text-lg font-semibold ${
                  longTermConfidence?.recommendation?.includes('BUY') || 
                  longTermConfidence?.recommendation === 'ACCUMULATE' ? 'text-green-400' :
                  longTermConfidence?.recommendation === 'HOLD' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {longTermConfidence?.recommendation?.replace('_', ' ')}
                </p>
              </div>

              {/* Breakdown Bars */}
              <div className="space-y-3">
                {longTermConfidence?.breakdown.technicalTrend && (
                  <div className="p-3 bg-blue-900/20 rounded-xl border border-blue-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-blue-300">Technical Trend</span>
                      <span className="text-sm text-gray-400">{longTermConfidence.breakdown.technicalTrend.weight}</span>
                    </div>
                    <div className="w-full bg-gray-700/30 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(longTermConfidence.breakdown.technicalTrend.score / 40) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Score: {longTermConfidence.breakdown.technicalTrend.score.toFixed(1)} / 40
                    </p>
                  </div>
                )}

                {longTermConfidence?.breakdown.fundamentalQuality && (
                  <div className="p-3 bg-green-900/20 rounded-xl border border-green-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-green-300">Fundamental Quality</span>
                      <span className="text-sm text-gray-400">{longTermConfidence.breakdown.fundamentalQuality.weight}</span>
                    </div>
                    <div className="w-full bg-gray-700/30 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(longTermConfidence.breakdown.fundamentalQuality.score / 30) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Score: {longTermConfidence.breakdown.fundamentalQuality.score.toFixed(1)} / 30
                    </p>
                  </div>
                )}

                {longTermConfidence?.breakdown.annualReportQuality && (
                  <div className="p-3 bg-purple-900/20 rounded-xl border border-purple-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-purple-300">Annual Report Quality</span>
                      <span className="text-sm text-gray-400">{longTermConfidence.breakdown.annualReportQuality.weight}</span>
                    </div>
                    <div className="w-full bg-gray-700/30 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-purple-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(longTermConfidence.breakdown.annualReportQuality.score / 20) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Score: {longTermConfidence.breakdown.annualReportQuality.score.toFixed(1)} / 20
                    </p>
                  </div>
                )}

                {longTermConfidence?.breakdown.aiSentiment && (
                  <div className="p-3 bg-yellow-900/20 rounded-xl border border-yellow-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-yellow-300">AI Sentiment</span>
                      <span className="text-sm text-gray-400">{longTermConfidence.breakdown.aiSentiment.weight}</span>
                    </div>
                    <div className="w-full bg-gray-700/30 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-yellow-500 to-yellow-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(longTermConfidence.breakdown.aiSentiment.score / 10) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Score: {longTermConfidence.breakdown.aiSentiment.score.toFixed(1)} / 10
                    </p>
                  </div>
                )}

                {longTermConfidence?.breakdown.analystView && (
                  <div className="p-3 bg-orange-900/20 rounded-xl border border-orange-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-orange-300">Analyst Consensus</span>
                      <span className="text-sm text-gray-400">{longTermConfidence.breakdown.analystView.weight}</span>
                    </div>
                    <div className="w-full bg-gray-700/30 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-orange-500 to-orange-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${(longTermConfidence.breakdown.analystView.score / 5) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Score: {longTermConfidence.breakdown.analystView.score.toFixed(1)} / 5
                    </p>
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
