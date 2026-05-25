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

jest.mock('../src/modules/audit_logs/audit_logs.service', () => ({
  AuditLogsService: {
    createLog: jest.fn(),
  },
}));

import app from '../src/app';
import { PromotionService } from '../src/modules/promotions/promotions.service';
import { AuditLogsService } from '../src/modules/audit_logs/audit_logs.service';

const promotionServiceMock = PromotionService as jest.Mocked<typeof PromotionService>;
const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

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
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
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

  it('allows STORE_MANAGER to reach POST /api/v1/promotions existing handler behavior and writes audit log', async () => {
    const promotion = {
      id: 2,
      code: 'SAVE20',
      name: 'Save 20',
      type: 'PERCENTAGE',
      scope: 'ORDER',
      is_active: true,
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      usage_count: 0,
      value: 20,
      min_order_value: 0,
      max_discount: 50,
      store_codes: ['S001', 'S002'],
    };
    const payload = {
      code: 'SAVE20',
      name: 'Save 20',
      type: 'PERCENTAGE',
      value: 20,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      token: 'should-not-be-audited',
      password: 'should-not-be-audited',
      secret: 'should-not-be-audited',
    };
    promotionServiceMock.createPromotion.mockResolvedValueOnce(
      promotion as unknown as Awaited<ReturnType<typeof PromotionService.createPromotion>>,
    );

    const res = await request(app)
      .post('/api/v1/promotions')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER', userId: 77 })}`)
      .set('User-Agent', 'promotion-audit-test')
      .send(payload);

    expect(res.status).toBe(201);
    expect(promotionServiceMock.createPromotion).toHaveBeenCalledWith(payload);
    expect(res.body).toEqual(promotion);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROMOTION_CREATED',
        objectType: 'promotion',
        objectId: '2',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'promotion-audit-test' }),
          after: expect.objectContaining({
            id: 2,
            code: 'SAVE20',
            name: 'Save 20',
            value: 20,
          }),
          metadata: {
            storeCodesPresent: true,
            storeCodesCount: 2,
          },
        }),
      }),
    );
    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0].payload);
    expect(auditPayload).not.toContain('should-not-be-audited');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
  });

  it('writes PROMOTION_UPDATED with safe before/after snapshots and changed fields', async () => {
    const beforePromo = {
      id: 4,
      code: 'SAVE10',
      name: 'Save 10',
      type: 'PERCENTAGE',
      scope: 'ORDER',
      is_active: true,
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      usage_count: 0,
      value: 10,
      min_order_value: 0,
      max_discount: 50,
      store_codes: ['S001'],
    };
    const updatedPromo = {
      ...beforePromo,
      name: 'Save 15',
      value: 15,
      store_codes: ['S001', 'S002'],
    };
    const payload = {
      name: 'Save 15',
      value: 15,
      token: 'should-not-be-audited',
    };
    promotionServiceMock.getPromotionById.mockResolvedValueOnce(
      beforePromo as unknown as Awaited<ReturnType<typeof PromotionService.getPromotionById>>,
    );
    promotionServiceMock.updatePromotion.mockResolvedValueOnce(
      updatedPromo as unknown as Awaited<ReturnType<typeof PromotionService.updatePromotion>>,
    );

    const res = await request(app)
      .put('/api/v1/promotions/4')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN', userId: 88 })}`)
      .set('User-Agent', 'promotion-update-audit-test')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updatedPromo);
    expect(promotionServiceMock.getPromotionById).toHaveBeenCalledWith(4);
    expect(promotionServiceMock.updatePromotion).toHaveBeenCalledWith(4, payload);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROMOTION_UPDATED',
        objectType: 'promotion',
        objectId: '4',
        userId: 88,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'promotion-update-audit-test' }),
          before: expect.objectContaining({ id: 4, name: 'Save 10', value: 10 }),
          after: expect.objectContaining({ id: 4, name: 'Save 15', value: 15 }),
          metadata: expect.objectContaining({
            storeCodesPresent: true,
            storeCodesCount: 2,
            changedFields: expect.arrayContaining(['name', 'value', 'store_codes']),
          }),
        }),
      }),
    );
    expect(JSON.stringify(auditLogsMock.createLog.mock.calls[0][0].payload)).not.toContain('should-not-be-audited');
  });

  it('writes PROMOTION_DELETED after successful delete and preserves response shape', async () => {
    const beforePromo = {
      id: 5,
      code: 'SAVE5',
      name: 'Save 5',
      type: 'PERCENTAGE',
      scope: 'ORDER',
      is_active: true,
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      usage_count: 0,
      value: 5,
      min_order_value: 0,
      max_discount: 25,
      store_codes: [],
    };
    promotionServiceMock.getPromotionById.mockResolvedValueOnce(
      beforePromo as unknown as Awaited<ReturnType<typeof PromotionService.getPromotionById>>,
    );
    promotionServiceMock.deletePromotion.mockResolvedValueOnce(
      beforePromo as unknown as Awaited<ReturnType<typeof PromotionService.deletePromotion>>,
    );

    const res = await request(app)
      .delete('/api/v1/promotions/5')
      .set('Authorization', `Bearer ${signToken({ role: 'DISTRICT_MANAGER', userId: 99 })}`)
      .set('User-Agent', 'promotion-delete-audit-test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Promotion deleted successfully' });
    expect(promotionServiceMock.getPromotionById).toHaveBeenCalledWith(5);
    expect(promotionServiceMock.deletePromotion).toHaveBeenCalledWith(5);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROMOTION_DELETED',
        objectType: 'promotion',
        objectId: '5',
        userId: 99,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'promotion-delete-audit-test' }),
          before: expect.objectContaining({ id: 5, code: 'SAVE5', name: 'Save 5' }),
          metadata: { deleted: true },
        }),
      }),
    );
  });

  it('does not write success audit log when promotion creation fails', async () => {
    promotionServiceMock.createPromotion.mockRejectedValueOnce(new Error('Invalid promotion'));

    const res = await request(app)
      .post('/api/v1/promotions')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`)
      .send({ code: 'BAD' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid promotion' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('does not write success audit log when promotion update fails after before snapshot', async () => {
    promotionServiceMock.getPromotionById.mockResolvedValueOnce(
      { id: 6, code: 'SAVE6', name: 'Save 6' } as unknown as Awaited<
        ReturnType<typeof PromotionService.getPromotionById>
      >,
    );
    promotionServiceMock.updatePromotion.mockRejectedValueOnce(new Error('Invalid update'));

    const res = await request(app)
      .put('/api/v1/promotions/6')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid update' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('keeps successful promotion response when audit logging fails', async () => {
    const promotion = { id: 7, code: 'SAVE7', name: 'Save 7' };
    promotionServiceMock.createPromotion.mockResolvedValueOnce(
      promotion as unknown as Awaited<ReturnType<typeof PromotionService.createPromotion>>,
    );
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));

    const res = await request(app)
      .post('/api/v1/promotions')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ code: 'SAVE7', name: 'Save 7' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(promotion);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROMOTION_CREATED' }));
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
