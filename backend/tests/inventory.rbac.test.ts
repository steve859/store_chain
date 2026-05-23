import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/lib/cache/catalog', () => {
  return {
    __esModule: true,
    invalidateCatalogCache: jest.fn(async () => undefined),
  };
});

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(),
      product_variants: {
        findFirst: jest.fn(),
      },
      inventories: {
        findFirst: jest.fn(),
      },
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

const setLookupMocks = () => {
  (prisma.product_variants.findFirst as unknown as jest.Mock).mockResolvedValue({
    id: 10,
    barcode: '111',
    products: { id: 1, name: 'Milk' },
  });
  (prisma.inventories.findFirst as unknown as jest.Mock).mockResolvedValue({
    id: 20,
    store_id: 1,
    variant_id: 10,
    quantity: 5,
  });
};

describe('Inventory route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for unauthenticated inventory access', async () => {
    const res = await request(app).get('/api/v1/inventory');

    expect(res.status).toBe(401);
  });

  it('allows CASHIER to access active-store lookup routes', async () => {
    setLookupMocks();
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/inventory/lookup?barcode=111')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      variant: { id: 10, barcode: '111', products: { id: 1, name: 'Milk' } },
      inventory: { id: 20, store_id: 1, variant_id: 10, quantity: 5 },
    });
  });

  it('allows CASHIER to access legacy lookup routes within active store', async () => {
    setLookupMocks();
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/inventory/stores/1/lookup?barcode=111')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
  });

  it('rejects CASHIER for stock adjust and receive routes', async () => {
    const token = signToken({ role: 'cashier' });

    const adjustRes = await request(app)
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ variantId: 1, delta: 1, reason: 'test' });

    const receiveRes = await request(app)
      .post('/api/v1/inventory/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ variantId: 1, quantity: 1, unitCost: 1000, reason: 'test' });

    expect(adjustRes.status).toBe(403);
    expect(receiveRes.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows STORE_MANAGER to reach the adjust handler path', async () => {
    const token = signToken({ role: 'store_manager' });

    (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
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
      .send({ variantId: 1, delta: 2, reason: 'test' });

    expect(res.status).toBe(201);
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
  });

  it('allows INVENTORY_STAFF to reach the receive handler path', async () => {
    const token = signToken({ role: 'inventory_staff' });

    (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
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
      .send({ variantId: 1, quantity: 2, unitCost: 1000, reason: 'test' });

    expect(res.status).toBe(201);
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
  });

  it('keeps non-admin legacy store mismatch rejected with 403', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1], primaryStoreId: 1 });

    const res = await request(app)
      .get('/api/v1/inventory/stores/2/lookup?barcode=111')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: store does not match active store' });
  });
});
