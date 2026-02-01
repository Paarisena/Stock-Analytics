import mongoose from 'mongoose';

const PDFCacheSchema = new mongoose.Schema({
    symbol: { type: String, required: true },
    fiscalYear: { type: String, required: true },
    content: { type: String, required: true },
    url: { type: String },
    source: { type: String },
    createdAt: { type: Date, default: Date.now },
}, {
    timestamps: true,
});

// Compound index for fast lookups
PDFCacheSchema.index({ symbol: 1, fiscalYear: 1 }, { unique: true });

// TTL index: Auto-delete after 90 days
PDFCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const PDFCache = mongoose.models.PDFCache || mongoose.model('PDFCache', PDFCacheSchema);