import mongoose, { Schema, Document } from 'mongoose';

export interface IKeyword extends Document {
    word: string;
    type: 'stopword' | 'temporal' | 'topic';
    frequency: number; // How often it appears
    lastUsed: Date;
    createdAt: Date;
}

const KeywordSchema = new Schema<IKeyword>({
    word: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { 
        type: String, 
        enum: ['stopword', 'temporal', 'topic'],
        required: true 
    },
    frequency: { type: Number, default: 1 },
    lastUsed: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Index for fast lookup
KeywordSchema.index({ word: 1, type: 1 });

const Keyword = mongoose.models.Keyword || mongoose.model<IKeyword>('Keyword', KeywordSchema);

export default Keyword;