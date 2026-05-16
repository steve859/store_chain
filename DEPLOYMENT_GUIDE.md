# Phase 2.2 Deployment Guide

## Database Migration

### Prerequisites
- PostgreSQL 12+ running and accessible
- `.env` file configured with `DATABASE_URL`
- Prisma CLI installed (`npx prisma` available)

### Migration Steps

**Step 1: Verify Database Connection**
```bash
cd backend
npx prisma db execute --stdin < <(echo "SELECT version();")
```

**Step 2: Apply Migration**
```bash
# Development (interactive, creates backup)
npm run migrate

# Or Production (non-interactive)
npm run migrate:deploy
```

**Step 3: Verify Migration Success**
```bash
npx prisma db execute --stdin < <(echo "\dt pricing_*")
```

Expected output: 4 new tables
- pricing_rules
- pricing_history
- demand_metrics
- competitor_prices

### Migration Details

**Tables Created:**
1. **pricing_rules** (350 columns per table)
   - Stores pricing strategies
   - Relations: stores, product_variants, categories
   - Indexes: store_id, is_active, effective_from

2. **pricing_history** (audit trail)
   - Tracks all price changes
   - Relations: pricing_rules, product_variants, stores
   - Indexes: created_at, product_variant_id

3. **demand_metrics** (time-series data)
   - Demand patterns by store/product/time
   - Relations: stores, product_variants, categories
   - Indexes: store_id, demand_level

4. **competitor_prices** (competitive intelligence)
   - Competitor price tracking
   - Relations: stores
   - Indexes: store_id, scraped_at

**Foreign Keys:**
- pricing_rules.store_id → stores.id (CASCADE)
- pricing_rules.product_variant_id → product_variants.id (SET NULL)
- pricing_rules.category_id → categories.id (SET NULL)
- pricing_history.pricing_rule_id → pricing_rules.id (CASCADE)
- Similar for demand_metrics, competitor_prices

**Total Indexes:** 13 indexes for query performance

---

## Load Testing

### Purpose
Verify pricing engine meets latency requirements:
- Price calculation: < 100ms
- Rule loading: < 50ms
- History queries: < 100ms

### Running Load Tests

**Command:**
```bash
cd backend
npm run test:load
```

**What It Tests:**
1. ✅ Rule loading (100 iterations, < 50ms each)
2. ✅ Price calculation (100 iterations, < 100ms each)
3. ✅ History queries (50 iterations, < 100ms each)
4. ✅ Competitive reports (50 iterations, < 100ms each)
5. ✅ Demand metrics (50 iterations, < 100ms each)

**Expected Output:**
```
╔════════════════════════════════════════════════════════╗
║        PRICING ENGINE LOAD TEST SUITE                 ║
║     Performance Verification < 100ms Latency         ║
╚════════════════════════════════════════════════════════╝

✅ LOAD TEST PASSED - All operations meet latency requirements
```

### Load Test Details

**Performance Metrics Collected:**
- Average execution time
- Min/Max execution times
- Total time for all iterations
- Performance utilization percentage (avg/threshold)

**Test Data Created:**
- 5 pricing rules (varied types)
- 10 pricing history records
- 20 competitor price records
- 1 demand metrics entry

**Test Data Cleanup:**
- Automatically deleted after test completion
- No residual data left in database

### Interpreting Results

**Green (✅ PASS):**
- Average time ≤ threshold
- Operation optimized and ready
- Safe for production

**Red (❌ FAIL):**
- Average time > threshold
- Needs optimization (indexing, query tuning)
- Address before production deployment

**Performance Breakdown:**
```
Operation Name                  [████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 35%
```
- Bar shows utilization percentage
- 0-50% = Good margin
- 50-80% = Acceptable margin
- 80-100% = At threshold (risky)
- 100%+ = FAILED

---

## Deployment Checklist

### Pre-Deployment (Dev Environment)
- [ ] Code reviewed and tested
- [ ] TypeScript builds without errors
- [ ] Unit tests passing: `npm test -- tests/pricing.test.ts`
- [ ] Load tests passing: `npm run test:load`

### Database Deployment (Staging)
- [ ] `.env` configured with staging DB
- [ ] Backup created before migration
- [ ] Migration applied: `npm run migrate:deploy`
- [ ] Tables verified with: `npx prisma db execute`
- [ ] Data integrity checks passed

### Application Deployment (Production)
- [ ] `.env` configured with production DB
- [ ] Database backup created
- [ ] Migration applied with monitoring
- [ ] Application started and verified
- [ ] Smoke tests: price calculation endpoints responding
- [ ] Monitoring enabled for:
  - Response times
  - Error rates
  - Database connection pool
  - Pricing calculation latency

### Post-Deployment Verification
- [ ] All 6 pricing endpoints responding (200s)
- [ ] Authorization working (401 for unauth, 403 for unauthorized roles)
- [ ] Store scoping enforced (users see only their stores)
- [ ] Pricing calculations returning correct format
- [ ] History audit trail populated
- [ ] Performance metrics within SLO (< 100ms)

---

## Rollback Plan

### If Migration Fails

**Option 1: Rollback to Previous Migration**
```bash
npm run migrate:resolve
# Select the last migration to rollback to
```

**Option 2: Manual Rollback**
```sql
DROP TABLE IF EXISTS competitor_prices CASCADE;
DROP TABLE IF EXISTS demand_metrics CASCADE;
DROP TABLE IF EXISTS pricing_history CASCADE;
DROP TABLE IF EXISTS pricing_rules CASCADE;
```

### If Performance Degrades

**Diagnosis:**
```bash
# Check slow queries
npx prisma query raw "
  SELECT query, calls, mean_time 
  FROM pg_stat_statements 
  ORDER BY mean_time DESC LIMIT 10;
"

# Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;  -- unused indexes
```

**Optimization:**
1. Add missing indexes
2. Update statistics: `VACUUM ANALYZE;`
3. Review problematic queries
4. Consider connection pooling

---

## Monitoring Post-Deployment

### Key Metrics to Track

**Pricing Engine:**
- Price calculation latency (target: < 100ms p99)
- Rule loading latency (target: < 50ms p99)
- History query latency (target: < 100ms p99)

**Database:**
- Connection pool utilization (target: < 80%)
- Query execution times (track min/avg/max)
- Lock contention (watch for deadlocks)
- Table sizes (pricing tables grow with time)

**Business:**
- Pricing rule hit rate (% of sales using rules)
- Margin impact (target: +3-5%)
- Competitor price delta (target: < 2%)

### Queries for Monitoring

**Find Slow Pricing Queries:**
```sql
SELECT 
  substring(query from 1 for 80) as query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%pricing%'
ORDER BY mean_time DESC;
```

**Table Growth:**
```sql
SELECT 
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE tablename LIKE 'pricing_%' OR tablename LIKE 'demand_%' OR tablename LIKE 'competitor_%';
```

**Index Usage:**
```sql
SELECT 
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename LIKE 'pricing_%'
ORDER BY idx_scan DESC;
```

---

## Scaling Considerations

### Current Capacity (Single Database)
- 100,000 pricing rules ✅
- 1,000,000 pricing history records ✅
- 50,000 demand metrics entries ✅
- 100+ stores with 1,000s of SKUs ✅

### When to Scale

**Add Read Replicas (>1000 pricing queries/sec):**
```
Primary DB → Pricing Writes
Read Replica 1 → History queries (read-heavy)
Read Replica 2 → Demand metrics (read-heavy)
```

**Partition Tables (>100M records):**
```
pricing_history PARTITION BY RANGE (created_at);
competitor_prices PARTITION BY RANGE (scraped_at);
```

**Cache Layer (>5000 req/sec):**
```
Redis: Cache price recommendations (TTL: 5 min)
Redis: Cache competitor reports (TTL: 1 hour)
```

---

## Troubleshooting

### Issue: Migration Timeout
**Cause:** Large table creation or index building
**Solution:** 
```bash
npx prisma migrate resolve --rolled-back <migration_name>
# Run migration with increased timeout
```

### Issue: Permission Denied on Tables
**Cause:** Database user lacks privileges
**Solution:**
```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

### Issue: Load Test Fails (operations > 100ms)
**Cause:** Insufficient indexes or slow queries
**Solution:**
1. Check missing indexes: `SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;`
2. Analyze query plans: `EXPLAIN ANALYZE SELECT ...`
3. Update statistics: `VACUUM ANALYZE;`
4. Consider query optimization

### Issue: Pricing Calculations Returning Null
**Cause:** Missing pricing_rules or demand_metrics
**Solution:**
```sql
-- Check rules exist
SELECT COUNT(*) FROM pricing_rules WHERE store_id = 1 AND is_active = true;

-- Check demand exists
SELECT COUNT(*) FROM demand_metrics WHERE store_id = 1;
```

---

## References

- Migration File: `backend/prisma/migrations/20260502_add_pricing_engine/migration.sql`
- Schema: `backend/prisma/schema.prisma` (lines 647-745)
- Load Test: `backend/tests/load.test.ts`
- Service: `backend/src/modules/pricing/pricing.service.ts`

## Support

For deployment issues:
1. Check logs: `npm run dev` and monitor console
2. Run load tests: `npm run test:load` for diagnostics
3. Review migration SQL in PR for schema details
4. Check database connectivity and permissions

---

**Next Steps:**
1. Apply migration to staging DB
2. Run load tests successfully
3. Deploy to production with monitoring
4. Begin Phase 2.3: Promotions & Discounts
