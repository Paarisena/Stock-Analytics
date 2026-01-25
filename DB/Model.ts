// File: DB/Model.ts
import mongoose, { Schema } from 'mongoose';

// ============================================
// ANNUAL REPORT CACHE INTERFACE & SCHEMA
// ============================================
export interface IAnnualReportCache {
    symbol: string;
    fiscalYear: string;
    reportType: 'Consolidated' | 'Standalone';
    data: {
        companyName: string;
        fiscalYear: string;
        reportType: string;
        summary?: string;
        businessModel?: string;
        futureStrategy?: string;
        keyHighlights?: string[];
        balanceSheet?: any;
        cashFlow?: any;
        remuneration?: any;
        auditInformation?: any;
        currency?: string;
    };
    rawPdfUrl?: string;
    source: string;
    fetchedAt: Date;
    expiresAt: Date;
}

const AnnualReportCacheSchema = new mongoose.Schema<IAnnualReportCache>({
    symbol: { type: String, required: true, index: true },
    fiscalYear: { type: String, required: true, index: true },
    reportType: { type: String, enum: ['Consolidated', 'Standalone'], default: 'Consolidated' },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    rawPdfUrl: { type: String },
    source: { type: String, required: true },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true }
}, {
    timestamps: true
});

// Compound index for quick lookups
AnnualReportCacheSchema.index({ symbol: 1, fiscalYear: 1, reportType: 1 }, { unique: true });

// TTL index - MongoDB will automatically delete expired documents
AnnualReportCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// EXPORT AS NAMED EXPORT (not default)
export const AnnualReportCache = mongoose.models.AnnualReportCache || 
    mongoose.model<IAnnualReportCache>('AnnualReportCache', AnnualReportCacheSchema);

// ============================================
// QUARTERLY REPORT CACHE INTERFACE & SCHEMA (Updated for Table Extraction)
// ============================================
export interface IQuarterlyReportCache {
    symbol: string;
    quarter: string; // "Sep 2025"
    fiscalYear: string;
    data: {
        quarter: string;
        quarters?: string[]; // All 13 quarters ["Sep 2022", "Dec 2022", ...]
        keyMetrics?: {
            revenue?: {
                value: number;
                yoyGrowth: number | null;
                qoqGrowth: number | null;
                unit: string;
                trend?: string; // "Accelerating" | "Decelerating" | "Stable"
                analysis?: string;
            };
            netProfit?: {
                value: number;
                yoyGrowth: number | null;
                qoqGrowth: number | null;
                unit: string;
                trend?: string;
                analysis?: string;
            };
            operatingProfit?: {
                value: number;
                yoyGrowth: number | null;
                qoqGrowth: number | null;
                unit: string;
            };
            eps?: {
                value: number;
                yoyGrowth: number | null;
                qoqGrowth: number | null;
            };
            operatingMargin?: number;
            netMargin?: number;
        };
        expenses?: {
            total: number;
            interest: number;
            depreciation: number;
            otherIncome: number;
        };
        financialRatios?: {
            operatingMargin: number;
            netMargin: number;
            expenseToRevenueRatio?: string;
            interestCoverageRatio?: string;
            taxRate?: number;
        };
        historicalData?: {
            sales: number[];
            expenses?: number[];
            operatingProfit: number[];
            opm: number[];
            netProfit: number[];
            eps: number[];
        };
        managementCommentary?: {
            businessHighlights: string[];
            challenges: string[];
            opportunities: string[];
            futureGuidance: string[];
        };
        segmentPerformance?: Array<{
            segment: string;
            revenue: number | null;
            growth: string | null;
            margin: number | null;
            commentary: string;
        }>;
        cashFlow?: {
            operatingCashFlow: number | null;
            freeCashFlow: number | null;
            capex: number | null;
            cashAndEquivalents: number | null;
            analysis?: string;
        };
        outlook?: {
            sentiment: 'Positive' | 'Neutral' | 'Negative';
            confidenceLevel: 'High' | 'Medium' | 'Low';
            keyDrivers: string[];
            risks: string[];
            seasonality?: string;
            nextQuarterExpectation?: string;
        };
        competitivePosition?: {
            marketShare: string;
            competitiveAdvantages: string[];
            industryTrends: string[];
            operatingLeverage?: string;
        };
        historicalTrends?: {
            bestQuarter: string;
            worstQuarter: string;
            peakToTrough: string;
            consistencyScore: 'High' | 'Medium' | 'Low';
            seasonalPattern: string;
        };
        summary?: string;
    };
    rawTranscript?: string; // JSON string from table extraction
    source: string;
    fetchedAt: Date;
    expiresAt: Date;
}

const QuarterlyReportCacheSchema = new mongoose.Schema<IQuarterlyReportCache>({
    symbol: { type: String, required: true, index: true },
    quarter: { type: String, required: true }, // "Sep 2025"
    fiscalYear: { type: String, required: true, index: true },
    data: { 
        type: mongoose.Schema.Types.Mixed, 
        required: true,
        // Nested structure for better query performance
        quarter: String,
        quarters: [String],
        keyMetrics: {
            revenue: {
                value: Number,
                yoyGrowth: Number,
                qoqGrowth: Number,
                unit: String,
                trend: String,
                analysis: String
            },
            netProfit: {
                value: Number,
                yoyGrowth: Number,
                qoqGrowth: Number,
                unit: String,
                trend: String,
                analysis: String
            },
            operatingProfit: {
                value: Number,
                yoyGrowth: Number,
                qoqGrowth: Number,
                unit: String
            },
            eps: {
                value: Number,
                yoyGrowth: Number,
                qoqGrowth: Number
            },
            operatingMargin: Number,
            netMargin: Number
        },
        expenses: {
            total: Number,
            interest: Number,
            depreciation: Number,
            otherIncome: Number
        },
        financialRatios: {
            operatingMargin: Number,
            netMargin: Number,
            expenseToRevenueRatio: String,
            interestCoverageRatio: String,
            taxRate: Number
        },
        historicalData: {
            sales: [Number],
            expenses: [Number],
            operatingProfit: [Number],
            opm: [Number],
            netProfit: [Number],
            eps: [Number]
        },
        managementCommentary: {
            businessHighlights: [String],
            challenges: [String],
            opportunities: [String],
            futureGuidance: [String]
        },
        segmentPerformance: [{
            segment: String,
            revenue: Number,
            growth: String,
            margin: Number,
            commentary: String
        }],
        cashFlow: {
            operatingCashFlow: Number,
            freeCashFlow: Number,
            capex: Number,
            cashAndEquivalents: Number,
            analysis: String
        },
        outlook: {
            sentiment: { type: String, enum: ['Positive', 'Neutral', 'Negative'] },
            confidenceLevel: { type: String, enum: ['High', 'Medium', 'Low'] },
            keyDrivers: [String],
            risks: [String],
            seasonality: String,
            nextQuarterExpectation: String
        },
        competitivePosition: {
            marketShare: String,
            competitiveAdvantages: [String],
            industryTrends: [String],
            operatingLeverage: String
        },
        historicalTrends: {
            bestQuarter: String,
            worstQuarter: String,
            peakToTrough: String,
            consistencyScore: { type: String, enum: ['High', 'Medium', 'Low'] },
            seasonalPattern: String
        },
        summary: String
    },
    rawTranscript: { type: String }, // JSON string from table extraction
    source: { type: String, default: 'Screener.in Table' },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true }
}, {
    timestamps: true
});

// Compound index for efficient queries
QuarterlyReportCacheSchema.index({ symbol: 1, quarter: 1, fiscalYear: 1 }, { unique: true });

// Additional indexes for common queries
QuarterlyReportCacheSchema.index({ symbol: 1, fetchedAt: -1 }); // Get latest by symbol
QuarterlyReportCacheSchema.index({ 'data.keyMetrics.revenue.yoyGrowth': -1 }); // Sort by growth

// TTL index - auto-delete after 90 days
QuarterlyReportCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// EXPORT AS NAMED EXPORT
export const QuarterlyReportCache = mongoose.models.QuarterlyReportCache || 
    mongoose.model<IQuarterlyReportCache>('QuarterlyReportCache', QuarterlyReportCacheSchema);

// ============================================
// EARNINGS CALL TRANSCRIPT CACHE INTERFACE & SCHEMA
// ============================================
export interface IEarningsCallCache {
    symbol: string;
    quarter: string; // "Q2"
    fiscalYear: string; // "FY26"
    callDate: string; // "2025-11-12"
    data: {
        companyName: string;
        symbol: string;
        quarter: string;
        fiscalYear: string;
        callDate: string;
        sentiment: 'Bullish' | 'Neutral' | 'Bearish';
        financialHighlights: {
            revenue?: {
                value: number | null;
                yoyGrowth: number | null;
                guidance: string | null;
            };
            ebitda?: {
                value: number | null;
                margin: number | null;
                trend: string;
            };
            netProfit?: {
                value: number | null;
                yoyGrowth: number | null;
            };
            orderBook?: {
                total: number | null;
                newOrders: number | null;
                breakdown: Record<string, number>;
            };
            cashFlow?: {
                operating: number | null;
                free: number | null;
                workingCapital: number | null;
            };
            debt?: {
                netDebt: number | null;
                netDebtToEBITDA: number | null;
            };
        };
        operationalHighlights: {
            volumeMetrics: Record<string, any>;
            marketShare: number | null;
            capacityUtilization: number | null;
            keyProjects: string[];
        };
        managementCommentary: {
            businessHighlights: string[];
            challenges: string[];
            opportunities: string[];
            futureGuidance: {
                revenueTarget: string | null;
                marginOutlook: string | null;
                capexPlan: string | null;
                orderInflowTarget: string | null;
            };
        };
        qAndAInsights: {
            keyQuestions: string[];
            keyAnswers: string[];
            redFlags: string[];
        };
        segmentPerformance: Array<{
            segment: string;
            revenue: number | null;
            revenueContribution: number | null;
            growth: number | null;
            margin: number | null;
            strategicImportance: string;
            outlook: string;
        }>;
        competitivePosition: {
            marketShareTrend: string;
            competitiveAdvantages: string[];
            industryTrends: string[];
        };
        investmentThesis: {
            bullCase: string[];
            bearCase: string[];
            recommendation: {
                signal: 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';
                confidence: 'High' | 'Medium' | 'Low';
                timeframe: string;
                triggers: string[];
            };
        };
        keyTakeaways: string[];
        summary: string;
    };
    rawTranscript: string;
    transcriptLength: number;
    wasChunked: boolean;
    source: string;
    fetchedAt: Date;
    expiresAt: Date;
}

const EarningsCallCacheSchema = new mongoose.Schema<IEarningsCallCache>({
    symbol: { type: String, required: true, index: true },
    quarter: { type: String, required: true },
    fiscalYear: { type: String, required: true, index: true },
    callDate: { type: String, required: true },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    rawTranscript: { type: String, required: true },
    transcriptLength: { type: Number, required: true },
    wasChunked: { type: Boolean, default: false },
    source: { 
        type: String, 
        required: true,
        default: 'Screener.in Concalls'
    },
    fetchedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true }
}, {
    timestamps: true
});

// Compound index for unique constraint
EarningsCallCacheSchema.index(
    { symbol: 1, quarter: 1, fiscalYear: 1 }, 
    { unique: true }
);

// Additional indexes
EarningsCallCacheSchema.index({ symbol: 1, callDate: -1 });
EarningsCallCacheSchema.index({ callDate: -1 });
EarningsCallCacheSchema.index({ 'data.sentiment': 1 });
EarningsCallCacheSchema.index({ 'data.investmentThesis.recommendation.signal': 1 });

// TTL index - auto-delete after 90 days
EarningsCallCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Text index for searching
EarningsCallCacheSchema.index({ rawTranscript: 'text', 'data.summary': 'text' });

// EXPORT AS NAMED EXPORT
export const EarningsCallCache = mongoose.models.EarningsCallCache || 
    mongoose.model<IEarningsCallCache>('EarningsCallCache', EarningsCallCacheSchema);