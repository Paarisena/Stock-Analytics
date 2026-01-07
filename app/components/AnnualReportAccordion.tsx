"use client";
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Section {
    id: string;
    title: string;
    icon: string;
    content: string;
    wordCount: number;
    qualityScore?: number;
}

interface AnnualReportAccordionProps {
    sections: Section[];
    totalWords: number;
    qualityScore: number;
    analyzedAt: string;
    fiscalYear: string;
}

export default function AnnualReportAccordion({
    sections,
    totalWords,
    qualityScore,
    analyzedAt,
    fiscalYear
}: AnnualReportAccordionProps) {
    
    // Filter out incomplete sections
    const validSections = sections
        .filter(s => s.wordCount >= 150 && s.content.trim().length > 200)
        .sort((a, b) => (b.qualityScore || b.wordCount) - (a.qualityScore || a.wordCount));
    
    // Auto-expand first (best quality) section
    const [expandedIds, setExpandedIds] = useState<Set<string>>(
        new Set(validSections.length > 0 ? [validSections[0].id] : [])
    );
    
    const toggleSection = (id: string) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedIds(newExpanded);
    };
    
    const getQualityBadge = (wordCount: number) => {
        if (wordCount > 400) return { text: '✓ Comprehensive', color: 'text-green-400' };
        if (wordCount > 200) return { text: '⚠️ Moderate', color: 'text-yellow-400' };
        return { text: '○ Limited', color: 'text-gray-400' };
    };
    
    // Section title mapping
    const sectionTitles: Record<string, string> = {
        business_model: 'Business Model',
        current_year_plans: 'Current Year Plans',
        balance_sheet_brief: 'Balance Sheet Summary',
        remuneration_analysis: 'Executive Remuneration'
    };
    
    const sectionIcons: Record<string, string> = {
        business_model: '🏢',
        current_year_plans: '📅',
        balance_sheet_brief: '📈',
        remuneration_analysis: '💼'
    };
    
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };
    
    return (
        <div className="space-y-4">
            {/* Stats Header */}
            <div className="bg-gradient-to-r from-emerald-900/40 to-emerald-800/30 rounded-xl p-4 border border-emerald-500/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-4 text-sm">
                        <span className="text-emerald-300 font-bold">📊 Comprehensive Analysis</span>
                        <span className="text-gray-300">{validSections.length}/4 sections</span>
                        <span className="text-gray-300">{totalWords.toLocaleString()} words</span>
                        <span className="text-gray-300">Quality: {qualityScore}/100</span>
                    </div>
                    <span className="text-xs text-gray-400">
                        Analyzed: {formatDate(analyzedAt)} | {fiscalYear}
                    </span>
                </div>
                {validSections.length < 4 && (
                    <div className="mt-2 text-xs text-yellow-400 flex items-center gap-1">
                        <span>⚠️</span>
                        <span>Partial Analysis - Showing best {validSections.length} sections with sufficient data</span>
                    </div>
                )}
            </div>
            
            {/* Accordion Sections */}
            <div className="space-y-3">
                {validSections.map((section) => {
                    const isExpanded = expandedIds.has(section.id);
                    const quality = getQualityBadge(section.wordCount);
                    const title = sectionTitles[section.id] || section.id;
                    const icon = sectionIcons[section.id] || '📄';
                    
                    return (
                        <div 
                            key={section.id}
                            className="bg-gradient-to-br from-gray-900/60 to-gray-800/40 rounded-xl border border-gray-700/50 overflow-hidden transition-all duration-300"
                        >
                            {/* Section Header */}
                            <div
                                onClick={() => toggleSection(section.id)}
                                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/40 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{icon}</span>
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-200">{title}</h4>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="text-xs text-gray-400">{section.wordCount} words</span>
                                            <span className={`text-xs ${quality.color}`}>{quality.text}</span>
                                        </div>
                                    </div>
                                </div>
                                {isExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-gray-400" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                )}
                            </div>
                            
                            {/* Section Content */}
                            <div 
                                className={`overflow-hidden transition-all duration-300 ${
                                    isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                                }`}
                            >
                                <div className="p-4 pt-0 text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                                    {section.content}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {validSections.length === 0 && (
                <div className="bg-gray-800/40 rounded-xl p-6 text-center border border-gray-700/50">
                    <p className="text-gray-400">No comprehensive sections available. Analysis may have incomplete data.</p>
                </div>
            )}
        </div>
    );
}
