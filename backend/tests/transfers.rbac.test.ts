import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(),
      store_transfers: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
    },
  };
});

import app from '../src/app';
import prisma from '../src/db/prisma';

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

const transferItem = {
  id: 100,
  variant_id: 10,
  quantity: new Prisma.Decimal(2),
  received_quantity: new Prisma.Decimal(0),
};

const mockDispatchTransaction = (fromStoreId: number) => {
  const updateInventory = jest.fn(async () => ({ id: 20 }));
  const createMovement = jest.fn(async () => ({ id: 40 }));
  const updateTransfer = jest.fn(async () => ({ id: 30, status: 'in_transit' }));

  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      store_transfers: {
        findUnique: jest.fn(async () => ({
          id: 30,
          from_store_id: fromStoreId,
          to_store_id: 2,
          status: 'pending',
          store_transfer_items: [transferItem],
        })),
        update: updateTransfer,
      },
      inventories: {
        findFirst: jest.fn(async () => ({
          id: 20,
          reserved: new Prisma.Decimal(2),
        })),
        update: updateInventory,
      },
      stock_movements: {
        create: createMovement,
      },
    };
    return fn(tx);
  });

  return { updateInventory, createMovement, updateTransfer };
};

const mockReceiveTransaction = (toStoreId: number) => {
  const updateTransferItem = jest.fn(async () => ({ id: 100 }));
  const updateInventory = jest.fn(async () => ({ id: 21 }));
  const createInventory = jest.fn(async () => ({ id: 21 }));
  const createMovement = jest.fn(async () => ({ id: 41 }));
  const updateTransfer = jest.fn(async () => ({ id: 30, status: 'completed' }));

  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      store_transfers: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 30,
            from_store_id: 1,
            to_store_id: toStoreId,
            status: 'in_transit',
            store_transfer_items: [transferItem],
          })
          .mockResolvedValueOnce({
            id: 30,
            from_store_id: 1,
            to_store_id: toStoreId,
            status: 'in_transit',
            store_transfer_items: [{ ...transferItem, received_quantity: new Prisma.Decimal(2) }],
          }),
        update: updateTransfer,
      },
      store_transfer_items: {
        update: updateTransferItem,
      },
      inventories: {
        findFirst: jest.fn(async () => ({ id: 21, quantity: new Prisma.Decimal(0) })),
        update: updateInventory,
        create: createInventory,
      },
      stock_movements: {
        create: createMovement,
      },
    };
    return fn(tx);
  });

  return { updateTransferItem, updateInventory, createInventory, createMovement, updateTransfer };
};

describe('Transfer route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for unauthenticated transfer access', async () => {
    const res = await request(app).get('/api/v1/transfers');

    expect(res.status).toBe(401);
  });

  it('rejects CASHIER with 403', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(prisma.store_transfers.findMany).not.toHaveBeenCalled();
  });

  it('keeps non-admin create with mismatched fromStoreId rejected with existing 403', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1], primaryStoreId: 1 });

    const res = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        fromStoreId: 2,
        toStoreId: 3,
        items: [{ variantId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: fromStoreId must match active store' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows INVENTORY_STAFF to reach the create handler path', async () => {
    const token = signToken({ role: 'inventory_staff' });

    (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        stores: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: 1 })
            .mockResolvedValueOnce({ id: 2 }),
        },
        inventories: {
          findFirst: jest.fn(async () => ({
            id: 20,
            quantity: new Prisma.Decimal(10),
            reserved: new Prisma.Decimal(0),
          })),
          update: jest.fn(async () => ({ id: 20 })),
        },
        store_transfers: {
          create: jest.fn(async () => ({
            id: 30,
            from_store_id: 1,
            to_store_id: 2,
            status: 'pending',
          })),
          findUnique: jest.fn(async () => ({
            id: 30,
            from_store_id: 1,
            to_store_id: 2,
            status: 'pending',
            store_transfer_items: [transferItem],
          })),
        },
        store_transfer_items: {
          create: jest.fn(async () => transferItem),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        fromStoreId: 1,
        toStoreId: 2,
        items: [{ variantId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.transfer).toMatchObject({ id: 30, from_store_id: 1, to_store_id: 2 });
  });

  it('allows STORE_MANAGER to reach the dispatch handler path', async () => {
    const token = signToken({ role: 'store_manager' });
    mockDispatchTransaction(1);

    const res = await request(app)
      .post('/api/v1/transfers/30/dispatch')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transfer: { id: 30, status: 'in_transit' } });
  });

  it('returns 403 when non-admin dispatches transfer from a different source store', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1, 2], primaryStoreId: 1 });
    const txMocks = mockDispatchTransaction(2);

    const res = await request(app)
      .post('/api/v1/transfers/30/dispatch')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: transfer source store does not match active store' });
    expect(txMocks.updateInventory).not.toHaveBeenCalled();
    expect(txMocks.createMovement).not.toHaveBeenCalled();
    expect(txMocks.updateTransfer).not.toHaveBeenCalled();
  });

  it('allows non-admin to dispatch transfer from the active source store', async () => {
    const token = signToken({ role: 'store_manager' });
    const txMocks = mockDispatchTransaction(1);

    const res = await request(app)
      .post('/api/v1/transfers/30/dispatch')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transfer: { id: 30, status: 'in_transit' } });
    expect(txMocks.updateInventory).toHaveBeenCalled();
    expect(txMocks.createMovement).toHaveBeenCalled();
    expect(txMocks.updateTransfer).toHaveBeenCalledWith({ where: { id: 30 }, data: { status: 'in_transit' } });
  });

  it('allows ADMIN to dispatch transfer without active store', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    const txMocks = mockDispatchTransaction(2);

    const res = await request(app)
      .post('/api/v1/transfers/30/dispatch')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transfer: { id: 30, status: 'in_transit' } });
    expect(txMocks.updateInventory).toHaveBeenCalled();
    expect(txMocks.createMovement).toHaveBeenCalled();
    expect(txMocks.updateTransfer).toHaveBeenCalledWith({ where: { id: 30 }, data: { status: 'in_transit' } });
  });

  it('allows INVENTORY_STAFF to reach the receive handler path', async () => {
    const token = signToken({ role: 'inventory_staff', storeIds: [1, 2], primaryStoreId: 2 });
    mockReceiveTransaction(2);

    const res = await request(app)
      .post('/api/v1/transfers/30/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '2')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transfer: { id: 30, status: 'completed' } });
  });

  it('returns 403 when non-admin receives transfer for a different destination store', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1, 2], primaryStoreId: 1 });
    const txMocks = mockReceiveTransaction(2);

    const res = await request(app)
      .post('/api/v1/transfers/30/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: transfer destination store does not match active store' });
    expect(txMocks.updateTransferItem).not.toHaveBeenCalled();
    expect(txMocks.updateInventory).not.toHaveBeenCalled();
    expect(txMocks.createInventory).not.toHaveBeenCalled();
    expect(txMocks.createMovement).not.toHaveBeenCalled();
    expect(txMocks.updateTransfer).not.toHaveBeenCalled();
  });

  it('allows non-admin to receive transfer for the active destination store', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1, 2], primaryStoreId: 2 });
    const txMocks = mockReceiveTransaction(2);

    const res = await request(app)
      .post('/api/v1/transfers/30/receive')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '2')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transfer: { id: 30, status: 'completed' } });
    expect(txMocks.updateTransferItem).toHaveBeenCalled();
    expect(txMocks.updateInventory).toHaveBeenCalled();
    expect(txMocks.createMovement).toHaveBeenCalled();
    expect(txMocks.updateTransfer).toHaveBeenCalledWith({ where: { id: 30 }, data: { status: 'completed' } });
  });

  it('allows ADMIN to receive transfer without active store', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    const txMocks = mockReceiveTransaction(2);

    const res = await request(app)
      .post('/api/v1/transfers/30/receive')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transfer: { id: 30, status: 'completed' } });
    expect(txMocks.updateTransferItem).toHaveBeenCalled();
    expect(txMocks.updateInventory).toHaveBeenCalled();
    expect(txMocks.createMovement).toHaveBeenCalled();
    expect(txMocks.updateTransfer).toHaveBeenCalledWith({ where: { id: 30 }, data: { status: 'completed' } });
  });

  it('allows STORE_MANAGER to reach the cancel handler path', async () => {
    const token = signToken({ role: 'store_manager' });

    (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        store_transfers: {
          findUnique: jest.fn(async () => ({
            id: 30,
            from_store_id: 1,
            status: 'pending',
            store_transfer_items: [transferItem],
          })),
          update: jest.fn(async () => ({ id: 30, status: 'cancelled' })),
        },
        inventories: {
          findFirst: jest.fn(async () => ({ id: 20, reserved: new Prisma.Decimal(2) })),
          update: jest.fn(async () => ({ id: 20 })),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .post('/api/v1/transfers/30/cancel')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ transfer: { id: 30, status: 'cancelled' } });
  });
});
