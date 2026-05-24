import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

jest.mock('../src/lib/cache/catalog', () => ({
  invalidateCatalogCache: jest.fn(),
}));

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(),
      purchase_orders: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
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

const purchaseOrder = {
  id: 10,
  store_id: 1,
  supplier_id: 20,
  created_by: 1,
  order_number: 'PO-1',
  status: 'draft',
  total_amount: new Prisma.Decimal(100),
  purchase_items: [],
};

const mockCreateTransaction = () => {
  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      stores: {
        findUnique: jest.fn(async () => ({ id: 1 })),
      },
      suppliers: {
        findUnique: jest.fn(async () => ({ id: 20 })),
      },
      product_variants: {
        findMany: jest.fn(async () => [{ id: 30 }]),
      },
      purchase_orders: {
        create: jest.fn(async () => ({ id: 10 })),
        update: jest.fn(async () => ({ id: 10 })),
        findUnique: jest.fn(async () => purchaseOrder),
      },
      purchase_items: {
        create: jest.fn(async () => ({ id: 40 })),
      },
    };

    return fn(tx);
  });
};

const mockReceiveTransaction = () => {
  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const po = {
      ...purchaseOrder,
      status: 'submitted',
      purchase_items: [
        {
          id: 40,
          variant_id: 30,
          quantity: new Prisma.Decimal(2),
          received_quantity: new Prisma.Decimal(0),
          unit_cost: new Prisma.Decimal(50),
        },
      ],
    };
    const tx = {
      purchase_orders: {
        findUnique: jest.fn(async () => po),
        update: jest.fn(async () => ({ ...po, status: 'received' })),
      },
      purchase_order_receipts: {
        create: jest.fn(async () => ({ id: 50, receipt_number: 'GRN-1' })),
        update: jest.fn(async () => ({ id: 50 })),
      },
      inventories: {
        findFirst: jest.fn(async () => ({ id: 60 })),
        update: jest.fn(async () => ({ id: 60 })),
      },
      purchase_items: {
        update: jest.fn(async () => ({ id: 40 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      purchase_order_receipt_items: {
        create: jest.fn(async () => ({ id: 70 })),
      },
      stock_lots: {
        create: jest.fn(async () => ({ id: 80 })),
      },
      stock_movements: {
        create: jest.fn(async () => ({ id: 90 })),
      },
    };

    return fn(tx);
  });
};

const mockDeleteTransaction = (po = purchaseOrder) => {
  const deleteMany = jest.fn(async () => ({ count: 0 }));
  const deleteOrder = jest.fn(async () => po);

  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      purchase_orders: {
        findUnique: jest.fn(async () => po),
        delete: deleteOrder,
      },
      purchase_items: {
        deleteMany,
      },
    };

    return fn(tx);
  });

  return { deleteMany, deleteOrder };
};

describe('Orders route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.purchase_orders.findMany as unknown as jest.Mock).mockResolvedValue([purchaseOrder]);
    (prisma.purchase_orders.count as unknown as jest.Mock).mockResolvedValue(1);
    (prisma.purchase_orders.findUnique as unknown as jest.Mock).mockResolvedValue(purchaseOrder);
    (prisma.purchase_orders.update as unknown as jest.Mock).mockResolvedValue({ ...purchaseOrder, status: 'submitted' });
    (invalidateCatalogCache as unknown as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns 401 for unauthenticated orders access', async () => {
    const res = await request(app).get('/api/v1/orders');

    expect(res.status).toBe(401);
  });

  it('rejects CASHIER from orders routes', async () => {
    const token = signToken({ role: 'cashier' });

    const listRes = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ variantId: 30, quantity: 1, unitCost: 50 }] });

    expect(listRes.status).toBe(403);
    expect(createRes.status).toBe(403);
    expect(prisma.purchase_orders.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows INVENTORY_STAFF to list, create, and receive orders', async () => {
    const token = signToken({ role: 'inventory_staff' });
    mockCreateTransaction();
    mockReceiveTransaction();

    const listRes = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ supplierId: 20, items: [{ variantId: 30, quantity: 1, unitCost: 50 }] });

    const receiveRes = await request(app)
      .post('/api/v1/orders/10/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ variantId: 30, receivedQty: 2, unitCost: 50 }] });

    expect(listRes.status).toBe(200);
    expect(createRes.status).toBe(201);
    expect(receiveRes.status).toBe(201);
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
  });

  it('rejects INVENTORY_STAFF from deleting or status-updating orders', async () => {
    const token = signToken({ role: 'inventory_staff' });

    const deleteRes = await request(app)
      .delete('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const statusRes = await request(app)
      .post('/api/v1/orders/10/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'submitted' });

    expect(deleteRes.status).toBe(403);
    expect(statusRes.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.purchase_orders.update).not.toHaveBeenCalled();
  });

  it('allows STORE_MANAGER to create, status-update, delete, and receive orders', async () => {
    const token = signToken({ role: 'store_manager' });
    mockCreateTransaction();
    mockDeleteTransaction();
    mockReceiveTransaction();

    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ supplierId: 20, items: [{ variantId: 30, quantity: 1, unitCost: 50 }] });

    const statusRes = await request(app)
      .post('/api/v1/orders/10/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'submitted' });

    const deleteRes = await request(app)
      .delete('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const receiveRes = await request(app)
      .post('/api/v1/orders/10/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ variantId: 30, receivedQty: 2, unitCost: 50 }] });

    expect(createRes.status).toBe(201);
    expect(statusRes.status).toBe(200);
    expect(deleteRes.status).toBe(200);
    expect(receiveRes.status).toBe(201);
  });

  it('allows DISTRICT_MANAGER to read but rejects writes', async () => {
    const token = signToken({ role: 'district_manager' });

    const listRes = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const detailRes = await request(app)
      .get('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ variantId: 30, quantity: 1, unitCost: 50 }] });

    const receiveRes = await request(app)
      .post('/api/v1/orders/10/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ variantId: 30, receivedQty: 2, unitCost: 50 }] });

    expect(listRes.status).toBe(200);
    expect(detailRes.status).toBe(200);
    expect(createRes.status).toBe(403);
    expect(receiveRes.status).toBe(403);
  });

  it('returns 403 when non-admin reads cross-store order detail', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1, 2], primaryStoreId: 1 });
    (prisma.purchase_orders.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...purchaseOrder, store_id: 2 });

    const res = await request(app)
      .get('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: order does not belong to active store' });
  });

  it('allows non-admin to read same-store order detail', async () => {
    const token = signToken({ role: 'store_manager' });
    (prisma.purchase_orders.findUnique as unknown as jest.Mock).mockResolvedValueOnce(purchaseOrder);

    const res = await request(app)
      .get('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      order: expect.objectContaining({
        id: 10,
        store_id: 1,
        order_number: 'PO-1',
        total_amount: '100',
      }),
    });
  });

  it('allows ADMIN to read order detail without active store', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    (prisma.purchase_orders.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...purchaseOrder, store_id: 2 });

    const res = await request(app)
      .get('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      order: expect.objectContaining({
        id: 10,
        store_id: 2,
        order_number: 'PO-1',
        total_amount: '100',
      }),
    });
  });

  it('returns 403 when non-admin deletes cross-store draft order', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1, 2], primaryStoreId: 1 });
    const txMocks = mockDeleteTransaction({ ...purchaseOrder, store_id: 2 });

    const res = await request(app)
      .delete('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: order does not belong to active store' });
    expect(txMocks.deleteMany).not.toHaveBeenCalled();
    expect(txMocks.deleteOrder).not.toHaveBeenCalled();
  });

  it('allows non-admin to delete same-store draft order', async () => {
    const token = signToken({ role: 'store_manager' });
    const txMocks = mockDeleteTransaction(purchaseOrder);

    const res = await request(app)
      .delete('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      order: expect.objectContaining({
        id: 10,
        store_id: 1,
        order_number: 'PO-1',
        total_amount: '100',
      }),
    });
    expect(txMocks.deleteMany).toHaveBeenCalledWith({ where: { purchase_order_id: 10 } });
    expect(txMocks.deleteOrder).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it('allows ADMIN to delete draft order without active store', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    const txMocks = mockDeleteTransaction({ ...purchaseOrder, store_id: 2 });

    const res = await request(app)
      .delete('/api/v1/orders/10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      order: expect.objectContaining({
        id: 10,
        store_id: 2,
        order_number: 'PO-1',
        total_amount: '100',
      }),
    });
    expect(txMocks.deleteMany).toHaveBeenCalledWith({ where: { purchase_order_id: 10 } });
    expect(txMocks.deleteOrder).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it('requires active store on status route for non-admin users', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [], primaryStoreId: null });

    const res = await request(app)
      .post('/api/v1/orders/10/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'submitted' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'storeId is required (active store not resolved)' });
    expect(prisma.purchase_orders.update).not.toHaveBeenCalled();
  });
});
