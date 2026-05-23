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

import app from '../src/app';
import { pricingService } from '../src/modules/pricing/pricing.service';

const pricingServiceMock = pricingService as jest.Mocked<typeof pricingService>;

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

  it('returns 403 for authenticated users without RBAC role on protected writes', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ role: 'cashier' })}`)
      .set('x-store-id', '1')
      .send({
        ruleName: 'Forbidden Rule',
        ruleType: 'fixed',
        basePrice: 10,
        effectiveFrom: new Date().toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(pricingServiceMock.createPricingRule).not.toHaveBeenCalled();
  });

  it('allows an authenticated allowed role to reach the existing handler path', async () => {
    pricingServiceMock.createPricingRule.mockResolvedValueOnce({
      id: 'rule-1',
      storeId: 1,
      ruleName: 'Allowed Rule',
      ruleType: 'fixed',
      basePrice: 10,
      isActive: true,
    });

    const res = await request(app)
      .post('/api/v1/pricing/rules')
      .set('Authorization', `Bearer ${signToken({ role: 'manager' })}`)
      .set('x-store-id', '1')
      .send({
        ruleName: 'Allowed Rule',
        ruleType: 'fixed',
        basePrice: 10,
        effectiveFrom: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
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
    expect(pricingServiceMock.createPricingRule).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        ruleName: 'Allowed Rule',
        ruleType: 'fixed',
        basePrice: 10,
      }),
    );
  });
});
