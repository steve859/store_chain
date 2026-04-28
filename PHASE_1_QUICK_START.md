# Phase 1 Quick Start Guide

## ✅ What's New

Phase 1 adds **enterprise-grade foundation** to your Store Chain system:

### Core Features Deployed
- 🚀 **Job Queue** - Async processing for emails, reports, inventory sync
- 📊 **Monitoring** - Prometheus metrics + Sentry error tracking + Pino logs
- 🔒 **Security** - Helmet headers, rate limiting, input validation
- 💾 **Persistence** - Graceful shutdown, error recovery

### Deployment Changes
- No database migrations needed
- 12 new npm dependencies (already installed)
- All code compiled to TypeScript (no breaking changes)

---

## 🚀 Quick Start

### 1. Install Dependencies (if not already done)
```bash
cd backend
npm install
```

### 2. Build the System
```bash
npm run build
```

Expected output: No errors, completed in ~30s

### 3. Start the Server
```bash
npm run dev
```

Expected banner:
```
╔════════════════════════════════════════╗
║   Store Chain API - Phase 1 Ready      ║
╠════════════════════════════════════════╣
║ 🚀 Server:   http://0.0.0.0:3000     ║
║ 📊 Metrics:  /metrics                  ║
║ 📋 Swagger:  /api-docs                 ║
║ 💚 Health:   /health                   ║
╚════════════════════════════════════════╝
```

### 4. Verify It's Working
```bash
# In another terminal
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","uptime":...}

curl http://localhost:3000/metrics
# prometheus_build_info{...}
```

---

## 📦 New Architecture

### Request Flow
```
Client Request
    ↓
HTTPS Redirect (prod only)
    ↓
Security Headers (Helmet)
    ↓
CORS Validation
    ↓
Rate Limiting (100/15min general, 5/15min auth)
    ↓
Request ID Tracking (X-Request-ID header)
    ↓
Input Validation (XSS/Injection prevention)
    ↓
Monitoring Middleware (latency measurement)
    ↓
Your Business Logic
    ↓
Response Tracking (metrics + logs)
    ↓
Error Monitoring (Sentry if error occurs)
    ↓
Response to Client
```

### Job Queue Flow
```
Your Code
    ↓
enqueueJob(JobType.SEND_EMAIL, data)
    ↓
Bull Queue
    ↓
Redis Persistence
    ↓
Job Processor (email, cache, report, etc)
    ↓
Success/Failure
    ↓
Sentry Alert (if failed after 3 retries)
```

---

## 🔧 Key Configuration

### Environment Variables
Create `backend/.env` from template:
```bash
cp backend/.env.phase1.example backend/.env
```

Critical settings:
```env
NODE_ENV=development          # Or: production, staging
PORT=3000
LOG_LEVEL=debug              # Or: info, warn, error
REDIS_HOST=localhost         # Job queue + caching
DATABASE_URL=postgresql://...  # Your database
```

### Redis Connection
The system expects Redis on `localhost:6379` by default.

**For local development:**
```bash
# Using docker-compose (recommended)
docker compose up -d redis

# Or run locally
redis-server
```

---

## 📊 Monitoring Your System

### Prometheus Metrics Endpoint
```bash
curl http://localhost:3000/metrics
```

**Key metrics to watch:**
- `http_request_duration_seconds` - API latency
- `http_request_total` - Request count by status
- `db_query_duration_seconds` - Database performance
- `job_queue_depth` - Pending jobs
- `job_processing_time_seconds` - Job performance

### Sentry Error Tracking (Optional)
1. Sign up at https://sentry.io (free tier available)
2. Create a Node.js project
3. Copy the DSN to `SENTRY_DSN` in `.env`

Then errors automatically send to Sentry dashboard.

### Application Logs
Logs are structured JSON in production, pretty-printed in development:

**Development:**
```
📨 GET /api/v1/products?limit=10 {query: {limit: '10'}, userId: 1}
```

**Production (JSON):**
```json
{"level":30,"time":"2024-01-15T10:30:45.123Z","pid":1234,"hostname":"server1","type":"http_request","method":"GET","path":"/api/v1/products","status":200,"duration_ms":45}
```

---

## 💼 Using the Job Queue

### Send an Email
```typescript
import { enqueueJob, JobType } from './lib/queues/jobQueue';

// In your order completion endpoint
await enqueueJob(JobType.SEND_EMAIL, {
  to: customer.email,
  subject: 'Order Confirmation',
  html: '<p>Your order #123 is confirmed!</p>'
});

// Immediately returns - email sends in background
response.json({ orderId: 123, status: 'processing' });
```

### Invalidate Product Cache
```typescript
import { enqueueJob, JobType } from './lib/queues/jobQueue';

// When product price changes
await enqueueJob(JobType.INVALIDATE_CACHE, {
  cacheKey: `catalog:store:${storeId}`,
  reason: 'Price update for product 456',
  storeId
});

// Next request gets fresh data
```

### Generate Reports
```typescript
await enqueueJob(JobType.GENERATE_REPORT, {
  type: 'daily_sales',
  storeId: 1,
  date: '2024-01-15',
  email: 'manager@store.com'
});
```

---

## 🔒 Security Features Enabled

| Feature | What It Does | Config |
|---------|-----------|--------|
| **Rate Limiting** | 100 requests/15min per IP | `apiLimiter` middleware |
| **Auth Brute Force** | 5 login attempts/15min | `authLimiter` middleware |
| **Security Headers** | CSP, HSTS, X-Frame-Options | `helmet()` |
| **Input Validation** | XSS & injection prevention | `validateInput` middleware |
| **HTTPS Redirect** | Force SSL in production | `httpsRedirect` middleware |
| **Payload Limit** | Max 10MB requests | `payloadSizeLimit` middleware |
| **Request Timeout** | 30 second max per request | `requestTimeout` middleware |

---

## 📈 Performance Targets

**Phase 1 Baselines:**
- API P95 latency: < 200ms (target for Phase 2+)
- Concurrent users: 1,000+ (with rate limiting)
- System uptime: 99.5% (graceful shutdown enabled)
- Error tracking: Real-time (Sentry integration)

Monitor these at `/metrics` endpoint.

---

## ⚠️ Common Issues & Fixes

### Issue: "Redis connection refused"
**Solution:** Start Redis
```bash
docker compose up -d redis
# or
redis-server
```

### Issue: "Bull queue stuck"
**Solution:** Check Redis is running and accessible:
```bash
redis-cli ping
# Expected: PONG
```

### Issue: "Too many requests" error
**Solution:** Rate limiting is working! Either:
- Wait 15 minutes for limit to reset
- Exempt endpoint by adding to `skip` in rate limiter config
- Increase limits in `src/middlewares/security.middleware.ts`

### Issue: High memory usage
**Solution:** Check Redis memory:
```bash
redis-cli info memory
```
If high, clear old jobs:
```bash
redis-cli FLUSHDB  # ⚠️ Careful! Clears all queues
```

---

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Load Testing (Optional - Phase 2+)
```bash
# Install K6
npm install -g k6

# Run load test
k6 run tests/load/checkout.load.ts
```

---

## 📋 Checklist Before Production

- [ ] Database configured and accessible
- [ ] Redis running and accessible
- [ ] `npm run build` completes without errors
- [ ] `curl http://localhost:3000/health` returns 200
- [ ] `curl http://localhost:3000/metrics` returns Prometheus format
- [ ] Logging working (check console for startup banner)
- [ ] All env vars set correctly
- [ ] Sentry DSN configured (optional but recommended)
- [ ] Security headers verified (via browser dev tools or curl -i)

---

## 📚 Documentation

| Document | Purpose | Read Time |
|----------|---------|-----------|
| `PHASE_1_COMPLETION_REPORT.md` | Full technical details | 15 min |
| `SYSTEM_UPGRADE_ANALYSIS.md` | 24-month roadmap | 20 min |
| `BUSINESS_REQUIREMENTS_DOCUMENT.md` | Feature specifications | 25 min |
| `TECHNICAL_ARCHITECTURE_REFERENCE.md` | API design & flows | 20 min |

---

## 🎯 Next Steps

### Immediate (Week 1)
1. Deploy Phase 1 to staging environment
2. Run 24-hour stability test
3. Monitor Sentry/Prometheus/logs
4. Gather team feedback

### Week 2
1. Deploy to production (blue-green recommended)
2. Monitor metrics dashboard
3. Set up alerting (high error rate, slow endpoints)

### Month 2 (Phase 2 Planning)
1. Start loyalty program implementation
2. Design dynamic pricing engine
3. Plan mobile app architecture

---

## 📞 Support

**Questions?** Review:
1. Check logs: `tail -f /var/log/store-chain/app.log` (if logging to file)
2. Check metrics: `http://localhost:3000/metrics`
3. Check Sentry: `https://sentry.io/` (if configured)
4. Review docs: `PHASE_1_COMPLETION_REPORT.md`

---

**Status: ✅ READY FOR DEPLOYMENT**

**Last Updated:** Phase 1 Completion
**Team:** Store Chain Development Team
