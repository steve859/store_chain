import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/modules/reports/reports.service', () => {
  return {
    __esModule: true,
    ReportsService: {
      getDashboardStats: jest.fn(),
      getRevenueChart: jest.fn(),
      getTopSellingProducts: jest.fn(),
    },
  };
});

import app from '../src/app';
import { ReportsService } from '../src/modules/reports/reports.service';

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'test@example.com',
    role: 'store_manager',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Reports route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ReportsService.getDashboardStats as unknown as jest.Mock).mockResolvedValue({ totalRevenue: 1000 });
    (ReportsService.getRevenueChart as unknown as jest.Mock).mockResolvedValue([{ date: '2026-05-01', revenue: 1000 }]);
    (ReportsService.getTopSellingProducts as unknown as jest.Mock).mockResolvedValue([{ name: 'Milk', quantity: 2, revenue: 1000 }]);
  });

  it('returns 401 for unauthenticated report access', async () => {
    const res = await request(app).get('/api/v1/reports/dashboard');

    expect(res.status).toBe(401);
    expect(ReportsService.getDashboardStats).not.toHaveBeenCalled();
  });

  it('rejects CASHIER with 403', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(ReportsService.getDashboardStats).not.toHaveBeenCalled();
  });

  it('allows DISTRICT_MANAGER to reach the dashboard handler path with active store', async () => {
    const token = signToken({ role: 'district_manager', storeIds: [1, 2], primaryStoreId: 1 });

    const res = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalRevenue: 1000 });
    expect(ReportsService.getDashboardStats).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      }),
    );
  });

  it('allows ADMIN to call dashboard without active store', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });

    const res = await request(app)
      .get('/api/v1/reports/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalRevenue: 1000 });
    expect(ReportsService.getDashboardStats).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      }),
    );
  });

  it('applies DISTRICT_MANAGER access to revenue chart and top products routes', async () => {
    const token = signToken({ role: 'district_manager', storeIds: [1], primaryStoreId: 1 });

    const revenueRes = await request(app)
      .get('/api/v1/reports/revenue-chart')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const topProductsRes = await request(app)
      .get('/api/v1/reports/top-products')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(revenueRes.status).toBe(200);
    expect(topProductsRes.status).toBe(200);
    expect(ReportsService.getRevenueChart).toHaveBeenCalledWith(expect.objectContaining({ storeId: 1 }));
    expect(ReportsService.getTopSellingProducts).toHaveBeenCalledWith(expect.objectContaining({ storeId: 1 }));
  });
});
