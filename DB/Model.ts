// Add sources field to your schema:

import mongoose, { Schema, Document } from 'mongoose';

export interface ISearchHistory extends Document {
  query: string;
  normalizedQuery: string;
  aiModel: string;
  response: string;
  tokenUsed: number;
  cached: boolean;
  parentCacheId?: mongoose.Types.ObjectId;
  timestamp: Date;
  sources?: Array<{  // ✅ NEW
    id: number;
    title: string;
    link: string;
    snippet: string;
  }>;
}

const SearchHistorySchema: Schema = new Schema({
  query: { type: String, required: true },
  normalizedQuery: { type: String, required: true },
  aiModel: { type: String, required: true },
  response: { type: String, required: true },
  tokenUsed: { type: Number, default: 0 },
  cached: { type: Boolean, default: false },
  parentCacheId: { type: Schema.Types.ObjectId, ref: 'SearchHistory' },
  timestamp: { type: Date, default: Date.now },
  sources: [{ // ✅ NEW
    id: Number,
    title: String,
    link: String,
    snippet: String
  }]
});

export default mongoose.models.SearchHistory || mongoose.model<ISearchHistory>('SearchHistory', SearchHistorySchema);