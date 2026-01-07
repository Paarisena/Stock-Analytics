'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Target, BarChart3, Building2 } from 'lucide-react';

interface AnnualReportCardProps {
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
}

const AnnualReportCard: React.FC<AnnualReportCardProps> = ({ annualReport }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!annualReport) {
    return null;
  }

  // Process risks by category
  const annualRisks: Array<{ category: string; items: string[] }> = [];
  if (annualReport.risks) {
    if (annualReport.risks.macroeconomic?.length) {
      annualRisks.push({ category: 'Macroeconomic', items: annualReport.risks.macroeconomic });
    }
    if (annualReport.risks.operational?.length) {
      annualRisks.push({ category: 'Operational', items: annualReport.risks.operational });
    }
    if (annualReport.risks.legal?.length) {
      annualRisks.push({ category: 'Legal/Regulatory', items: annualReport.risks.legal });
    }
    if (annualReport.risks.competitive?.length) {
      annualRisks.push({ category: 'Competitive', items: annualReport.risks.competitive });
    }
    if (annualReport.risks.business?.length) {
      annualRisks.push({ category: 'Business', items: annualReport.risks.business });
    }
    if (annualReport.risks.financial?.length) {
      annualRisks.push({ category: 'Financial', items: annualReport.risks.financial });
    }
    if (annualReport.risks.regulatory?.length) {
      annualRisks.push({ category: 'Regulatory Compliance', items: annualReport.risks.regulatory });
    }
  }

  return (
    <div className="bg-gradient-to-br from-purple-900/20 via-violet-800/10 to-fuchsia-900/20 backdrop-blur-xl rounded-2xl border border-purple-500/20 shadow-2xl overflow-hidden transition-all duration-300">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-purple-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-purple-400" />
          <div className="text-left">
            <h3 className="text-lg font-semibold text-white">Annual Strategic Report</h3>
            <p className="text-sm text-gray-400 mt-1">
              FY {annualReport.fiscalYear}
              {(annualReport.filingDate || annualReport.reportDate) && (
                <> • {annualReport.filingDate || annualReport.reportDate}</>
              )}
            </p>
            {!isExpanded && (
              <p className="text-xs text-gray-500 mt-1">
                {annualReport.segments?.length || 0} Segments • 
                {annualRisks.reduce((sum, cat) => sum + cat.items.length, 0)} Risk Factors • 
                {annualReport.capex?.focusAreas?.length || annualReport.capex?.majorProjects?.length || 0} CAPEX Initiatives
              </p>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Strategy */}
          {(annualReport.strategy?.initiatives || annualReport.strategy?.marketPosition || 
            annualReport.strategy?.chairmanMessage || annualReport.strategy?.businessOverview) && (
            <div className="p-4 bg-gray-800/40 rounded-xl border border-gray-700/30">
              <div className="flex items-start gap-2 mb-3">
                <Target className="w-5 h-5 text-purple-400 mt-0.5" />
                <h4 className="text-sm font-semibold text-purple-300">Strategic Initiatives</h4>
              </div>
              {annualReport.strategy.initiatives && (
                <ul className="space-y-2 mb-3">
                  {annualReport.strategy.initiatives.map((initiative, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-purple-400">•</span>
                      <span>{initiative}</span>
                    </li>
                  ))}
                </ul>
              )}
              {(annualReport.strategy.marketPosition || annualReport.strategy.businessOverview || 
                annualReport.strategy.chairmanMessage) && (
                <p className="text-sm text-gray-300 mt-2">
                  {annualReport.strategy.marketPosition || 
                   annualReport.strategy.businessOverview || 
                   annualReport.strategy.chairmanMessage}
                </p>
              )}
            </div>
          )}

          {/* CAPEX Plans */}
          {annualReport.capex && (
            <div className="p-4 bg-green-900/20 rounded-xl border border-green-500/20">
              <div className="flex items-start gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-green-400 mt-0.5" />
                <h4 className="text-sm font-semibold text-green-300">Capital Expenditure Plans</h4>
              </div>
              
              {(annualReport.capex.threeYearTotal || annualReport.capex.threeYearPlan) && (
                <p className="text-white font-semibold mb-2">
                  3-Year CAPEX: {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    notation: 'compact',
                    maximumFractionDigits: 1
                  }).format(annualReport.capex.threeYearTotal || annualReport.capex.threeYearPlan || 0)}
                </p>
              )}

              {annualReport.capex.breakdown && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {Object.entries(annualReport.capex.breakdown).map(([key, value], idx) => (
                    <div key={idx} className="text-sm text-gray-300">
                      <span className="text-gray-400">{key}:</span> {String(value)}
                    </div>
                  ))}
                </div>
              )}

              {(annualReport.capex.focusAreas || annualReport.capex.majorProjects) && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Focus Areas:</p>
                  <div className="flex flex-wrap gap-2">
                    {(annualReport.capex.focusAreas || annualReport.capex.majorProjects || []).map((area, idx) => (
                      <span key={idx} className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-lg border border-green-500/30">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {annualReport.capex.expectedROI && (
                <p className="text-xs text-gray-400 mt-2">Expected ROI: {annualReport.capex.expectedROI}</p>
              )}
            </div>
          )}

          {/* Segment Performance */}
          {annualReport.segments && annualReport.segments.length > 0 && (
            <div className="p-4 bg-blue-900/20 rounded-xl border border-blue-500/20">
              <div className="flex items-start gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-blue-400 mt-0.5" />
                <h4 className="text-sm font-semibold text-blue-300">Segment Performance</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {annualReport.segments.map((segment, idx) => (
                  <div key={idx} className="p-3 bg-gray-800/40 rounded-lg">
                    <p className="text-white font-semibold">{segment.name}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-gray-400">
                        Revenue: {new Intl.NumberFormat('en-US', {
                          notation: 'compact',
                          maximumFractionDigits: 1
                        }).format(segment.revenue)}
                      </span>
                      <span className={segment.growth > 0 ? 'text-green-400' : 'text-red-400'}>
                        {segment.growth > 0 ? '↑' : '↓'} {Math.abs(segment.growth).toFixed(1)}%
                      </span>
                    </div>
                    {segment.margin !== undefined && (
                      <p className="text-xs text-gray-400 mt-1">Margin: {segment.margin.toFixed(1)}%</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Long-term Guidance */}
          {(annualReport.longTermGuidance || annualReport.futureOutlook) && (
            <div className="p-4 bg-yellow-900/20 rounded-xl border border-yellow-500/20">
              <div className="flex items-start gap-2 mb-3">
                <Target className="w-5 h-5 text-yellow-400 mt-0.5" />
                <h4 className="text-sm font-semibold text-yellow-300">Long-term Outlook (3-5 Years)</h4>
              </div>
              <div className="space-y-2 text-sm text-gray-300">
                {annualReport.longTermGuidance?.revenueTargets && (
                  <p><span className="text-gray-400">Revenue:</span> {annualReport.longTermGuidance.revenueTargets}</p>
                )}
                {annualReport.longTermGuidance?.marginTargets && (
                  <p><span className="text-gray-400">Margins:</span> {annualReport.longTermGuidance.marginTargets}</p>
                )}
                {annualReport.longTermGuidance?.marketShareGoals && (
                  <p><span className="text-gray-400">Market Position:</span> {annualReport.longTermGuidance.marketShareGoals}</p>
                )}
                {annualReport.futureOutlook?.growthStrategy && (
                  <p><span className="text-gray-400">Growth Strategy:</span> {annualReport.futureOutlook.growthStrategy}</p>
                )}
                {annualReport.futureOutlook?.marginGoals && (
                  <p><span className="text-gray-400">Margin Goals:</span> {annualReport.futureOutlook.marginGoals}</p>
                )}
                {annualReport.futureOutlook?.marketTargets && (
                  <p><span className="text-gray-400">Market Targets:</span> {annualReport.futureOutlook.marketTargets}</p>
                )}
              </div>
            </div>
          )}

          {/* Risk Factors */}
          {annualRisks.length > 0 && (
            <div className="p-4 bg-red-900/20 rounded-xl border border-red-500/20">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                <h4 className="text-sm font-semibold text-red-300">
                  Risk Factors ({annualReport.risks?.totalCount || annualRisks.reduce((sum, cat) => sum + cat.items.length, 0)})
                </h4>
              </div>
              <div className="space-y-3">
                {annualRisks.map((riskCategory, idx) => (
                  <div key={idx}>
                    <p className="text-xs font-semibold text-gray-400 mb-1">{riskCategory.category}:</p>
                    <ul className="space-y-1">
                      {riskCategory.items.slice(0, 3).map((risk, riskIdx) => (
                        <li key={riskIdx} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-red-400 mt-1">•</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                      {riskCategory.items.length > 3 && (
                        <li className="text-xs text-gray-500 ml-4">
                          +{riskCategory.items.length - 3} more
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 text-right">
            Source: {annualReport.source} • Cached 6 months
          </p>
        </div>
      )}
    </div>
  );
};

export default AnnualReportCard;
