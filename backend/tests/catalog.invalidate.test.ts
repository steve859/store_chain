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

import app from '../src/app';
import prisma from '../src/db/prisma';
import { invalidateCatalogCache } from '../src/lib/cache/catalog';

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
    const token = signToken({ role: 'store_manager' });

    (prisma as any).$transaction.mockImplementationOnce(async (fn: any) => {
      const tx = {
        product_variants: {
          findUnique: jest.fn(async () => ({ id: 1 })),
        },
        variant_prices: {
          findFirst: jest.fn(async () => null),
          updateMany: jest.fn(async () => ({ count: 0 })),
          create: jest.fn(async () => ({ id: 99, store_id: 1, variant_id: 1, price: 12345, start_at: new Date(), end_at: null })),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/products/variant-prices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ variantId: 1, price: 12345 });

    expect(res.status).toBe(201);
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
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
