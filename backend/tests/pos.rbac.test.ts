import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(),
      pos_shifts: {
        findFirst: jest.fn(),
      },
      invoices: {
        aggregate: jest.fn(),
      },
      cash_movements: {
        aggregate: jest.fn(),
      },
      variant_prices: {
        findMany: jest.fn(),
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

const mockEmptyShiftSummary = () => {
  (prisma.invoices.aggregate as unknown as jest.Mock).mockResolvedValue({
    _sum: { total: null },
    _count: { _all: 0 },
  });
  (prisma.cash_movements.aggregate as unknown as jest.Mock).mockResolvedValue({
    _sum: { amount: null },
  });
};

const mockCheckoutTransaction = () => {
  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      product_variants: {
        findMany: jest.fn(async () => [{ id: 10, price: 100 }]),
      },
      inventories: {
        findMany: jest.fn(async () => [{ id: 20, variant_id: 10, quantity: 5, reserved: 0, last_cost: 60 }]),
        update: jest.fn(async () => ({ id: 20 })),
      },
      variant_prices: {
        findMany: jest.fn(async () => []),
      },
      invoices: {
        create: jest.fn(async () => ({ id: 30 })),
        findUnique: jest.fn(async () => ({ id: 30, store_id: 1, invoice_items: [] })),
      },
      invoice_items: {
        create: jest.fn(async () => ({ id: 40 })),
      },
      stock_movements: {
        create: jest.fn(async () => ({ id: 50 })),
      },
    };
    return fn(tx);
  });
};

const mockRefundTransaction = () => {
  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      invoice_items: {
        findMany: jest.fn(async () => [
          {
            id: 10,
            invoice_id: 30,
            variant_id: 20,
            quantity: 2,
            unit_price: 100,
          },
        ]),
      },
      invoices: {
        findUnique: jest.fn(async () => ({ id: 30, store_id: 1 })),
      },
      inventories: {
        findFirst: jest.fn(async () => ({ id: 40, quantity: 5 })),
        update: jest.fn(async () => ({ id: 40 })),
      },
      stock_movements: {
        create: jest.fn(async () => ({ id: 50 })),
      },
    };
    return fn(tx);
  });
};

describe('POS route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.pos_shifts.findFirst as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.variant_prices.findMany as unknown as jest.Mock).mockResolvedValue([]);
    mockEmptyShiftSummary();
  });

  it('returns 401 for unauthenticated POS access', async () => {
    const res = await request(app).get('/api/v1/pos/shifts/current');

    expect(res.status).toBe(401);
  });

  it('allows CASHIER to access normal POS operational routes', async () => {
    const token = signToken({ role: 'cashier' });
    (prisma.pos_shifts.findFirst as unknown as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
    mockCheckoutTransaction();

    const currentRes = await request(app)
      .get('/api/v1/pos/shifts/current')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const checkoutRes = await request(app)
      .post('/api/v1/pos/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        paymentMethod: 'cash',
        items: [{ variantId: 10, quantity: 1 }],
      });

    expect(currentRes.status).toBe(200);
    expect(currentRes.body).toEqual({ shift: null });
    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body).toEqual({ invoice: { id: 30, store_id: 1, invoice_items: [] } });
  });

  it('rejects INVENTORY_STAFF from POS routes', async () => {
    const token = signToken({ role: 'inventory_staff' });

    const res = await request(app)
      .get('/api/v1/pos/shifts/current')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(prisma.pos_shifts.findFirst).not.toHaveBeenCalled();
  });

  it('rejects DISTRICT_MANAGER from POS routes', async () => {
    const token = signToken({ role: 'district_manager' });

    const res = await request(app)
      .get('/api/v1/pos/shifts/current')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(prisma.pos_shifts.findFirst).not.toHaveBeenCalled();
  });

  it('allows STORE_MANAGER to access legacy POS refund', async () => {
    const token = signToken({ role: 'store_manager' });
    mockRefundTransaction();

    const res = await request(app)
      .post('/api/v1/pos/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ refund: { invoiceId: 30, totalRefund: 100 } });
  });

  it('rejects CASHIER from legacy POS refund', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .post('/api/v1/pos/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
