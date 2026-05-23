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

const mockStandardReturnTransaction = () => {
  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      invoices: {
        findUnique: jest.fn(async () => invoice),
      },
      invoice_items: {
        findMany: jest.fn(async () => [invoiceItem]),
      },
      return_items: {
        groupBy: jest.fn(async () => []),
        create: jest.fn(async () => ({ id: 101 })),
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
        findFirst: jest.fn(async () => ({ id: 30, quantity: new Prisma.Decimal(5) })),
        update: jest.fn(async () => ({ id: 30 })),
      },
      stock_movements: {
        create: jest.fn(async () => ({ id: 40 })),
      },
      audit_logs: {
        create: jest.fn(async () => ({ id: 50 })),
      },
      cash_movements: {
        create: jest.fn(async () => ({ id: 60 })),
      },
    };
    return fn(tx);
  });
  (prisma.pos_shifts.findFirst as unknown as jest.Mock).mockResolvedValue({ id: 70 });
};

const mockManagerRefundTransaction = () => {
  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      invoice_items: {
        findMany: jest.fn(async () => [invoiceItem]),
      },
      invoices: {
        findUnique: jest.fn(async () => ({ id: 1, store_id: 1 })),
      },
      audit_logs: {
        create: jest.fn(async () => ({ id: 80 })),
      },
      inventories: {
        findFirst: jest.fn(async () => ({ id: 30, quantity: new Prisma.Decimal(5) })),
        update: jest.fn(async () => ({ id: 30 })),
      },
      stock_movements: {
        create: jest.fn(async () => ({ id: 40 })),
      },
    };
    return fn(tx);
  });
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
    const token = signToken({ role: 'cashier' });
    mockStandardReturnTransaction();

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        invoiceId: 1,
        refundMethod: 'cash',
        restock: true,
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(
      expect.objectContaining({
        returnNumber: expect.any(String),
        restock: true,
      }),
    );
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
    const token = signToken({ role: 'store_manager' });
    mockManagerRefundTransaction();

    const res = await request(app)
      .post('/api/v1/returns/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ items: [{ invoiceItemId: 10, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ refund: { invoiceId: 1, totalRefund: 1000, auditLogId: '80' } });
  });
});
