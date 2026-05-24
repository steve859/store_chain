import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(),
      invoices: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      return_items: {
        groupBy: jest.fn(),
      },
      returns: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      pos_shifts: {
        findFirst: jest.fn(),
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
    role: 'cashier',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

const invoiceItem = {
  id: 10,
  invoice_id: 1,
  variant_id: 20,
  quantity: new Prisma.Decimal(2),
  unit_price: new Prisma.Decimal(1000),
};

const invoice = {
  id: 1,
  store_id: 1,
  customer_id: null,
  invoice_items: [invoiceItem],
  customers: null,
  users: null,
};

const mockStandardReturnTransaction = (overrides?: {
  invoice?: typeof invoice | null;
  invoiceItems?: Array<typeof invoiceItem>;
  returnedAgg?: Array<{ invoice_item_id: number; _sum: { quantity: Prisma.Decimal | null } }>;
  inventory?: { id: number; quantity: Prisma.Decimal } | null;
}) => {
  const returnItemCreate = jest.fn(async () => ({ id: 101 }));
  const stockMovementCreate = jest.fn(async () => ({ id: 40 }));
  const auditCreate = jest.fn(async () => ({ id: 50 }));
  const cashMovementCreate = jest.fn(async () => ({ id: 60 }));

  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      invoices: {
        findUnique: jest.fn(async () => (overrides && 'invoice' in overrides ? overrides.invoice : invoice)),
      },
      invoice_items: {
        findMany: jest.fn(async () => overrides?.invoiceItems ?? [invoiceItem]),
      },
      return_items: {
        groupBy: jest.fn(async () => overrides?.returnedAgg ?? []),
        create: returnItemCreate,
      },
      returns: {
        create: jest.fn(async () => ({
          id: 100,
          return_number: 'RTN-1',
          invoice_id: 1,
          store_id: 1,
          total_refund: new Prisma.Decimal(1000),
        })),
        findUnique: jest.fn(async () => ({
          id: 100,
          return_number: 'RTN-1',
          invoice_id: 1,
          store_id: 1,
          total_refund: new Prisma.Decimal(1000),
          return_items: [],
        })),
      },
      inventories: {
        findFirst: jest.fn(async () => (overrides && 'inventory' in overrides ? overrides.inventory : { id: 30, quantity: new Prisma.Decimal(5) })),
        update: jest.fn(async () => ({ id: 30 })),
      },
      stock_movements: {
        create: stockMovementCreate,
      },
      audit_logs: {
        create: auditCreate,
      },
      cash_movements: {
        create: cashMovementCreate,
      },
    };
    return fn(tx);
  });
  (prisma.pos_shifts.findFirst as unknown as jest.Mock).mockResolvedValue({ id: 70 });
  return { returnItemCreate, stockMovementCreate, auditCreate, cashMovementCreate };
};

const mockManagerRefundTransaction = (overrides?: {
  invoiceItems?: Array<typeof invoiceItem>;
  invoice?: { id: number; store_id: number } | null;
  inventory?: { id: number; quantity: Prisma.Decimal } | null;
}) => {
  const auditCreate = jest.fn(async () => ({ id: 80 }));
  const auditUpdate = jest.fn(async () => ({ id: 80 }));
  const stockMovementCreate = jest.fn(async () => ({ id: 40 }));

  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      invoice_items: {
        findMany: jest.fn(async () => overrides?.invoiceItems ?? [invoiceItem]),
      },
      invoices: {
        findUnique: jest.fn(async () => (overrides && 'invoice' in overrides ? overrides.invoice : { id: 1, store_id: 1 })),
      },
      audit_logs: {
        create: auditCreate,
        update: auditUpdate,
      },
      inventories: {
        findFirst: jest.fn(async () => (overrides && 'inventory' in overrides ? overrides.inventory : { id: 30, quantity: new Prisma.Decimal(5) })),
        update: jest.fn(async () => ({ id: 30 })),
      },
      stock_movements: {
        create: stockMovementCreate,
      },
    };
    return fn(tx);
  });
  return { auditCreate, auditUpdate, stockMovementCreate };
};

describe('Returns route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.invoices.findMany as unknown as jest.Mock).mockResolvedValue([invoice]);
    (prisma.invoices.count as unknown as jest.Mock).mockResolvedValue(1);
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValue(invoice);
    (prisma.return_items.groupBy as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.returns.findMany as unknown as jest.Mock).mockResolvedValue([{ id: 100, store_id: 1 }]);
    (prisma.returns.count as unknown as jest.Mock).mockResolvedValue(1);
  });

  it('returns 401 for unauthenticated returns access', async () => {
    const res = await request(app).get('/api/v1/returns');

    expect(res.status).toBe(401);
  });

  it('allows CASHIER to access invoice lookup', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/returns/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          ...invoice,
          invoice_items: [{ ...invoiceItem, quantity: '2', unit_price: '1000' }],
        },
      ],
      total: 1,
      take: 50,
      skip: 0,
    });
  });

  it('allows CASHIER to create a standard return', async () => {
    const token = signToken({ userId: 77, role: 'cashier' });
    const txMocks = mockStandardReturnTransaction();

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .set('User-Agent', 'returns-test-agent')
      .send({
        invoiceId: 1,
        refundMethod: 'cash',
        restock: true,
        reason: 'Damaged item',
        note: 'Counter return',
        items: [{ invoiceItemId: 10, quantity: 1 }],
        token: 'should-not-be-logged',
        password: 'should-not-be-logged',
        secret: 'should-not-be-logged',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        returnNumber: expect.any(String),
        restock: true,
      }),
    );
    expect(txMocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(txMocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 77,
        action: 'RETURN_CREATED',
        object_type: 'return',
        object_id: '100',
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'returns-test-agent' }),
          storeId: 1,
          invoiceId: 1,
          returnId: 100,
          returnNumber: expect.any(String),
          after: expect.objectContaining({
            id: 100,
            return_number: 'RTN-1',
            invoice_id: 1,
            store_id: 1,
            total_refund: '1000',
          }),
          metadata: expect.objectContaining({
            refundMethod: 'cash',
            restock: true,
            totalRefund: '1000',
            itemCount: 1,
            invoiceItemIds: [10],
            variantIds: [20],
            quantities: ['1'],
            returnItemIds: [101],
            stockMovementIds: ['40'],
            cashMovementCreated: true,
            cashMovementId: '60',
            reasonPresent: true,
            reasonPreview: 'Damaged item',
            notePresent: true,
          }),
        }),
      }),
    });

    const auditPayload = JSON.stringify((txMocks.auditCreate.mock.calls as Array<Array<unknown>>)[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
  });

  it('returns 400 when standard return has invalid decimal quantity', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 'not-a-number' }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid items payload' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 403 when standard return invoice belongs to a different store', async () => {
    const token = signToken({ role: 'cashier' });
    const txMocks = mockStandardReturnTransaction({ invoice: { ...invoice, store_id: 2 } });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Invoice does not belong to this store' });
    expect(txMocks.auditCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when standard return invoice is missing', async () => {
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction({ invoice: null });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Invoice not found' });
  });

  it('returns 404 when standard return invoice item is missing', async () => {
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction({ invoiceItems: [] });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'One or more invoice items not found' });
  });

  it('returns 400 when standard return item belongs to a different invoice', async () => {
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction({ invoiceItems: [{ ...invoiceItem, invoice_id: 2 }] });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'All items must belong to the same invoice' });
  });

  it('returns 409 when standard return item is already fully returned', async () => {
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction({
      returnedAgg: [{ invoice_item_id: 10, _sum: { quantity: new Prisma.Decimal(2) } }],
    });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Invoice item 10 already fully returned' });
  });

  it('returns 409 when standard return quantity exceeds remaining quantity', async () => {
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction();

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 3 }],
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Return quantity exceeds remaining for invoice item 10' });
  });

  it('returns 403 when CASHIER standard return exceeds large refund threshold', async () => {
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction({
      invoiceItems: [{ ...invoiceItem, quantity: new Prisma.Decimal(1000), unit_price: new Prisma.Decimal(1000) }],
    });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 600 }],
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Large refund requires manager/admin approval' });
  });

  it('returns 409 when standard return inventory is missing', async () => {
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction({ inventory: null });

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Inventory not found for variant 20' });
  });

  it('allows CASHIER to list return history', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [{ id: 100, store_id: 1 }], total: 1, take: 50, skip: 0 });
  });

  it('rejects CASHIER from legacy manager refund', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ invoiceItemId: 10, quantity: 1 }] });

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects INVENTORY_STAFF from creating return and manager refund', async () => {
    const token = signToken({ role: 'inventory_staff' });

    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ invoiceId: 1, items: [{ invoiceItemId: 10, quantity: 1 }] });

    const refundRes = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ invoiceItemId: 10, quantity: 1 }] });

    expect(createRes.status).toBe(403);
    expect(refundRes.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows STORE_MANAGER to call legacy manager refund', async () => {
    const token = signToken({ userId: 88, role: 'store_manager' });
    const txMocks = mockManagerRefundTransaction();

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .set('User-Agent', 'returns-test-agent')
      .send({
        items: [{ invoiceItemId: 10, quantity: 1 }],
        reason: 'Manager approved refund',
        token: 'should-not-be-logged',
        password: 'should-not-be-logged',
        secret: 'should-not-be-logged',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ refund: { invoiceId: 1, totalRefund: 1000, auditLogId: '80' } });
    expect(txMocks.auditCreate).toHaveBeenCalledTimes(1);
    expect(txMocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 88,
        action: 'MANAGER_REFUND_CREATED',
        object_type: 'invoice',
        object_id: '1',
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'returns-test-agent' }),
          storeId: 1,
          invoiceId: 1,
          metadata: expect.objectContaining({
            totalRefund: 1000,
            itemCount: 1,
            invoiceItemIds: [10],
            variantIds: [20],
            quantities: [1],
            stockMovementIds: ['40'],
            reasonPresent: true,
            reasonPreview: 'Manager approved refund',
          }),
        }),
      }),
    });
    expect(txMocks.auditUpdate).toHaveBeenCalledWith({
      where: { id: 80 },
      data: {
        payload: expect.objectContaining({
          metadata: expect.objectContaining({ stockMovementIds: ['40'] }),
        }),
      },
    });
    expect(txMocks.stockMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reference_id: 'audit:80',
      }),
    });

    const auditPayload = JSON.stringify((txMocks.auditUpdate.mock.calls as Array<Array<unknown>>)[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
  });

  it('returns 403 when legacy manager refund invoice belongs to a different store', async () => {
    const token = signToken({ role: 'store_manager' });
    mockManagerRefundTransaction({ invoice: { id: 1, store_id: 2 } });

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ invoiceItemId: 10, quantity: 1 }] });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Invoice does not belong to this store' });
  });

  it('returns 404 when legacy manager refund invoice item is missing', async () => {
    const token = signToken({ role: 'store_manager' });
    mockManagerRefundTransaction({ invoiceItems: [] });

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ invoiceItemId: 10, quantity: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'One or more invoice items not found' });
  });

  it('returns 400 when legacy manager refund items belong to different invoices', async () => {
    const token = signToken({ role: 'store_manager' });
    mockManagerRefundTransaction({
      invoiceItems: [
        invoiceItem,
        { ...invoiceItem, id: 11, invoice_id: 2, variant_id: 21 },
      ],
    });

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        items: [
          { invoiceItemId: 10, quantity: 1 },
          { invoiceItemId: 11, quantity: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Refund items must belong to the same invoice' });
  });

  it('returns 409 when legacy manager refund quantity exceeds sold quantity', async () => {
    const token = signToken({ role: 'store_manager' });
    mockManagerRefundTransaction();

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ invoiceItemId: 10, quantity: 3 }] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Refund quantity exceeds sold quantity for invoice item 10' });
  });

  it('returns 409 when legacy manager refund inventory is missing', async () => {
    const token = signToken({ role: 'store_manager' });
    mockManagerRefundTransaction({ inventory: null });

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ invoiceItemId: 10, quantity: 1 }] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Inventory not found for variant 20' });
  });
});
