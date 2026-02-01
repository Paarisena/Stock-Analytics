# Security Configuration

## Required Environment Variables

Add these to your `.env` file:

```bash
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/stockdb

# AI/ML APIs
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Screener.in Credentials (for Indian stocks)
SCREENER_EMAIL=your_email@example.com
SCREENER_PASSWORD=your_password_here

# Optional: API Key Authentication
REQUIRE_API_KEY=false
API_KEY_1=your-secret-key-1
API_KEY_2=your-secret-key-2
API_KEY_3=your-secret-key-3

# Optional: CORS Configuration (Production)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Node Environment
NODE_ENV=development
```

## Security Features Implemented

### ✅ **Input Validation & Sanitization**
- Path traversal protection (`../`, null bytes)
- Unicode normalization (prevents unicode attacks)
- XSS prevention (script tag removal, HTML escaping)
- Query length limits (500 chars max)
- Stock symbol validation (alphanumeric + dots only)

### ✅ **MongoDB Injection Prevention**
- Operator blocking (`$where`, `$regex`, `$ne`, etc.)
- Type validation before database queries
- Symbol sanitization before MongoDB operations

### ✅ **SSRF (Server-Side Request Forgery) Protection**
- URL whitelist (Yahoo Finance, Screener.in, NSE, etc.)
- Private IP range blocking (127.0.0.0/8, 10.0.0.0/8, 192.168.0.0/16)
- HTTPS enforcement (production only)
- Request timeouts (5s for quotes, 10s for scraping, 30s for AI)

### ✅ **Error Message Sanitization**
- Generic error codes sent to users (`SERVICE_UNAVAILABLE`, `REQUEST_TIMEOUT`)
- Detailed errors logged server-side only
- Credential redaction in logs
- Stack trace filtering

### ✅ **Rate Limiting**
- 30 requests per minute per IP address
- In-memory storage (single-server deployments)
- Automatic cleanup of expired entries
- 429 status code with `Retry-After` header

### ✅ **CORS Configuration**
- Environment-based origin whitelisting
- Development origins (localhost:3000, 3001)
- Production origins from `ALLOWED_ORIGINS` env var
- Credentials support enabled
- Preflight request handling

### ✅ **Security Headers**
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; ...
Referrer-Policy: strict-origin-when-cross-origin
```

### ✅ **Credential Protection**
- No credentials logged to console
- Redacted logging for sensitive fields
- Environment variable validation at startup
- Secure credential storage (environment variables only)

### ✅ **Request Validation**
- Request size limit (100KB)
- Content-Type validation
- JSON parsing with error handling
- Required field validation

## Security Testing

### Manual Tests

```bash
# Test rate limiting (should fail on 31st request)
for i in {1..35}; do curl -X POST http://localhost:3000/api/search -d '{"query":"AAPL"}' -H "Content-Type: application/json"; done

# Test invalid symbol (should reject)
curl -X POST http://localhost:3000/api/search -d '{"query":"../etc/passwd"}' -H "Content-Type: application/json"

# Test MongoDB injection (should reject)
curl -X POST http://localhost:3000/api/search -d '{"query":"{\"$ne\":null}"}' -H "Content-Type: application/json"

# Test XSS attempt (should sanitize)
curl -X POST http://localhost:3000/api/search -d '{"query":"<script>alert(1)</script>"}' -H "Content-Type: application/json"

# Test oversized request (should reject with 413)
curl -X POST http://localhost:3000/api/search -d "$(printf '{"query":"%0.s*",100000}' {1..100000})" -H "Content-Type: application/json"
```

### Automated Testing Tools

```bash
# Install OWASP ZAP for API security testing
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3000/api/search

# Install npm audit for dependency scanning
pnpm audit

# Install Snyk for real-time vulnerability monitoring
pnpm add -g snyk
snyk test
```

## Known Limitations

1. **Rate Limiting**: In-memory storage resets on server restart
   - **Mitigation**: Upgrade to Redis/MongoDB-based rate limiting for production
   
2. **CORS Origins**: Must manually update `ALLOWED_ORIGINS` for each deployment
   - **Mitigation**: Use wildcard subdomains or automated deployment scripts

3. **API Key Rotation**: No automated rotation mechanism
   - **Mitigation**: Manually rotate keys quarterly, implement versioning

4. **Logging**: Console-based logging only (not production-ready)
   - **Mitigation**: Integrate with DataDog, Splunk, or ELK stack

## Compliance Status

| Standard | Status | Notes |
|----------|--------|-------|
| OWASP Top 10 | ⚠️ 6/10 Pass | Improved from 2/10 |
| PCI-DSS | N/A | No payment processing |
| GDPR | ⚠️ Partial | Add data retention policies |
| SOC 2 | ❌ Not Compliant | Requires audit trail system |

## Next Steps for Production

1. **Deploy Redis for rate limiting** (eliminates restart vulnerability)
2. **Integrate SIEM (Splunk/DataDog)** for centralized logging
3. **Set up Sentry** for error monitoring and alerting
4. **Enable API key authentication** (`REQUIRE_API_KEY=true`)
5. **Configure production domains** in `ALLOWED_ORIGINS`
6. **Set up automated security scanning** (GitHub Actions + Snyk)
7. **Implement request signing** for enhanced API security
8. **Add Web Application Firewall (WAF)** (Cloudflare/AWS WAF)

## Incident Response

If you detect suspicious activity:

1. Check logs for security events: `grep "🚨 \[Security" logs/`
2. Identify attacker IP: Review rate limit violations
3. Temporarily block IP: Add to firewall rules
4. Rotate API keys: Update `.env` and restart service
5. Review audit trail: Check database access patterns
6. Notify stakeholders: Security team and management

## Support

For security questions or to report vulnerabilities:
- Email: security@yourdomain.com
- Bug Bounty: (if applicable)
- Security Policy: See SECURITY.md

---

**Last Updated**: February 1, 2026  
**Next Audit Due**: March 1, 2026
