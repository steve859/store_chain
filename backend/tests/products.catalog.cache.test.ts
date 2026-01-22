import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => {
  const productVariants = {
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const variantPrices = {
    findMany: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      product_variants: productVariants,
      variant_prices: variantPrices,
    },
  };
});

jest.mock('../src/lib/cache/redis', () => {
  return {
    __esModule: true,
    getRedis: jest.fn(() => null),
    cacheGetJson: jest.fn(),
    cacheSetJson: jest.fn(async () => undefined),
    cacheDeleteByPattern: jest.fn(async () => 0),
  };
});

import app from '../src/app';
import prisma from '../src/db/prisma';
import { cacheGetJson, cacheSetJson } from '../src/lib/cache/redis';

type PrismaMock = typeof prisma & {
  product_variants: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  variant_prices: {
    findMany: jest.Mock;
  };
};

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

describe('GET /api/v1/products/catalog - caching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects without Authorization', async () => {
    const res = await request(app).get('/api/v1/products/catalog').set('x-store-id', '1');
    expect(res.status).toBe(401);
  });

  it('serves from cache when available (no DB calls)', async () => {
    const token = signToken();

    (cacheGetJson as unknown as jest.Mock).mockResolvedValueOnce({
      items: [{ variant: { id: 123 }, product: { id: 10 }, inventory: null }],
      total: 1,
      take: 50,
      skip: 0,
    });

    const res = await request(app)
      .get('/api/v1/products/catalog?q=milk&take=50&skip=0')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);

    const prismaMock = prisma as unknown as PrismaMock;
    expect(prismaMock.product_variants.findMany).not.toHaveBeenCalled();
    expect(prismaMock.product_variants.count).not.toHaveBeenCalled();
    expect(cacheSetJson).not.toHaveBeenCalled();
  });

  it('caches successful responses when cache miss', async () => {
    const token = signToken();

    (cacheGetJson as unknown as jest.Mock).mockResolvedValueOnce(null);

    const prismaMock = prisma as unknown as PrismaMock;

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
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0]).toHaveProperty('variant');
    expect(res.body.items[0]).toHaveProperty('product');

    expect(cacheSetJson).toHaveBeenCalledTimes(1);
    const [keyArg, bodyArg, ttlArg] = (cacheSetJson as unknown as jest.Mock).mock.calls[0];
    expect(String(keyArg)).toContain('cache:v1:products:catalog:store:1');
    expect(ttlArg).toBeGreaterThanOrEqual(30);
    expect(ttlArg).toBeLessThanOrEqual(60);
    expect(bodyArg).toHaveProperty('items');
  });
});
