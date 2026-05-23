import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => ({
  __esModule: true,
  default: {
    products: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    product_variants: {
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    variant_prices: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/lib/cache/redis', () => ({
  __esModule: true,
  getRedis: jest.fn(() => null),
  cacheGetJson: jest.fn(),
  cacheSetJson: jest.fn(async () => undefined),
  cacheDeleteByPattern: jest.fn(async () => 0),
}));

jest.mock('../src/lib/cache/catalog', () => ({
  __esModule: true,
  makeCatalogCacheKey: jest.fn((storeId: number, url: string) => `catalog:${storeId}:${url}`),
  makeCatalogCachePatternForStore: jest.fn((storeId: number) => `catalog:${storeId}:*`),
  invalidateCatalogCache: jest.fn(async () => undefined),
}));

import app from '../src/app';
import prisma from '../src/db/prisma';
import { cacheGetJson } from '../src/lib/cache/redis';

type PrismaMock = typeof prisma & {
  products: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  product_variants: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  variant_prices: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

const prismaMock = prisma as PrismaMock;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'products-rbac@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Products route RBAC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (cacheGetJson as unknown as jest.Mock).mockResolvedValue(null);
  });

  it('keeps unauthenticated access returning 401', async () => {
    const res = await request(app).get('/api/v1/products');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
    expect(prismaMock.products.findMany).not.toHaveBeenCalled();
  });

  it('rejects wrong role for product writes', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`)
      .send({ name: 'Milk', unit: 'bottle' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
  });

  it('allows CASHIER to access GET /api/v1/products/catalog', async () => {
    prismaMock.product_variants.findMany.mockResolvedValueOnce([
      {
        id: 1,
        price: 10000,
        inventories: [{ id: 9, store_id: 1, variant_id: 1, quantity: 5 }],
        products: { id: 10, name: 'Milk', sku: 'SKU-1' },
      },
    ]);
    prismaMock.product_variants.count.mockResolvedValueOnce(1);
    prismaMock.variant_prices.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/products/catalog?q=milk&take=50&skip=0')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toHaveProperty('variant');
    expect(res.body.items[0]).toHaveProperty('product');
  });

  it('rejects CASHIER for variant write routes', async () => {
    const res = await request(app)
      .put('/api/v1/products/variants/1')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`)
      .send({ name: 'Updated Variant' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
  });

  it('allows DISTRICT_MANAGER to access variant price routes', async () => {
    prismaMock.variant_prices.findMany.mockResolvedValueOnce([
      { id: 1, store_id: 1, variant_id: 10, price: 12000 },
    ]);
    prismaMock.variant_prices.count.mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/v1/products/variant-prices?variantId=10')
      .set('Authorization', `Bearer ${signToken({ role: 'DISTRICT_MANAGER' })}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{ id: 1, store_id: 1, variant_id: 10, price: 12000 }],
      total: 1,
      take: 50,
      skip: 0,
    });
  });
});
