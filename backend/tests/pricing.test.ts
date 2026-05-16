import request from 'supertest';
import app from '../src/app';
import prisma from '../src/db/prisma';
import jwt from 'jsonwebtoken';

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'test@example.com',
    role: 'admin',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Dynamic Pricing Engine', () => {
  let storeId = 1;
  let adminToken: string;
  let managerToken: string;

  beforeAll(() => {
    adminToken = signToken({ role: 'admin' });
    managerToken = signToken({ role: 'manager' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/pricing/rules', () => {
    it('should create a fixed price rule with admin token', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          ruleName: 'Weekend Premium',
          ruleType: 'fixed',
          basePrice: 9.99,
          minPrice: 8.99,
          maxPrice: 11.99,
          priority: 10,
          effectiveFrom: new Date(),
        });

      expect(res.status).toBe(201);
      expect(res.body.rule).toBeDefined();
      expect(res.body.rule.ruleName).toBe('Weekend Premium');
      expect(res.body.rule.basePrice).toBe(9.99);
    });

    it('should create a percentage-based pricing rule', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/rules')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          ruleName: 'Holiday Discount',
          ruleType: 'percentage',
          basePrice: 10.0,
          adjustmentValue: -15,
          adjustmentType: 'percentage',
          priority: 5,
          effectiveFrom: new Date(),
          effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

      expect(res.status).toBe(201);
      expect(res.body.rule.ruleType).toBe('percentage');
    });

    it('should reject invalid rule type', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          ruleName: 'Invalid Rule',
          ruleType: 'invalid_type',
          basePrice: 10.0,
          effectiveFrom: new Date(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid ruleType');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          ruleName: 'Incomplete Rule',
          ruleType: 'fixed',
          // missing basePrice and effectiveFrom
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });
  });

  describe('GET /api/v1/pricing/recommend', () => {
    beforeEach(async () => {
      // Create a test pricing rule
      await prisma.pricing_rules.create({
        data: {
          store_id: storeId,
          rule_name: 'Test Rule',
          rule_type: 'demand_based',
          base_price: 10.0,
          priority: 1,
          is_active: true,
          effective_from: new Date(),
        },
      });
    });

    it('should calculate recommended price with demand-based rule', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/recommend')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString())
        .query({
          currentPrice: 10.0,
          demandLevel: 85,
        });

      expect(res.status).toBe(200);
      expect(res.body.price).toBeDefined();
      expect(res.body.price.currentPrice).toBe(10.0);
      expect(res.body.price.recommendedPrice).toBeGreaterThan(10.0);
      expect(res.body.price.reason).toContain('demand');
    });

    it('should apply low demand discount', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/recommend')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-store-id', storeId.toString())
        .query({
          currentPrice: 10.0,
          demandLevel: 30,
        });

      expect(res.status).toBe(200);
      expect(res.body.price.recommendedPrice).toBeLessThan(10.0);
      expect(res.body.price.reason).toContain('Low demand');
    });

    it('should reject missing currentPrice', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/recommend')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString());

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('currentPrice');
    });
  });

  describe('GET /api/v1/pricing/history/:productVariantId', () => {
    beforeEach(async () => {
      const rule = await prisma.pricing_rules.create({
        data: {
          store_id: storeId,
          product_variant_id: 1,
          rule_name: 'Test History Rule',
          rule_type: 'fixed',
          base_price: 10.0,
          priority: 1,
          is_active: true,
          effective_from: new Date(),
        },
      });

      // Create test history records
      await prisma.pricing_history.create({
        data: {
          pricing_rule_id: rule.id,
          store_id: storeId,
          product_variant_id: 1,
          old_price: 9.99,
          new_price: 10.99,
          price_change_percent: 10,
          reason: 'Demand increase',
        },
      });
    });

    it('should retrieve pricing history for product', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/history/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString());

      expect(res.status).toBe(200);
      expect(res.body.history).toBeDefined();
      expect(Array.isArray(res.body.history)).toBe(true);
      if (res.body.history.length > 0) {
        expect(res.body.history[0]).toHaveProperty('oldPrice');
        expect(res.body.history[0]).toHaveProperty('newPrice');
        expect(res.body.history[0]).toHaveProperty('changePercent');
      }
    });

    it('should support custom days parameter', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/history/1')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-store-id', storeId.toString())
        .query({ days: 7 });

      expect(res.status).toBe(200);
      expect(res.body.history).toBeDefined();
    });
  });

  describe('GET /api/v1/pricing/competitors', () => {
    beforeEach(async () => {
      // Create competitor price records
      await prisma.competitor_prices.create({
        data: {
          store_id: storeId,
          product_sku: 'SKU-001',
          competitor_name: 'CompetitorA',
          competitor_price: 9.99,
          our_price: 9.89,
          price_difference: -0.1,
          price_diff_percent: -1.0,
          is_competitive: true,
          scraped_at: new Date(),
        },
      });

      await prisma.competitor_prices.create({
        data: {
          store_id: storeId,
          product_sku: 'SKU-002',
          competitor_name: 'CompetitorB',
          competitor_price: 12.0,
          our_price: 12.5,
          price_difference: 0.5,
          price_diff_percent: 4.17,
          is_competitive: false,
          scraped_at: new Date(),
        },
      });
    });

    it('should retrieve competitive pricing report', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/competitors')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString());

      expect(res.status).toBe(200);
      expect(res.body.report).toBeDefined();
      expect(res.body.report.totalProducts).toBeGreaterThanOrEqual(1);
      expect(res.body.report.competitivePercentage).toBeDefined();
    });
  });

  describe('POST /api/v1/pricing/demand-metrics', () => {
    it('should update demand metrics', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/demand-metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          productVariantId: 1,
          dayOfWeek: 3,
          demandLevel: 75,
          inventoryLevel: 50,
          salesCount24h: 20,
          salesCount7d: 120,
        });

      expect(res.status).toBe(200);
      expect(res.body.metrics).toBeDefined();
      expect(res.body.metrics.demandLevel).toBe(75);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/demand-metrics')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          productVariantId: 1,
          dayOfWeek: 3,
          // missing demandLevel and inventoryLevel
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });
  });

  describe('POST /api/v1/pricing/competitor-prices', () => {
    it('should record competitive price as admin', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/competitor-prices')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          productSku: 'SKU-NEW-001',
          competitorName: 'MegaMart',
          competitorPrice: 11.5,
          ourPrice: 11.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.isCompetitive).toBe(true);
      expect(res.body.priceDiffPercent).toBeDefined();
    });

    it('should mark as non-competitive when price is higher', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/competitor-prices')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          productSku: 'SKU-NEW-002',
          competitorName: 'LocalMart',
          competitorPrice: 10.0,
          ourPrice: 10.5,
        });

      expect(res.status).toBe(201);
      expect(res.body.isCompetitive).toBe(false);
    });
  });

  describe('Authorization', () => {
    it('should reject requests without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/rules')
        .set('x-store-id', storeId.toString())
        .send({
          ruleName: 'Unauthorized Rule',
          ruleType: 'fixed',
          basePrice: 10.0,
          effectiveFrom: new Date(),
        });

      expect(res.status).toBe(401);
    });

    it('should require admin/manager role for rule creation', async () => {
      const employeeToken = signToken({
        role: 'employee',
      });

      const res = await request(app)
        .post('/api/v1/pricing/rules')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-store-id', storeId.toString())
        .send({
          ruleName: 'Forbidden Rule',
          ruleType: 'fixed',
          basePrice: 10.0,
          effectiveFrom: new Date(),
        });

      expect(res.status).toBe(403);
    });

    it('should allow read-only access for all authenticated users', async () => {
      const employeeToken = signToken({
        role: 'employee',
      });

      const res = await request(app)
        .get('/api/v1/pricing/recommend')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('x-store-id', storeId.toString())
        .query({ currentPrice: 10.0 });

      expect(res.status).toBe(200);
    });
  });
});
