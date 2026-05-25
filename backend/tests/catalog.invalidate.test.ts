import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/lib/cache/catalog', () => {
  return {
    __esModule: true,
    makeCatalogCacheKey: jest.fn((storeId: number, url: string) => `k:${storeId}:${url}`),
    makeCatalogCachePatternForStore: jest.fn((storeId: number) => `p:${storeId}`),
    invalidateCatalogCache: jest.fn(async () => undefined),
  };
});

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(),
    },
  };
});

jest.mock('../src/modules/audit_logs/audit_logs.service', () => ({
  AuditLogsService: {
    createLog: jest.fn(),
  },
}));

import app from '../src/app';
import prisma from '../src/db/prisma';
import { invalidateCatalogCache } from '../src/lib/cache/catalog';
import { AuditLogsService } from '../src/modules/audit_logs/audit_logs.service';

const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

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

describe('Catalog cache invalidation (store-scoped)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates after setting variant price', async () => {
    const token = signToken({ userId: 77, role: 'store_manager' });
    const startAt = new Date('2026-05-24T00:00:00.000Z');

    (prisma as any).$transaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        product_variants: {
          findUnique: jest.fn(async () => ({ id: 1 })),
        },
        variant_prices: {
          findFirst: jest.fn(async () => null),
          updateMany: jest.fn(async () => ({ count: 1 })),
          create: jest.fn(async () => ({ id: 99, store_id: 1, variant_id: 1, price: 12345, start_at: startAt, end_at: null })),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/products/variant-prices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .set('User-Agent', 'products-test-agent')
      .send({ variantId: 1, price: 12345, startAt: startAt.toISOString(), token: 'should-not-be-logged' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      price: { id: 99, store_id: 1, variant_id: 1, price: 12345, start_at: startAt.toISOString(), end_at: null },
    });
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VARIANT_PRICE_SET',
        objectType: 'variant_price',
        objectId: '99',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          storeId: 1,
          source: expect.objectContaining({ userAgent: 'products-test-agent' }),
          after: expect.objectContaining({
            id: '99',
            storeId: 1,
            variantId: 1,
            price: 12345,
          }),
          metadata: expect.objectContaining({
            variantId: 1,
            price: expect.any(Object),
            startAt: startAt,
            closedPriorWindow: true,
          }),
        }),
      }),
    );
    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
  });

  it('does not write variant price audit log on validation error', async () => {
    const token = signToken({ role: 'store_manager' });

    const res = await request(app)
      .post('/api/v1/products/variant-prices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ variantId: 'bad', price: 12345 });

    expect(res.status).toBe(400);
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
    expect(invalidateCatalogCache).not.toHaveBeenCalled();
  });

  it('keeps variant price response successful when audit logging rejects', async () => {
    const token = signToken({ role: 'store_manager' });
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));

    (prisma as any).$transaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        product_variants: {
          findUnique: jest.fn(async () => ({ id: 1 })),
        },
        variant_prices: {
          findFirst: jest.fn(async () => null),
          updateMany: jest.fn(async () => ({ count: 0 })),
          create: jest.fn(async () => ({ id: 100, store_id: 1, variant_id: 1, price: 15000, start_at: new Date('2026-05-24T00:00:00.000Z'), end_at: null })),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/products/variant-prices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ variantId: 1, price: 15000 });

    expect(res.status).toBe(201);
    expect(res.body.price.id).toBe(100);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'VARIANT_PRICE_SET' }));
  });

  it('invalidates and writes audit after closing variant price', async () => {
    const token = signToken({ userId: 77, role: 'store_manager' });
    const startAt = new Date('2026-05-23T00:00:00.000Z');
    const endAt = new Date('2026-05-24T00:00:00.000Z');

    (prisma as any).$transaction.mockImplementationOnce(async (fn: any) => {
      const current = { id: 101, store_id: 1, variant_id: 1, price: 12345, start_at: startAt, end_at: null, created_by: 77 };
      const tx = {
        variant_prices: {
          findFirst: jest.fn(async () => current),
          update: jest.fn(async () => ({ ...current, end_at: endAt })),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/products/variant-prices/close')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .set('User-Agent', 'products-test-agent')
      .send({ variantId: 1, endAt: endAt.toISOString(), password: 'should-not-be-logged' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      price: {
        id: 101,
        store_id: 1,
        variant_id: 1,
        price: 12345,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        created_by: 77,
      },
    });
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VARIANT_PRICE_CLOSED',
        objectType: 'variant_price',
        objectId: '101',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          storeId: 1,
          source: expect.objectContaining({ userAgent: 'products-test-agent' }),
          before: expect.objectContaining({ id: '101', endAt: null }),
          after: expect.objectContaining({ id: '101', endAt }),
          metadata: expect.objectContaining({ variantId: 1, endAt }),
        }),
      }),
    );
    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('password');
  });

  it('invalidates after inventory receive', async () => {
    const token = signToken({ role: 'admin' });

    (prisma as any).$transaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        product_variants: {
          findUnique: jest.fn(async () => ({ id: 1 })),
        },
        stores: {
          findUnique: jest.fn(async () => ({ id: 1 })),
        },
        inventories: {
          findFirst: jest.fn(async () => ({ id: 10, quantity: 0, reserved: 0 })),
          update: jest.fn(async () => ({ id: 10 })),
          create: jest.fn(async () => ({ id: 10 })),
        },
        stock_lots: {
          create: jest.fn(async () => ({ id: 7 })),
        },
        stock_movements: {
          create: jest.fn(async () => ({ id: 8 })),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/inventory/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ storeId: 1, variantId: 1, quantity: 2, unitCost: 1000, reason: 'test' });

    expect(res.status).toBe(201);
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
  });

  it('invalidates after inventory adjust', async () => {
    const token = signToken({ role: 'admin' });

    (prisma as any).$transaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        inventories: {
          findFirst: jest.fn(async () => ({ id: 11, quantity: 10, reserved: 0 })),
          update: jest.fn(async () => ({ id: 11, quantity: 12 })),
          create: jest.fn(async () => ({ id: 11, quantity: 12 })),
        },
        stock_movements: {
          create: jest.fn(async () => ({ id: 9 })),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ storeId: 1, variantId: 1, delta: 2, reason: 'test' });

    expect(res.status).toBe(201);
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
  });
});
