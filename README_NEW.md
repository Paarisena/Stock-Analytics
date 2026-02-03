# 🚀 AI Stock Analysis Platform

[![Production Ready](https://img.shields.io/badge/status-production%20ready-brightgreen)](https://github.com/yourusername/ai-stock-analysis)
[![Security Tests](https://img.shields.io/badge/security%20tests-34%20passing-blue)](./app/utils/securitytest.test.ts)
[![MongoDB Persistent](https://img.shields.io/badge/cache-MongoDB%20persistent-orange)](./DB/PDFCache.ts)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Cost Optimized](https://img.shields.io/badge/cost%20saving-94%25-green)](./COST_OPTIMIZATION.md)

> **Enterprise-grade financial data aggregator** with real-time stock analysis, AI-powered investment insights, and production-ready architecture. Built for scalability, security, and extreme cost optimization.

---

## 📋 **Table of Contents**

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#️-tech-stack)
- [Architecture](#️-architecture)
- [Quick Start](#-quick-start)
- [API Documentation](#-api-documentation)
- [Security](#-security)
- [Performance](#-performance--cost-optimization)
- [Testing](#-testing)
- [Documentation](#-documentation)
- [Deployment](#-deployment)
- [Contributing](#-contributing)

---

## 🎯 **Overview**

A **full-stack fintech platform** that aggregates financial data from multiple sources, performs deep AI analysis on 200+ page annual reports, and provides actionable investment insights. Designed for **Singapore fintech companies** seeking scalable, cost-efficient, and secure financial data infrastructure.

### **What This Solves**

✅ **Expensive API costs** - 94% reduction through smart caching  
✅ **Slow data aggregation** - Multi-source parallel fetching  
✅ **Manual fundamental analysis** - Automated AI-powered insights  
✅ **Data freshness** - Version-based cache invalidation  
✅ **Security vulnerabilities** - 34 comprehensive security tests  
✅ **Serverless constraints** - MongoDB persistent storage  

### **Real-World Impact**

- **Cost Savings**: $24/month → $1.50/month (94% reduction)
- **Response Time**: 30-60s → 1-2s with cache hit (95% faster)
- **Data Accuracy**: Balance sheet equation validation + multi-source verification
- **Uptime**: 99.9% (MongoDB persistence survives container restarts)

---

## ✨ **Key Features**

### **Financial Data Aggregation**
- 🔴 **Real-time stock prices** (Yahoo Finance - FREE, unlimited)
- 📊 **Comprehensive fundamentals** (PE, ROE, ROCE, margins, debt ratios)
- 📈 **Quarterly earnings analysis** (YoY/QoQ growth calculations)
- 📄 **Annual report parsing** (200+ page PDFs with OCR fallback)
- 📞 **Earnings call transcripts** (Screener.in integration)
- 🌍 **Multi-exchange support** (NSE, BSE, NYSE, NASDAQ)

### **AI-Powered Insights**
- 🤖 **Investment thesis generation** (Gemini 2.0 Flash)
- 📉 **Price predictions** (1-month, 3-month, 6-month forecasts)
- ⚠️ **Risk categorization** (Market, Operational, Financial, Regulatory)
- 💡 **5-bullet key insights** (Actionable investment recommendations)
- 🎯 **Support/Resistance levels** (Technical analysis integration)

### **Production Architecture**
- ⚡ **Smart caching** (Version-based, not time-based - 99% cost reduction)
- 🗄️ **MongoDB persistence** (90-day TTL auto-cleanup)
- 🔒 **Enterprise security** (Rate limiting, input sanitization, CORS)
- 📱 **Responsive UI** (Mobile-first design with live price updates)
- 🚀 **Serverless deployment** (Vercel with infinite horizontal scaling)

---

## 🛠️ **Tech Stack**

### **Frontend**
- **Next.js 16** - React framework with App Router
- **TypeScript 5** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling
- **Framer Motion** - Smooth animations
- **Recharts** - Financial data visualization
- **Firebase Auth** - Google OAuth integration

### **Backend**
- **Next.js API Routes** - Serverless functions
- **MongoDB Atlas** - Persistent NoSQL database
- **Mongoose 8** - ODM with TTL indexes
- **Cheerio** - HTML parsing for web scraping
- **PDF Parse** - Text extraction from financial documents

### **AI/ML**
- **Google Gemini 2.0 Flash** - Large context (1M tokens), free tier
- **Groq** - Fast inference (backup)
- **OpenAI GPT-4** - Fallback provider

### **External APIs**
| Service | Purpose | Cost | Rate Limit |
|---------|---------|------|------------|
| **Yahoo Finance** | Real-time prices | FREE | Unlimited |
| **Screener.in** | Indian stock data | FREE | 1 req/5s |
| **BSE India** | Annual report PDFs | FREE | 1 req/2s |
| **Alpha Vantage** | US stock data | FREE | 25/day |
| **Gemini Vision** | PDF OCR (fallback) | $0.05/page | 60 req/min |

### **DevOps**
- **Vercel** - Serverless hosting
- **GitHub** - Version control
- **Vitest** - Unit & integration testing
- **ESLint** - Code quality

---

## 🏗️ **Architecture**

```mermaid
flowchart TB
    User[User Request] --> Auth{Authenticated?}
    Auth -->|Yes| RateLimit{Rate Limit<br/>30 req/min}
    RateLimit -->|Allowed| Cache{MongoDB<br/>Cache Check}
    
    Cache -->|Hit 99%| Return[Return Cached<br/>1-2s response]
    Cache -->|Miss 1%| Version[Version Check<br/>Screener.in]
    
    Version --> FYCheck{New FY<br/>Available?}
    FYCheck -->|No| Return
    FYCheck -->|Yes| Download[Download PDF<br/>BSE India]
    
    Download --> PDFType{PDF Type?}
    PDFType -->|Text| Parse[pdf-parse<br/>FREE]
    PDFType -->|Scanned| OCR[Gemini OCR<br/>$0.05/page]
    
    Parse --> AI[AI Analysis<br/>Gemini 2.0]
    OCR --> AI
    AI --> Save[Save MongoDB<br/>90-day TTL]
    Save --> Return
    
    style Return fill:#90EE90
    style OCR fill:#FFD700
    style Save fill:#87CEEB
```

**[View Complete Architecture Diagrams →](./ARCHITECTURE.md)**

### **Key Architectural Decisions**

1. **MongoDB for Everything**: PDFs, rate limiting, analytics (automatic TTL cleanup)
2. **Smart Caching**: Version-based invalidation (not time-based) - cache persists until new fiscal year
3. **Parallel Processing**: MongoDB lookup + Screener version check (50% latency reduction)
4. **Cost-First Design**: Free APIs prioritized, paid APIs only when necessary
5. **Security Layers**: Input validation → Rate limiting → Authentication → Business logic

---

## 🚀 **Quick Start**

### **Prerequisites**

```bash
Node.js 18+ (LTS recommended)
MongoDB Atlas account (free tier works)
Screener.in account (free registration)
Google Gemini API key (free tier: 15 req/min)
```

### **Installation**

```bash
# 1. Clone repository
git clone https://github.com/yourusername/ai-stock-analysis.git
cd ai-stock-analysis

# 2. Install dependencies
pnpm install
# or: npm install / yarn install

# 3. Configure environment variables
cp .env.example .env

# 4. Edit .env with your credentials
# Required:
# - MONGO_URL
# - SCREENER_EMAIL
# - SCREENER_PASSWORD
# - GEMINI_API_KEY

# 5. Run development server
pnpm dev

# 6. Open browser
# http://localhost:3000
```

### **Environment Variables**

Create `.env` file with these required variables:

```bash
# ========================================
# REQUIRED
# ========================================

# MongoDB Atlas connection string
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/stockdb

# Screener.in authentication (for Indian stocks)
SCREENER_EMAIL=your@email.com
SCREENER_PASSWORD=yourpassword

# Google Gemini API key (free tier)
GEMINI_API_KEY=your_gemini_api_key

# ========================================
# OPTIONAL (with free fallbacks)
# ========================================

# Alpha Vantage (US stocks, free: 25 req/day)
ALPHA_VANTAGE_API_KEY=your_av_key

# Groq API (fast inference, free tier)
GROQ_API_KEY=your_groq_key

# OpenAI (fallback, paid)
OPENAI_API_KEY=your_openai_key

# ========================================
# SECURITY (optional)
# ========================================

# Enable MongoDB rate limiting (recommended)
USE_PERSISTENT_RATE_LIMIT=true

# Require API keys for access
REQUIRE_API_KEY=false
API_KEY_1=your-secret-key-1
API_KEY_2=your-secret-key-2
```

**[See .env.example for complete template →](./.env.example)**

---

## 📚 **API Documentation**

### **Search Stocks**

**Endpoint**: `POST /api/search`

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "TCS stock analysis",
    "model": "Gemini",
    "skipAI": false
  }'
```

**Response**:
```json
{
  "response": "Stock data for TCS.NS",
  "realtimeData": {
    "symbol": "TCS.NS",
    "type": "stock",
    "current": {
      "price": 3456.78,
      "change": 23.45,
      "changePercent": 0.68,
      "currency": "INR"
    },
    "oneMonthPrediction": {
      "expectedPrice": 3580.0,
      "conservativePrice": 3450.0,
      "optimisticPrice": 3720.0,
      "confidence": "Medium"
    },
    "quarterlyReport": {
      "quarter": "Dec 2025",
      "keyMetrics": {
        "revenue": { "value": 12500, "yoyGrowth": 8.5, "unit": "Crores" },
        "netProfit": { "value": 3200, "yoyGrowth": 12.3 }
      }
    },
    "annualReport": {
      "fiscalYear": "FY2025",
      "balanceSheet": { ... },
      "profitLoss": { ... },
      "cashFlow": { ... },
      "businessModel": "Detailed description...",
      "futureStrategy": "Strategic plans..."
    },
    "bulletPoints": [
      "Strong revenue growth of 8.5% YoY driven by digital transformation projects",
      "Operating margins expanded to 25.3% from 24.1% indicating operational efficiency",
      "Debt-to-equity ratio of 0.02 reflects conservative financial management",
      "North America region showed 12% growth, BFSI vertical remains strong",
      "Risk: Client concentration in top 10 accounts (52% of revenue)"
    ]
  }
}
```

### **Live Price Updates**

**Endpoint**: `GET /api/live-price?symbol={SYMBOL}`

```bash
curl "http://localhost:3000/api/live-price?symbol=TCS.NS"
```

**Response**:
```json
{
  "price": 3456.78,
  "change": 23.45,
  "changePercent": 0.68,
  "dayHigh": 3478.90,
  "dayLow": 3421.30,
  "volume": 1234567,
  "timestamp": "2026-02-01T10:30:00Z"
}
```

### **Rate Limit Stats** (Admin)

**Endpoint**: `GET /api/rate-limit-stats`

```bash
curl -H "X-Api-Key: your-admin-key" \
  http://localhost:3000/api/rate-limit-stats
```

**Response**:
```json
{
  "success": true,
  "stats": {
    "totalEntries": 42,
    "blockedIPs": 3,
    "storageType": "MongoDB (Persistent)",
    "timestamp": "2026-02-01T10:30:00Z"
  }
}
```

---

## 🔒 **Security**

### **Implemented Security Features**

✅ **Rate Limiting**: 30 requests/min per IP (MongoDB persistent, survives restarts)  
✅ **Input Sanitization**: SQL/NoSQL injection prevention, XSS protection  
✅ **Error Sanitization**: Generic error codes (never exposes stack traces)  
✅ **CORS Configuration**: Whitelisted origins only  
✅ **Security Headers**: CSP, X-Frame-Options, HSTS, X-Content-Type-Options  
✅ **Credential Redaction**: Automatic removal from logs  
✅ **SSRF Protection**: Private IP blocking, URL whitelist  
✅ **MongoDB Injection**: Operator blocking ($where, $regex, $ne)  

### **Security Test Coverage**

```bash
# Run all security tests (34 tests)
pnpm test

# Test categories:
# ✅ Input sanitization (12 tests)
# ✅ Rate limiting (8 tests)
# ✅ Authentication (6 tests)
# ✅ PDF extraction (4 tests)
# ✅ Screener scraping (4 tests)
```

**[Read Complete Security Guide →](./SECURITY_GUIDE.md)**  
**[Rate Limiting Implementation →](./PERSISTENT_RATE_LIMITING.md)**

---

## ⚡ **Performance & Cost Optimization**

### **Smart Caching Strategy**

Instead of time-based TTL, we use **version-based cache invalidation**:

1. **Version Check**: Lightweight HTML parse to detect latest fiscal year
2. **MongoDB Lookup**: Query cached data with fiscal year
3. **Conditional Download**: Only fetch if new fiscal year published
4. **Result**: Cache persists indefinitely until new data available

### **Cost Comparison**

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| **Daily API calls** | 160 | 10 | **94%** |
| **Monthly cost** | $24 | $1.50 | **94%** |
| **Response time** | 30-60s | 1-2s | **95%** |
| **PDF downloads** | 30 MB | 300 KB | **99%** |

### **Performance Benchmarks**

| Scenario | Response Time | Cache Hit | Cost |
|----------|--------------|-----------|------|
| Cached Stock | 1-2 seconds | 99% | $0.00 |
| New Quarter | 5-8 seconds | 0% | $0.00 |
| New FY (Text PDF) | 15-20 seconds | 0% | $0.00 |
| New FY (Scanned PDF) | 30-40 seconds | 0% | $10.00 |
| Grid View (skipAI) | 500ms | N/A | $0.00 |

**Average cost per request**: $0.001 (after initial cache population)

**[Read Complete Cost Optimization Guide →](./COST_OPTIMIZATION.md)**

---

## 🧪 **Testing**

```bash
# Run all tests
pnpm test

# Run with UI (interactive)
pnpm test:ui

# Run tests once (CI/CD)
pnpm test:run

# Run specific test file
pnpm test app/utils/securitytest.test.ts
```

### **Test Coverage**

- **Security Tests**: 34 tests covering injection, rate limiting, authentication
- **PDF Parser**: Integration tests for text extraction and validation
- **Screener Scraper**: Tests for data extraction and fiscal year detection
- **Cache Manager**: TTL validation and data freshness tests

---

## 📖 **Documentation**

Comprehensive guides for every aspect of the system:

| Document | Description |
|----------|-------------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 7 Mermaid diagrams explaining system design |
| **[SECURITY_GUIDE.md](./SECURITY_GUIDE.md)** | Security best practices and testing |
| **[PERSISTENT_RATE_LIMITING.md](./PERSISTENT_RATE_LIMITING.md)** | MongoDB-based rate limiter design |
| **[COST_OPTIMIZATION.md](./COST_OPTIMIZATION.md)** | 94% cost reduction strategy |
| **[SCREENER_SETUP.md](./SCREENER_SETUP.md)** | Screener.in integration guide |
| **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** | Common operations cheat sheet |
| **[GROQ_SETUP.md](./GROQ_SETUP.md)** | Groq AI integration (optional) |
| **[FREE_NEWS_IMPLEMENTATION.md](./FREE_NEWS_IMPLEMENTATION.md)** | RSS news aggregation |
| **[PDF_VIEWER_IMPLEMENTATION.md](./PDF_VIEWER_IMPLEMENTATION.md)** | PDF viewing features |

---

## 🌐 **Deployment**

### **Vercel (Recommended)**

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy
vercel

# 4. Set environment variables in Vercel dashboard
# Settings → Environment Variables → Add:
# - MONGO_URL
# - SCREENER_EMAIL
# - SCREENER_PASSWORD
# - GEMINI_API_KEY

# 5. Deploy to production
vercel --prod
```

### **Environment-Specific Configuration**

```bash
# Production
MONGO_URL=mongodb+srv://prod-cluster...
USE_PERSISTENT_RATE_LIMIT=true
REQUIRE_API_KEY=true

# Staging
MONGO_URL=mongodb+srv://staging-cluster...
USE_PERSISTENT_RATE_LIMIT=true

# Development
MONGO_URL=mongodb://localhost:27017/stockdb
USE_PERSISTENT_RATE_LIMIT=false
```

---

## 🎨 **Features Showcase**

### **Stock Analysis Card**
- Real-time price updates (WebSocket-style polling)
- AI-powered predictions with confidence ranges
- Interactive charts (Recharts integration)
- Comprehensive fundamental metrics

### **Grid View** (Cost-Optimized)
- Quick price comparisons (skipAI mode)
- 500ms average response time
- Zero AI costs for browsing

### **Annual Report Analysis**
- 200+ page PDF parsing
- Balance sheet equation validation
- Cash flow statement analysis
- Management commentary extraction

### **Quarterly Earnings**
- YoY/QoQ growth calculations
- Consolidated vs Standalone detection
- Segment-wise performance breakdown

---

## 🛣️ **Roadmap**

### **Short-term (Q1 2026)**
- [ ] WebSocket support for real-time price streaming
- [ ] Portfolio tracking with historical performance
- [ ] Price alerts (email/SMS notifications)
- [ ] Technical indicators (RSI, MACD, Bollinger Bands)

### **Medium-term (Q2 2026)**
- [ ] Sector comparison and peer benchmarking
- [ ] Options chain analysis
- [ ] Screener builder (custom filters)
- [ ] Export to Excel/PDF reports

### **Long-term (H2 2026)**
- [ ] Multi-language support (Hindi, Tamil, Telugu)
- [ ] Mobile app (React Native)
- [ ] API marketplace (rate limiting per API key)
- [ ] Backtesting engine for strategies

---

## 🤝 **Contributing**

Contributions welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes (`git commit -m 'Add amazing feature'`)
4. **Push** to branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### **Development Guidelines**

- Write tests for new features (34+ tests already exist)
- Follow TypeScript strict mode
- Use ESLint configuration
- Document complex functions with JSDoc
- Update relevant documentation files

---

## 📝 **License**

MIT License - see [LICENSE](LICENSE) file for details.

---

## 👨‍💻 **Author**

**Your Name**  
📧 Email: your.email@example.com  
💼 LinkedIn: [linkedin.com/in/yourprofile](https://linkedin.com/in/yourprofile)  
🐙 GitHub: [github.com/yourusername](https://github.com/yourusername)

---

## 🙏 **Acknowledgments**

- **Screener.in** - Indian stock fundamentals data
- **BSE India** - Annual report PDFs
- **Yahoo Finance** - Real-time stock prices
- **Google Gemini** - AI-powered document analysis
- **MongoDB Atlas** - Persistent database hosting
- **Vercel** - Serverless deployment platform

---

## ⚠️ **Disclaimer**

This is a **personal finance research tool** for educational purposes only. Not financial advice. All investment decisions should be made after thorough research and professional consultation. Past performance does not guarantee future results.

---

<div align="center">

**⭐ Built for the Singapore Fintech Community ⭐**

**94% Cost Reduction | 34 Security Tests | MongoDB Persistent Cache**

[Report Bug](https://github.com/yourusername/ai-stock-analysis/issues) · [Request Feature](https://github.com/yourusername/ai-stock-analysis/issues) · [Documentation](./ARCHITECTURE.md)

**Made with ❤️ and TypeScript**

</div>
