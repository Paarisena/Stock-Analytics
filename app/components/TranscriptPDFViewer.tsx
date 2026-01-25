"use client";

import { useState } from 'react';

interface TranscriptPDFViewerProps {
  pdfUrl: string;
  quarter: string;
  fiscalYear: string;
  symbol: string;
  companyName?: string;
}

export default function TranscriptPDFViewer({ pdfUrl, quarter, fiscalYear, symbol, companyName }: TranscriptPDFViewerProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/summarize-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, quarter, fiscalYear, symbol, companyName })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-xl p-6 border border-blue-200 dark:border-blue-800 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            📞 Earnings Call Transcript
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {quarter} • FY{fiscalYear}
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium shadow-md"
          >
            📄 Download PDF
          </a>
          <button
            onClick={handleSummarize}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg transition-all text-sm font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Analyzing...' : '🤖 AI Summarize'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-400 text-sm">❌ {error}</p>
        </div>
      )}

      {/* Summary Display */}
      {summary && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-inner">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-bold text-gray-900 dark:text-white">
              📝 AI-Generated Summary
            </h4>
            <button
              onClick={() => setSummary(null)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
            >
              ✕ Close
            </button>
          </div>
          
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {/* Render markdown-style summary */}
            <div 
              className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ 
                __html: summary
                  .replace(/## (.*)/g, '<h3 class="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white">$1</h3>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/- (.*)/g, '<li class="ml-4">$1</li>')
                  .replace(/\n\n/g, '<br/><br/>')
              }}
            />
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg p-8 border border-gray-200 dark:border-gray-700 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Analyzing transcript with Gemini 2.5 Flash...
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            This may take 30-60 seconds
          </p>
        </div>
      )}
    </div>
  );
}
