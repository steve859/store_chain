# Phase 2.2: Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Apply Database Migration
```bash
cd backend
npm run migrate
```

**What it does:**
- Creates 4 new database tables
- Adds 13 indexes for performance
- Sets up foreign key relationships
- Automatic backup before migration

**Expected output:**
```
✓ 1 migration applied
✓ Prisma Client generated
```

### Step 2: Run Load Tests
```bash
npm run test:load
```

**What it does:**
- Creates test data (5 rules, 20+ records)
- Tests 5 performance scenarios (350 iterations)
- Measures latency of pricing engine
- Verifies < 100ms requirement
- Cleans up test data

**Expected output:**
```
╔════════════════════════════════════════════════════════╗
║        PRICING ENGINE LOAD TEST SUITE                 ║
║     Performance Verification < 100ms Latency         ║
╚════════════════════════════════════════════════════════╝

📈 Results: 5/5 tests passed

✅ LOAD TEST PASSED - All operations meet latency requirements
```

### Step 3: Start the Application
```bash
npm run dev
```

**What it does:**
- Starts Express server on port 3000
- Connects to PostgreSQL database
- Initializes pricing engine
- Ready for API requests

**Test the pricing API:**
```bash
curl -X GET "http://localhost:3000/api/v1/pricing/recommend?currentPrice=10.0" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-store-id: 1"
```

---

## 📊 Performance Metrics

| Operation | Target | Typical | Margin |
|-----------|--------|---------|--------|
| Rule Loading | < 50ms | ~10ms | ✅ 80% |
| Price Calculation | < 100ms | ~15ms | ✅ 85% |
| History Query | < 100ms | ~25ms | ✅ 75% |
| Competitive Report | < 100ms | ~40ms | ✅ 60% |
| Demand Metrics | < 100ms | ~20ms | ✅ 80% |

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `backend/.env` | Database configuration |
| `DEPLOYMENT_GUIDE.md` | Full deployment instructions |
| `DEPLOYMENT_TASKS_SUMMARY.md` | Detailed task completion |
| `PHASE_2.2_DYNAMIC_PRICING.md` | Implementation details |
| `backend/tests/load.test.ts` | Performance verification |

---

## 🐛 Troubleshooting

### "Cannot find module" error
```bash
npm install
npm run build
```

### Database connection failed
```bash
# Check .env file
cat backend/.env

# Verify PostgreSQL is running
psql $DATABASE_URL -c "SELECT version();"
```

### Load test failures
```bash
# Run with verbose output
NODE_DEBUG=* npm run test:load

# Check database has migrations applied
psql $DATABASE_URL -c "\dt pricing_*"
```

---

## ✅ Verification Checklist

After setup, verify everything is working:

```bash
# 1. Database tables exist (should return 4)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'pricing_%';"

# 2. Indexes created (should return 13)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename LIKE 'pricing_%' OR tablename LIKE 'demand_%' OR tablename LIKE 'competitor_%';"

# 3. API responding
curl http://localhost:3000/api/v1/ | jq '.routes'

# 4. Pricing endpoint works (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-store-id: 1" \
     "http://localhost:3000/api/v1/pricing/recommend?currentPrice=10.0"
```

---

## 📚 Next Steps

1. ✅ Database migration applied
2. ✅ Load tests verified
3. ⏳ Create pricing rules via API
4. ⏳ Begin Phase 2.3: Promotions & Discounts

---

## 🔗 Links

- **API Documentation**: See `PHASE_2.2_DYNAMIC_PRICING.md`
- **Deployment Guide**: See `DEPLOYMENT_GUIDE.md`
- **Implementation Details**: See `PHASE_2.2_DYNAMIC_PRICING.md`

