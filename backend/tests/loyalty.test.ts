import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/modules/loyalty/loyalty.service', () => ({
  loyaltyService: {
    enrollCustomer: jest.fn(),
    getBalance: jest.fn(),
    getTransactionHistory: jest.fn(),
    getPersonalizedOffers: jest.fn(),
    processPointsForOrder: jest.fn(),
    redeemReward: jest.fn(),
  },
}));

import app from '../src/app';
import { loyaltyService } from '../src/modules/loyalty/loyalty.service';

const loyaltyServiceMock = loyaltyService as jest.Mocked<typeof loyaltyService>;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'loyalty-test@example.com',
    role: 'CASHIER',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Loyalty routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/loyalty/balance/loyalty-1');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
    expect(loyaltyServiceMock.getBalance).not.toHaveBeenCalled();
  });

  it('returns 403 for unrelated authenticated roles', async () => {
    const res = await request(app)
      .post('/api/v1/loyalty/process-points')
      .set('Authorization', `Bearer ${signToken({ role: 'INVENTORY_STAFF' })}`)
      .send({
        loyaltyId: 'loyalty-1',
        orderId: 'ORD-1',
        amount: 100,
        items: [{ sku: 'SKU-1' }],
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(loyaltyServiceMock.processPointsForOrder).not.toHaveBeenCalled();
  });

  it('rejects LOYALTY_MEMBER until member ownership can be enforced', async () => {
    const res = await request(app)
      .get('/api/v1/loyalty/transactions/loyalty-1')
      .set('Authorization', `Bearer ${signToken({ role: 'LOYALTY_MEMBER' })}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(loyaltyServiceMock.getTransactionHistory).not.toHaveBeenCalled();
  });

  it('allows CASHIER to reach enroll handler behavior with legacy req.storeId mapping', async () => {
    const enrollment = {
      id: 'loyalty-1',
      email: 'member@example.com',
      firstName: 'Jane',
      lastName: 'Member',
      tier: 'bronze',
      pointsBalance: 100,
      lifetimeSpend: 0,
      enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    loyaltyServiceMock.enrollCustomer.mockResolvedValueOnce(
      enrollment as unknown as Awaited<ReturnType<typeof loyaltyService.enrollCustomer>>,
    );

    const res = await request(app)
      .post('/api/v1/loyalty/enroll')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`)
      .set('x-store-id', '1')
      .send({
        email: 'member@example.com',
        phone: '555-0101',
        firstName: 'Jane',
        lastName: 'Member',
      });

    expect(res.status).toBe(201);
    expect(loyaltyServiceMock.enrollCustomer).toHaveBeenCalledWith(1, {
      email: 'member@example.com',
      phone: '555-0101',
      firstName: 'Jane',
      lastName: 'Member',
    });
    expect(res.body).toEqual({
      ...enrollment,
      enrolledAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('keeps enroll missing-store response shape when no active store exists', async () => {
    const res = await request(app)
      .post('/api/v1/loyalty/enroll')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER', storeIds: [], primaryStoreId: null })}`)
      .send({
        email: 'member@example.com',
        firstName: 'Jane',
        lastName: 'Member',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Store ID required' });
    expect(loyaltyServiceMock.enrollCustomer).not.toHaveBeenCalled();
  });

  it('allows STORE_MANAGER to reach balance handler behavior', async () => {
    const balance = {
      loyaltyId: 'loyalty-1',
      email: 'member@example.com',
      firstName: 'Jane',
      lastName: 'Member',
      points: 150,
      tier: 'bronze',
      totalSpend: 50,
      nextTierAt: 500,
      nextTier: 'silver',
      memberSince: new Date('2026-01-01T00:00:00.000Z'),
    };
    loyaltyServiceMock.getBalance.mockResolvedValueOnce(
      balance as unknown as Awaited<ReturnType<typeof loyaltyService.getBalance>>,
    );

    const res = await request(app)
      .get('/api/v1/loyalty/balance/loyalty-1')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`);

    expect(res.status).toBe(200);
    expect(loyaltyServiceMock.getBalance).toHaveBeenCalledWith('loyalty-1');
    expect(res.body).toEqual({
      ...balance,
      memberSince: '2026-01-01T00:00:00.000Z',
    });
  });

  it('allows ADMIN to reach process-points handler behavior', async () => {
    const result = { success: true, pointsEarned: 100, newBalance: 200 };
    loyaltyServiceMock.processPointsForOrder.mockResolvedValueOnce(
      result as unknown as Awaited<ReturnType<typeof loyaltyService.processPointsForOrder>>,
    );

    const res = await request(app)
      .post('/api/v1/loyalty/process-points')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({
        loyaltyId: 'loyalty-1',
        orderId: 'ORD-1',
        amount: 100,
        items: [{ sku: 'SKU-1', category: 'default' }],
      });

    expect(res.status).toBe(200);
    expect(loyaltyServiceMock.processPointsForOrder).toHaveBeenCalledWith({
      loyaltyId: 'loyalty-1',
      orderId: 'ORD-1',
      amount: 100,
      items: [{ sku: 'SKU-1', category: 'default' }],
    });
    expect(res.body).toEqual(result);
  });

  it('allows DISTRICT_MANAGER to reach redeem handler behavior', async () => {
    const redemption = {
      code: 'LOYALTY-DISCOUNT_5-ABC123',
      reward: '$5 off any purchase',
      value: 5,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    };
    loyaltyServiceMock.redeemReward.mockResolvedValueOnce(
      redemption as unknown as Awaited<ReturnType<typeof loyaltyService.redeemReward>>,
    );

    const res = await request(app)
      .post('/api/v1/loyalty/redeem')
      .set('Authorization', `Bearer ${signToken({ role: 'DISTRICT_MANAGER' })}`)
      .send({ loyaltyId: 'loyalty-1', rewardId: 'discount_5' });

    expect(res.status).toBe(201);
    expect(loyaltyServiceMock.redeemReward).toHaveBeenCalledWith('loyalty-1', 'discount_5');
    expect(res.body).toEqual({
      ...redemption,
      expiresAt: '2026-02-01T00:00:00.000Z',
    });
  });
});
