import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/modules/pricing/pricing.service', () => ({
  pricingService: {
    createPricingRule: jest.fn(),
    calculateRecommendedPrice: jest.fn(),
    getPricingHistory: jest.fn(),
    getCompetitivePricingReport: jest.fn(),
    updateDemandMetrics: jest.fn(),
    recordCompetitorPrice: jest.fn(),
  },
}));

jest.mock('../src/modules/audit_logs/audit_logs.service', () => ({
  AuditLogsService: {
    createLog: jest.fn(),
  },
}));

import app from '../src/app';
import { pricingService } from '../src/modules/pricing/pricing.service';
import { AuditLogsService } from '../src/modules/audit_logs/audit_logs.service';

const pricingServiceMock = pricingService as jest.Mocked<typeof pricingService>;
const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'pricing-middleware@example.com',
    role: 'admin',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Pricing middleware baseline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 before store-scope checks when unauthenticated', async () => {
    const res = await request(app)
      .get('/api/v1/pricing/recommend')
      .set('x-store-id', '1')
      .query({ currentPrice: 10 });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
    expect(pricingServiceMock.calculateRecommendedPrice).not.toHaveBeenCalled();
  });

  it('returns 400 before RBAC when authenticated request has no active store', async () => {
    const res = await request(app)
      .get('/api/v1/pricing/recommend')
      .set('Authorization', `Bearer ${signToken({ role: 'manager', storeIds: [], primaryStoreId: null })}`)
      .query({ currentPrice: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'storeId is required (active store not resolved)' });
    expect(pricingServiceMock.calculateRecommendedPrice).not.toHaveBeenCalled();
  });

  it('returns 403 for CASHIER on pricing reads and writes', async () => {
    const readRes = await request(app)
      .get('/api/v1/pricing/recommend')
      .set('Authorization', `Bearer ${signToken({ role: 'cashier' })}`)
      .set('x-store-id', '1')
      .query({ currentPrice: 10 });

    const writeRes = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ role: 'cashier' })}`)
      .set('x-store-id', '1')
      .send({
        ruleName: 'Forbidden Rule',
        ruleType: 'fixed',
        basePrice: 10,
        effectiveFrom: new Date().toISOString(),
      });

    expect(readRes.status).toBe(403);
    expect(writeRes.status).toBe(403);
    expect(readRes.body.message).toContain('Forbidden');
    expect(writeRes.body.message).toContain('Forbidden');
    expect(pricingServiceMock.calculateRecommendedPrice).not.toHaveBeenCalled();
    expect(pricingServiceMock.createPricingRule).not.toHaveBeenCalled();
  });

  it('returns 403 for INVENTORY_STAFF on pricing routes', async () => {
    const readRes = await request(app)
      .get('/api/v1/pricing/history/1')
      .set('Authorization', `Bearer ${signToken({ role: 'inventory_staff' })}`)
      .set('x-store-id', '1');

    const writeRes = await request(app)
      .post('/api/v1/pricing/competitor-prices')
      .set('Authorization', `Bearer ${signToken({ role: 'inventory_staff' })}`)
      .set('x-store-id', '1')
      .send({
        productSku: 'SKU-1',
        competitorName: 'Competitor',
        competitorPrice: 10,
        ourPrice: 11,
      });

    expect(readRes.status).toBe(403);
    expect(writeRes.status).toBe(403);
    expect(pricingServiceMock.getPricingHistory).not.toHaveBeenCalled();
    expect(pricingServiceMock.recordCompetitorPrice).not.toHaveBeenCalled();
  });

  it('allows DISTRICT_MANAGER to reach read and write handler paths', async () => {
    pricingServiceMock.getCompetitivePricingReport.mockResolvedValueOnce({
      totalProducts: 0,
      competitiveProducts: 0,
      competitivePercentage: 0,
      avgPriceDifference: 0,
      report: [],
    });
    pricingServiceMock.updateDemandMetrics.mockResolvedValueOnce({
      demandLevel: 75,
      inventoryLevel: 50,
      lastCalculated: new Date('2026-05-24T00:00:00.000Z'),
    });

    const readRes = await request(app)
      .get('/api/v1/pricing/competitors')
      .set('Authorization', `Bearer ${signToken({ role: 'district_manager' })}`)
      .set('x-store-id', '1');

    const writeRes = await request(app)
      .post('/api/v1/pricing/demand-metrics')
      .set('Authorization', `Bearer ${signToken({ role: 'district_manager' })}`)
      .set('x-store-id', '1')
      .send({
        dayOfWeek: 3,
        demandLevel: 75,
        inventoryLevel: 50,
      });

    expect(readRes.status).toBe(200);
    expect(writeRes.status).toBe(200);
    expect(pricingServiceMock.getCompetitivePricingReport).toHaveBeenCalledWith(1);
    expect(pricingServiceMock.updateDemandMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        dayOfWeek: 3,
        demandLevel: 75,
        inventoryLevel: 50,
      }),
    );
  });

  it('allows STORE_MANAGER or legacy manager to reach existing handler paths', async () => {
    pricingServiceMock.calculateRecommendedPrice.mockResolvedValueOnce({
      currentPrice: 10,
      recommendedPrice: 10,
      priceChangePercent: 0,
      appliedRules: [],
      reason: 'No pricing rules applied',
    });
    pricingServiceMock.createPricingRule.mockResolvedValueOnce({
      id: 'rule-1',
      storeId: 1,
      ruleName: 'Allowed Rule',
      ruleType: 'fixed',
      basePrice: 10,
      isActive: true,
    });

    const readRes = await request(app)
      .get('/api/v1/pricing/recommend')
      .set('Authorization', `Bearer ${signToken({ role: 'store_manager' })}`)
      .set('x-store-id', '1')
      .query({ currentPrice: 10 });

    const writeRes = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ role: 'manager' })}`)
      .set('x-store-id', '1')
      .send({
        ruleName: 'Allowed Rule',
        ruleType: 'fixed',
        basePrice: 10,
        effectiveFrom: new Date().toISOString(),
      });

    expect(readRes.status).toBe(200);
    expect(writeRes.status).toBe(201);
    expect(writeRes.body).toEqual({
      message: 'Pricing rule created successfully',
      rule: {
        id: 'rule-1',
        storeId: 1,
        ruleName: 'Allowed Rule',
        ruleType: 'fixed',
        basePrice: 10,
        isActive: true,
      },
    });
    expect(pricingServiceMock.calculateRecommendedPrice).toHaveBeenCalledWith(1, 10, undefined, undefined, undefined);
    expect(pricingServiceMock.createPricingRule).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        ruleName: 'Allowed Rule',
        ruleType: 'fixed',
        basePrice: 10,
      }),
    );
  });

  it('writes PRICING_RULE_CREATED audit log after successful pricing rule creation', async () => {
    pricingServiceMock.createPricingRule.mockResolvedValueOnce({
      id: 'rule-audit-1',
      storeId: 1,
      ruleName: 'Audited Rule',
      ruleType: 'fixed',
      basePrice: 10,
      isActive: true,
    });

    const res = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'admin' })}`)
      .set('x-store-id', '1')
      .set('User-Agent', 'pricing-test-agent')
      .send({
        ruleName: 'Audited Rule',
        ruleType: 'fixed',
        basePrice: 10,
        minPrice: 8,
        maxPrice: 12,
        priority: 4,
        effectiveFrom: '2026-05-24T00:00:00.000Z',
        effectiveUntil: '2026-05-25T00:00:00.000Z',
        token: 'should-not-be-logged',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: 'Pricing rule created successfully',
      rule: {
        id: 'rule-audit-1',
        storeId: 1,
        ruleName: 'Audited Rule',
        ruleType: 'fixed',
        basePrice: 10,
        isActive: true,
      },
    });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRICING_RULE_CREATED',
        objectType: 'pricing_rule',
        objectId: 'rule-audit-1',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          storeId: 1,
          source: expect.objectContaining({ userAgent: 'pricing-test-agent' }),
          after: expect.objectContaining({ id: 'rule-audit-1', ruleName: 'Audited Rule' }),
          metadata: expect.objectContaining({
            ruleName: 'Audited Rule',
            ruleType: 'fixed',
            priority: 4,
            effectiveFrom: '2026-05-24T00:00:00.000Z',
            effectiveUntil: '2026-05-25T00:00:00.000Z',
            minPrice: 8,
            maxPrice: 12,
          }),
        }),
      }),
    );
    expect(JSON.stringify(auditLogsMock.createLog.mock.calls[0][0])).not.toContain('should-not-be-logged');
    expect(JSON.stringify(auditLogsMock.createLog.mock.calls[0][0])).not.toContain('token');
  });

  it('does not write audit log when pricing rule validation fails', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ role: 'admin' })}`)
      .set('x-store-id', '1')
      .send({
        ruleName: 'Invalid Rule',
        ruleType: 'invalid_type',
        basePrice: 10,
        effectiveFrom: '2026-05-24T00:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(pricingServiceMock.createPricingRule).not.toHaveBeenCalled();
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('does not write success audit log when pricing service fails', async () => {
    pricingServiceMock.createPricingRule.mockRejectedValueOnce(new Error('create failed'));

    const res = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ role: 'admin' })}`)
      .set('x-store-id', '1')
      .send({
        ruleName: 'Failing Rule',
        ruleType: 'fixed',
        basePrice: 10,
        effectiveFrom: '2026-05-24T00:00:00.000Z',
      });

    expect(res.status).toBe(500);
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('keeps pricing rule response successful when audit logging rejects', async () => {
    pricingServiceMock.createPricingRule.mockResolvedValueOnce({
      id: 'rule-audit-fail',
      storeId: 1,
      ruleName: 'Audit Failure Rule',
      ruleType: 'fixed',
      basePrice: 10,
      isActive: true,
    });
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));

    const res = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ role: 'admin' })}`)
      .set('x-store-id', '1')
      .send({
        ruleName: 'Audit Failure Rule',
        ruleType: 'fixed',
        basePrice: 10,
        effectiveFrom: '2026-05-24T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.rule.id).toBe('rule-audit-fail');
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRICING_RULE_CREATED' }));
  });

  it('writes DEMAND_METRICS_UPDATED audit log after successful demand metrics update', async () => {
    pricingServiceMock.updateDemandMetrics.mockResolvedValueOnce({
      demandLevel: 80,
      inventoryLevel: 25,
      lastCalculated: new Date('2026-05-24T00:00:00.000Z'),
    });

    const res = await request(app)
      .post('/api/v1/pricing/demand-metrics')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'district_manager' })}`)
      .set('x-store-id', '1')
      .send({
        productVariantId: 3,
        categoryId: 4,
        dayOfWeek: 2,
        hourOfDay: 9,
        demandLevel: 80,
        inventoryLevel: 25,
      });

    expect(res.status).toBe(200);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEMAND_METRICS_UPDATED',
        objectType: 'demand_metrics',
        objectId: '1-3-4-2-9',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          storeId: 1,
          after: expect.objectContaining({ demandLevel: 80, inventoryLevel: 25 }),
          metadata: expect.objectContaining({
            productVariantId: 3,
            categoryId: 4,
            dayOfWeek: 2,
            hourOfDay: 9,
            demandLevel: 80,
            inventoryLevel: 25,
          }),
        }),
      }),
    );
  });

  it('writes COMPETITOR_PRICE_RECORDED audit log after successful competitor price record', async () => {
    pricingServiceMock.recordCompetitorPrice.mockResolvedValueOnce({
      isCompetitive: true,
      priceDiffPercent: '-5.00',
    });

    const res = await request(app)
      .post('/api/v1/pricing/competitor-prices')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'store_manager' })}`)
      .set('x-store-id', '1')
      .send({
        productSku: 'SKU-AUDIT',
        competitorName: 'MegaMart',
        competitorPrice: 10,
        ourPrice: 9.5,
        password: 'should-not-be-logged',
      });

    expect(res.status).toBe(201);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPETITOR_PRICE_RECORDED',
        objectType: 'competitor_price',
        objectId: undefined,
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          storeId: 1,
          metadata: expect.objectContaining({
            productSku: 'SKU-AUDIT',
            competitorName: 'MegaMart',
            competitorPrice: 10,
            ourPrice: 9.5,
            isCompetitive: true,
            priceDiffPercent: '-5.00',
          }),
        }),
      }),
    );
    expect(JSON.stringify(auditLogsMock.createLog.mock.calls[0][0])).not.toContain('should-not-be-logged');
    expect(JSON.stringify(auditLogsMock.createLog.mock.calls[0][0])).not.toContain('password');
  });
});
