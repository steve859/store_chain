import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      audit_logs: {
        count: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    },
  };
});

import app from '../src/app';
import prisma from '../src/db/prisma';

type PrismaMock = typeof prisma & {
  audit_logs: {
    count: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
};

const prismaMock = prisma as PrismaMock;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'audit-test@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Audit logs routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps GET /api/v1/audit-logs response shape and default pagination', async () => {
    prismaMock.audit_logs.count.mockResolvedValueOnce(1);
    prismaMock.audit_logs.findMany.mockResolvedValueOnce([
      {
        id: BigInt(123),
        action: 'DELETE',
        object_type: 'SUPPLIER',
        object_id: '42',
        user_id: 1,
        payload: { before: 'old' },
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        users: { id: 1, email: 'admin@example.com' },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        id: '123',
        action: 'DELETE',
        object_type: 'SUPPLIER',
        object_id: '42',
        user_id: 1,
        payload: { before: 'old' },
        users: { id: 1, email: 'admin@example.com' },
      }),
    );
    expect(res.body.pagination).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('keeps query filter mapping to Prisma where/take/skip', async () => {
    prismaMock.audit_logs.count.mockResolvedValueOnce(0);
    prismaMock.audit_logs.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/audit-logs?action=UPDATE&objectType=PRODUCT&userId=7&page=2&limit=5&from=2026-01-01&to=2026-01-31')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(prismaMock.audit_logs.count).toHaveBeenCalledWith({
      where: {
        action: 'UPDATE',
        object_type: 'PRODUCT',
        user_id: 7,
        created_at: {
          gte: new Date('2026-01-01'),
          lte: new Date('2026-01-31'),
        },
      },
    });
    expect(prismaMock.audit_logs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        orderBy: { created_at: 'desc' },
      }),
    );
    expect(res.body).toEqual({
      data: [],
      pagination: {
        total: 0,
        page: 2,
        limit: 5,
        totalPages: 0,
      },
    });
  });

  it('keeps auth requirement', async () => {
    const res = await request(app).get('/api/v1/audit-logs');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
  });

  it('keeps ADMIN role requirement', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
  });
});
