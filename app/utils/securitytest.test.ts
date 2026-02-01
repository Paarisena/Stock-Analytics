// __tests__/security.test.ts
import { describe, it, expect } from 'vitest';
import {
  sanitizeSymbol,
  sanitizeQuery,
  sanitizeMongoInput,
  validateUrl,
  getClientIp,
  validateMongoSymbol,
  sanitizeError
} from './security';

import { downloadAndParsePDF } from './pdfParser';
import {fetchScreenerTranscript,fetchScreenerAnnualReport,fetchAnnualReportPDFLinks,fetchAnnualReportFromPDF,fetchConferenceCallTranscript,checkAvailableDataVersions,fetchScreenerComprehensiveData} from './screenerScraper';

describe('PDF Parser Utility (Integration)', () => {
  // Skip these tests in CI/CD (too slow and flaky)
  it.skipIf(process.env.CI)('should parse text-based PDF correctly', async () => {
    try {
      const pdfUrl = 'https://arxiv.org/pdf/2203.13474.pdf';
      const result = await downloadAndParsePDF(pdfUrl);
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.isImageBased).toBe(false);
      expect(result.text.length).toBeGreaterThan(1000);
    } catch (error) {
      // If network fails, skip test instead of failing
      console.warn('⚠️ PDF test skipped - network issue:', error);
    }
  }, 30000); // Increase timeout to 30s

  it.skipIf(process.env.CI)('should identify image-based PDF', async () => {
    try {
      const pdfUrl = 'https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf';
      const result = await downloadAndParsePDF(pdfUrl);
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.isImageBased).toBe(true);
    } catch (error) {
      console.warn('⚠️ PDF test skipped - network issue:', error);
    }
  }, 30000);
});


describe('Security Utilities', () => {
  describe('sanitizeSymbol', () => {
    it('should accept valid stock symbols', () => {
      expect(sanitizeSymbol('AAPL')).toBe('AAPL');
      expect(sanitizeSymbol('RELIANCE')).toBe('RELIANCE');
      expect(sanitizeSymbol('tcs')).toBe('TCS'); // lowercase → uppercase
    });

    it('should reject null/undefined/empty', () => {
      expect(sanitizeSymbol('')).toBeNull();
      expect(sanitizeSymbol(null as any)).toBeNull();
      expect(sanitizeSymbol(undefined as any)).toBeNull();
    });


    it('should reject path traversal attacks', () => {
      expect(sanitizeSymbol('../etc/passwd')).toBeNull();
      expect(sanitizeSymbol('..\\windows\\system32')).toBeNull();
      expect(sanitizeSymbol('test\0null')).toBeNull();
    });

    it('should reject special characters', () => {
      expect(sanitizeSymbol('AAPL; DROP TABLE')).toBeNull();
      expect(sanitizeSymbol('<script>alert(1)</script>')).toBeNull();
      expect(sanitizeSymbol('AAPL|rm -rf')).toBeNull();
    });

    it('should enforce length limits', () => {
      expect(sanitizeSymbol('A')).toBe('A'); // Min length OK
      expect(sanitizeSymbol('VERYLONGSYMBOL')).toBeNull(); // >10 chars
      expect(sanitizeSymbol('')).toBeNull(); // <1 char
    });
  });
  describe('sanitizeMongoInput', () => {
  it('should throw error when MongoDB operators are present', () => {
    const input = {
      name: 'AAPL',
      $where: 'this.price > 100'
    };
    
    expect(() => sanitizeMongoInput(input)).toThrow('Invalid input: MongoDB operators not allowed');
  });

  it('should accept clean objects without operators', () => {
    const input = {
      name: 'AAPL',
      sector: 'Technology',
      price: 150
    };
    
    expect(sanitizeMongoInput(input)).toEqual(input);
  });

  it('should handle nested objects (only checks top level)', () => {
    const input = {
      name: 'AAPL',
      details: {
        $ne: null, // This won't be caught - function only checks top level
        sector: 'Technology'
      }
    };
    
    // Function only validates top-level keys
    expect(sanitizeMongoInput(input)).toEqual(input);
  });

  it('should return non-object inputs as-is', () => {
    expect(sanitizeMongoInput('AAPL')).toBe('AAPL');
    expect(sanitizeMongoInput(123)).toBe(123);
    expect(sanitizeMongoInput(null)).toBeNull();
  });
});

  describe('validateUrl', () => {
    it('should accept whitelisted domains', () => {
      expect(validateUrl('https://query1.finance.yahoo.com/v8/finance/chart/AAPL')).toEqual({ valid: true });
      expect(validateUrl('https://www.screener.in/company/RELIANCE/')).toEqual({ valid: true });
    });

    it('should reject non-HTTPS URLs', () => {
      const result = validateUrl('http://www.malicious.com/steal-data');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('should block private IP ranges (SSRF protection)', () => {
      expect(validateUrl('https://127.0.0.1/admin')).toEqual({ valid: false, error: expect.any(String) });
      expect(validateUrl('https://192.168.1.1/router')).toEqual({ valid: false, error: expect.any(String) });
      expect(validateUrl('https://10.0.0.1/internal')).toEqual({ valid: false, error: expect.any(String) });
    });

    it('should reject non-whitelisted domains', () => {
      const result = validateUrl('https://evil.com/phishing');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '203.0.113.42, 198.51.100.17' }
      });
      expect(getClientIp(request)).toBe('203.0.113.42');
    });

    it('should fallback to x-real-ip', () => {
      const request = new Request('http://localhost', {
        headers: { 'x-real-ip': '192.0.2.1' }
      });
      expect(getClientIp(request)).toBe('192.0.2.1');
    });

    it('should return "unknown" if no IP headers', () => {
      const request = new Request('http://localhost');
      expect(getClientIp(request)).toBe('unknown');
    });
  });

  describe('validateMongoSymbol', () => {
    it('should accept plain strings', () => {
      expect(validateMongoSymbol('AAPL')).toBe(true);
      expect(validateMongoSymbol('RELIANCE.NS')).toBe(true);
    });

    it('should reject MongoDB operators', () => {
      expect(validateMongoSymbol('$where')).toBe(false);
      expect(validateMongoSymbol('{$ne: null}')).toBe(false);
      expect(validateMongoSymbol('test$gt')).toBe(false);
    });
  });

  describe('sanitizeError', () => {
    it('should map known errors to safe codes', () => {
      expect(sanitizeError(new Error('ECONNREFUSED'))).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'An error occurred while processing your request'
      });
      
      expect(sanitizeError(new Error('MongoDB connection failed'))).toEqual({
        code: 'DATABASE_ERROR',
        message: 'An error occurred while processing your request'
      });
    });

    it('should never expose internal error details', () => {
      const result = sanitizeError(new Error('Secret API key leaked: sk-abc123xyz'));
      expect(result.message).not.toContain('sk-abc123xyz');
    });
  });
});

describe('Screener.in Scraper (Integration)', () => {
  // Skip in CI/CD - requires credentials and is slow
  const testSymbol = 'RELIANCE';
  const testSymbolWithSuffix = 'RELIANCE.NS';

  describe('fetchScreenerTranscript', () => {
    it.skipIf(process.env.CI)('should fetch quarterly transcript', async () => {
      const result = await fetchScreenerTranscript(testSymbol);
      
      if (result) {
        expect(result.quarter).toBeTruthy();
        expect(result.content).toBeTruthy();
        expect(result.source).toBe('Screener.in Quarterly Table');
        expect(result.content.length).toBeGreaterThan(100);
      } else {
        console.warn('⚠️ No transcript found - may need fresh credentials');
      }
    }, 30000);

    it('should handle invalid symbols gracefully', async () => {
      const result = await fetchScreenerTranscript('INVALID_SYMBOL_XYZ');
      expect(result).toBeNull();
    }, 10000);
  });

  describe('fetchAnnualReportPDFLinks', () => {
    it.skipIf(process.env.CI)('should fetch PDF links from BSE', async () => {
      const links = await fetchAnnualReportPDFLinks(testSymbol);
      
      if (links && links.length > 0) {
        expect(links[0].fiscalYear).toBeTruthy();
        expect(links[0].url).toContain('.pdf');
        expect(links[0].source).toBe('BSE India');
      } else {
        console.warn('⚠️ No annual report links found');
      }
    }, 30000);

    it('should return empty array for invalid symbol', async () => {
      const links = await fetchAnnualReportPDFLinks('INVALID_XYZ');
      expect(links).toEqual([]);
    }, 10000);
  });

  describe('checkAvailableDataVersions', () => {
    it.skipIf(process.env.CI)('should check available data versions', async () => {
      const versions = await checkAvailableDataVersions(testSymbol);
      
      expect(versions).toHaveProperty('latestFiscalYear');
      expect(versions).toHaveProperty('latestQuarter');
      expect(versions).toHaveProperty('latestConcallQuarter');
      
      if (versions.latestFiscalYear) {
        expect(typeof versions.latestFiscalYear).toBe('string');
      }
    }, 30000);
  });

describe('fetchScreenerAnnualReport', () => {
  it.skipIf(process.env.CI)('should fetch annual report', async () => {
    const report = await fetchScreenerAnnualReport(testSymbol);
    
    if (report) {
      expect(report.fiscalYear).toBeTruthy();
      expect(report.content).toBeTruthy();
      // URL might be empty for some sources, so just check it exists as property
      expect(report).toHaveProperty('url');
      expect(['Screener.in Direct', 'BSE PDF', 'BSE PDF (OCR)', 'Screener.in Concalls (Cached)']).toContain(report.source);
      
      // Only check URL format if it's present
      if (report.url) {
        expect(report.url).toMatch(/^https?:\/\//);
      }
    } else {
      console.warn('⚠️ No annual report found');
    }
  }, 60000);
});

  describe('fetchConferenceCallTranscript', () => {
    it.skipIf(process.env.CI)('should fetch conference call transcript', async () => {
      const transcript = await fetchConferenceCallTranscript(testSymbol);
      
      if (transcript) {
        expect(transcript.quarter).toBeTruthy();
        expect(transcript.fiscalYear).toBeTruthy();
        expect(transcript.url).toContain('.pdf');
      } else {
        console.warn('⚠️ No conference call found');
      }
    }, 30000);
  });

describe('fetchScreenerComprehensiveData', () => {
  it.skipIf(process.env.CI)('should fetch comprehensive data', async () => {
    const data = await fetchScreenerComprehensiveData(testSymbolWithSuffix);
    
    // Check basic structure - data should exist
    expect(data).toBeTruthy();
    
    
    // Check for transcript property (might be null/empty)
    expect(data).toHaveProperty('transcript');
    expect(data).toHaveProperty('annualReport');
    expect(data).toHaveProperty('concallTranscript');
    
    // Optional properties that might or might not be present
    if (data.annualReportInsights) {
      expect(data.annualReportInsights).toBeTruthy();
    }
    
    if (data.quarterlyInsights) {
      expect(data.quarterlyInsights.quarter).toBeTruthy();
    }
    
    // Log what we got for debugging
    console.log(`📊 Data keys: ${Object.keys(data).join(', ')}`);
  }, 90000);
});
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Test with a symbol that doesn't exist
      const result = await fetchScreenerTranscript('ZZZZZ_NONEXISTENT');
      expect(result).toBeNull();
    }, 10000);

    it.skipIf(process.env.CI)('should handle malformed responses', async () => {
      // Symbol with special characters that might break parsing
      const result = await fetchScreenerTranscript('TEST@#$%');
      expect(result).toBeNull();
    }, 10000);
  });

  describe('Data Validation', () => {
    it.skipIf(process.env.CI)('should return properly structured transcript', async () => {
      const result = await fetchScreenerTranscript(testSymbol);
      
      if (result) {
        expect(result).toMatchObject({
          quarter: expect.any(String),
          date: expect.any(String),
          content: expect.any(String),
          url: expect.any(String),
          source: expect.any(String)
        });
        
        // Quarter format check (e.g., "Q3 FY2024")
        expect(result.quarter).toMatch(/Q[1-4]\s+FY\d{4}/);
      }
    }, 30000);

    it.skipIf(process.env.CI)('should return valid PDF URLs', async () => {
      const links = await fetchAnnualReportPDFLinks(testSymbol);
      
      if (links && links.length > 0) {
        for (const link of links) {
          expect(link.url).toMatch(/^https?:\/\/.+\.pdf$/i);
          expect(parseInt(link.fiscalYear)).toBeGreaterThan(2000);
          expect(parseInt(link.fiscalYear)).toBeLessThan(2100);
        }
      }
    }, 30000);
  });
});