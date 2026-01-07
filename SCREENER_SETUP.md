# Screener.in Integration Setup

## What This Does

Integrates with screener.in using your login credentials to fetch:
- ✅ Annual report data (financials, ratios, shareholding) - **HIGHEST QUALITY**
- ✅ Transcript summaries (via Gemini/Perplexity fallback) - **BEST APPROACH**
- ✅ 100% FREE (uses your account, no API costs)

**Hybrid Approach (Best of Both Worlds):**
- 📊 **Annual Reports**: Direct from screener.in (detailed HTML data)
- 📄 **Transcripts**: Summarized by Gemini/Perplexity (PDF transcripts are complex to parse)

## Setup Instructions

### Step 1: Install Dependencies

```bash
cd d:\AI\SearchFrontEnd\aisearchengine
npm install cheerio
```

### Step 2: Configure Credentials

Add these lines to your `.env` file:

```env
SCREENER_EMAIL=your_email@example.com
SCREENER_PASSWORD=your_password_here
```

**Security Notes:**
- ✅ `.env` is in `.gitignore` (won't be committed to GitHub)
- ✅ Use a unique password (not your main email password)
- ✅ Personal use only (not for commercial redistribution)
- ✅ Consider creating a dedicated screener.in account for automation

### Step 3: Test the Integration

Start your dev server and search for an Indian stock:

```bash
npm run dev
```

Then search for: **"TCS stock analysis"** or **"Infosys earnings"**

**Expected Log Output:**
```
🔐 [Screener.in] Attempting direct fetch with your account for TCS...
✅ [Screener Auth] Login successful! Session cached for 24 hours
� [Screener] Fetching annual report for TCS...
✅ [Screener] Fetched annual report for TCS (1670 chars)
📥 [Screener] Found transcript PDF: https://www.bseindia.com/...
ℹ️ [Screener] PDF transcripts require parsing - letting Gemini handle summarization
🔄 [Hybrid Mode] Will combine screener.in annual report + Gemini transcript
🆓 [Gemini Search] Attempting FREE earnings + annual report fetch for TCS...
✅ [Gemini Search] Got raw data - Now parsing with Gemini AI...
✅ [Hybrid] Final data: Transcript from Gemini, Annual Report from Screener.in Direct
```

## How It Works

### Hybrid 3-Tier System (Best of Both Worlds)

```
User Query for Indian Stock
   ↓
Phase 0: Screener.in Direct
   ├─ Login with your credentials
   ├─ Fetch annual report (HTML) ✅ 
   ├─ Find transcript PDFs (BSE/company IR)
   └─ Store annual report for later use

Phase 1: Gemini Search (FREE)
   ├─ Search web for transcript summaries
   ├─ Extract CEO/CFO remarks from news
   └─ Combine with screener annual report ✅

Phase 2: Perplexity (PAID fallback)
   ├─ Deep search for transcript data
   └─ Combine with screener annual report ✅

Final Result:
   📄 Transcript: Best available summary (Gemini/Perplexity)
   📊 Annual Report: Direct from screener.in (HIGHEST QUALITY)
```

**Why This Hybrid Approach?**
- ✅ **Annual reports** on screener.in are HTML (easy to parse, detailed)
- ⚠️ **Transcripts** on screener.in are PDFs (complex to parse)
- ✅ Gemini/Perplexity excel at summarizing transcript PDFs from web sources
- ✅ Best of both worlds: screener.in precision + AI summarization

### Rate Limiting

- **15 seconds** minimum between requests to screener.in
- Automatic session caching (24 hours)
- Respectful of server resources

### Data Quality Comparison

| Data Type | Screener.in Direct | Gemini/Perplexity | Final Approach |
|-----------|-------------------|-------------------|----------------|
| **Annual Report** | ⭐⭐⭐⭐⭐ Full HTML data | ⭐⭐⭐ Partial | **Screener.in** |
| **Transcript** | ⭐⭐ PDF link only | ⭐⭐⭐⭐ Excellent summaries | **Gemini/Perplexity** |
| **Cost** | FREE | FREE (Gemini) | **FREE** |

## Troubleshooting

### Issue: "Login failed - Invalid credentials"

**Solution:**
1. Double-check your email and password in `.env`
2. Try logging in manually at https://www.screener.in/login/
3. Make sure you're using email/password login (not Google OAuth)

### Issue: "Session expired"

**Solution:**
- This is normal! The systfound"

**This is expected!**
- Screener.in transcripts are PDFs (not HTML)
- System automatically uses Gemini/Perplexity for transcript summaries
- Annual report data from screener.in is still used (highest quality)
- This hybrid approach works perfectly
- Some companies don't publish transcripts on screener.in
- System will automatically fall back to Gemini Search (FREE)
- Works seamlessly without manual intervention

### Issue: "Rate limit warning"

**Solution:**
- This is expected! 15-second delay between requests is intentional
- Respects screener.in's servers
- Prevents account issues

## Supported Companies

Works with any Indian company on screener.in, including:
- TCS, Infosys, Wipro, HCL Tech, Tech Mahindra
- Reliance, Bharti Airtel
- HDFC Bank, ICICI Bank, SBI, Axis Bank
- Maruti, Tata Motors, Bajaj Auto
- Asian Paints, Titan
- Sun Pharma, Dr. Reddy's, Cipla, Divi's Lab
- And 5000+ more companies

## Legal & Ethical Usage

✅ **Allowed (Personal Use):**
- Using YOUR OWN screener.in account
- Personal investment research
- Reasonable rate limiting (15s between requests)
- Caching data to minimize requests

❌ **NOT Allowed:**
- Sharing/reselling scraped data
- Commercial redistribution
- Overloading their servers
- Sharing account credentials

**Terms of Service:** Personal, non-commercial use only as per screener.in ToS.

## Disabling Screener.in Integration

To temporarily disable (fall back to Gemini only):

1. Remove or comment out credentials in `.env`:
   ```env
   # SCREENER_EMAIL=your_email@example.com
   # SCREENER_PASSWORD=your_password_here
   ```

2. Or set to empty:
   ```env
   SCREENER_EMAIL=
   SCREENER_PASSWORD=
   ```

System will automatically skip Phase 0 and use Gemini Search instead.

## Performance

- **First request**: 5-10 seconds (login + fetch)
- **Subsequent requests**: 2-3 seconds (cached session)
- **Cache duration**: 90 days for transcripts
- **Session duration**: 24 hours before re-login

## Support

If you encounter issues:
1. Check console logs for detailed error messages
2. Verify credentials are correct
3. Test manual login at https://www.screener.in/login/
4. System will automatically fall back to Gemini if screener.in fails

---

**Enjoy highest quality earnings data! 🎉**
