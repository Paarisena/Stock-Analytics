import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithPDF } from '@/app/utils/aiProviders';
import connectToDatabase from '@/DB/MongoDB';
import { EarningsCallCache } from '@/DB/Model';

export async function POST(request: NextRequest) {
  try {
    const { pdfUrl, quarter, fiscalYear, symbol, companyName } = await request.json();

    if (!pdfUrl || !symbol) {
      return NextResponse.json(
        { error: 'PDF URL and symbol are required' },
        { status: 400 }
      );
    }

    console.log(`🤖 [Transcript Summary] Processing ${symbol} ${quarter} FY${fiscalYear}...`);

    // Check cache first
    await connectToDatabase();
    const cached = await EarningsCallCache.findOne({
      symbol,
      quarter,
      fiscalYear,
      expiresAt: { $gt: new Date() }
    });

    if (cached) {
      console.log(`✅ [Transcript Summary] Using cached summary for ${symbol} ${quarter} FY${fiscalYear}`);
      return NextResponse.json({
        summary: cached.data.summary,
        fullData: cached.data,
        quarter,
        fiscalYear,
        generatedAt: cached.fetchedAt.toISOString(),
        fromCache: true
      });
    }

    const prompt = `Analyze this earnings call transcript for ${companyName || symbol} ${quarter} FY${fiscalYear} and provide a comprehensive, well-structured summary.

Provide a detailed summary with these sections:

## 📊 Financial Highlights
- Revenue figures and growth rates (YoY, QoQ)
- Profit metrics (Net Profit, Operating Profit, margins)
- Cash flow and balance sheet highlights
- Guidance provided by management

## 🎯 Strategic Initiatives & Business Updates
- New products, services, or market launches
- Expansion plans (geography, capacity, partnerships)
- Technology investments or digital transformation
- M&A activity or capital allocation plans

## 💬 Management Commentary
- Forward-looking statements and guidance
- Management tone and confidence level
- Key risks or concerns mentioned

## ⚠️ Risks & Challenges
- Headwinds affecting the business
- Competitive pressures
- Regulatory or macro concerns

## 🔑 Key Takeaways
- 3-5 most important points investors should know

Use bullet points and be specific with numbers where available.`;

    // Use Gemini 2.5's native PDF reading
    const summary = await callGeminiWithPDF(pdfUrl, prompt, {
      temperature: 0.3,
      maxTokens: 16000
    });

    // Save to MongoDB
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await EarningsCallCache.findOneAndUpdate(
      { symbol, quarter, fiscalYear },
      {
        symbol,
        quarter,
        fiscalYear,
        callDate: now.toISOString().split('T')[0],
        data: {
          companyName: companyName || symbol,
          symbol,
          quarter,
          fiscalYear,
          callDate: now.toISOString().split('T')[0],
          summary,
          sentiment: 'Neutral', // Could be extracted from summary
          financialHighlights: {},
          operationalHighlights: { volumeMetrics: {}, marketShare: null, capacityUtilization: null, keyProjects: [] },
          managementCommentary: { businessHighlights: [], challenges: [], opportunities: [], futureGuidance: {} },
          qAndAInsights: { keyQuestions: [], keyAnswers: [], redFlags: [] },
          segmentPerformance: [],
          competitivePosition: { marketShareTrend: '', competitiveAdvantages: [], industryTrends: [] },
          investmentThesis: { bullCase: [], bearCase: [], recommendation: { signal: 'HOLD', confidence: 'Medium', timeframe: '', triggers: [] } },
          keyTakeaways: []
        },
        rawTranscript: pdfUrl, // Store PDF URL
        transcriptLength: summary.length,
        wasChunked: false,
        source: 'Screener.in Concalls',
        fetchedAt: now,
        expiresAt
      },
      { upsert: true, new: true }
    );

    console.log(`✅ [Transcript Summary] Saved to MongoDB for ${symbol} ${quarter} FY${fiscalYear}`);

    return NextResponse.json({
      summary,
      quarter,
      fiscalYear,
      generatedAt: now.toISOString(),
      fromCache: false
    });

  } catch (error: any) {
    console.error('❌ [Transcript Summary] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to generate summary' },
      { status: 500 }
    );
  }
}
