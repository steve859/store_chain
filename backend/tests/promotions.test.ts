import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/modules/promotions/promotions.service', () => ({
  PromotionService: {
    getAllPromotions: jest.fn(),
    getPromotionById: jest.fn(),
    createPromotion: jest.fn(),
    updatePromotion: jest.fn(),
    deletePromotion: jest.fn(),
    validateCode: jest.fn(),
  },
}));

import app from '../src/app';
import { PromotionService } from '../src/modules/promotions/promotions.service';

const promotionServiceMock = PromotionService as jest.Mocked<typeof PromotionService>;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'promotions-test@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Promotions routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for unauthenticated promotion reads', async () => {
    const res = await request(app).get('/api/v1/promotions');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
    expect(promotionServiceMock.getAllPromotions).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated wrong role on promotion writes', async () => {
    const res = await request(app)
      .post('/api/v1/promotions')
      .set('Authorization', `Bearer ${signToken({ role: 'INVENTORY_STAFF' })}`)
      .send({
        code: 'SAVE10',
        name: 'Save 10',
        type: 'PERCENTAGE',
        value: 10,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(promotionServiceMock.createPromotion).not.toHaveBeenCalled();
  });

  it('allows CASHIER to reach GET /api/v1/promotions existing handler behavior', async () => {
    const promotions = [{ id: 1, code: 'SAVE10', name: 'Save 10' }];
    promotionServiceMock.getAllPromotions.mockResolvedValueOnce(
      promotions as unknown as Awaited<ReturnType<typeof PromotionService.getAllPromotions>>,
    );

    const res = await request(app)
      .get('/api/v1/promotions')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`);

    expect(res.status).toBe(200);
    expect(promotionServiceMock.getAllPromotions).toHaveBeenCalled();
    expect(res.body).toEqual(promotions);
  });

  it('allows STORE_MANAGER to reach POST /api/v1/promotions existing handler behavior', async () => {
    const promotion = { id: 2, code: 'SAVE20', name: 'Save 20' };
    const payload = {
      code: 'SAVE20',
      name: 'Save 20',
      type: 'PERCENTAGE',
      value: 20,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    };
    promotionServiceMock.createPromotion.mockResolvedValueOnce(
      promotion as unknown as Awaited<ReturnType<typeof PromotionService.createPromotion>>,
    );

    const res = await request(app)
      .post('/api/v1/promotions')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(promotionServiceMock.createPromotion).toHaveBeenCalledWith(payload);
    expect(res.body).toEqual(promotion);
  });

  it('allows CASHIER to reach POST /api/v1/promotions/validate existing handler behavior', async () => {
    const promotion = { id: 3, code: 'SAVE5', name: 'Save 5' };
    promotionServiceMock.validateCode.mockResolvedValueOnce(
      promotion as unknown as Awaited<ReturnType<typeof PromotionService.validateCode>>,
    );

    const res = await request(app)
      .post('/api/v1/promotions/validate')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`)
      .send({ code: 'SAVE5', orderTotal: 100 });

    expect(res.status).toBe(200);
    expect(promotionServiceMock.validateCode).toHaveBeenCalledWith('SAVE5', 100);
    expect(res.body).toEqual({ valid: true, promotion });
  });

  it('keeps validation required-field response shape for allowed role', async () => {
    const res = await request(app)
      .post('/api/v1/promotions/validate')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`)
      .send({ code: 'SAVE5' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Code and orderTotal are required' });
    expect(promotionServiceMock.validateCode).not.toHaveBeenCalled();
  });
});
