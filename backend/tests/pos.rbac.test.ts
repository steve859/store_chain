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
        findUnique: jest.fn(),
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

jest.mock('../src/modules/audit_logs/audit_logs.service', () => ({
  AuditLogsService: {
    createLog: jest.fn(),
  },
}));

import app from '../src/app';
import prisma from '../src/db/prisma';
import { AuditLogsService } from '../src/modules/audit_logs/audit_logs.service';

const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

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

const receiptInvoice = {
  id: 30,
  invoice_number: 'INV-30',
  store_id: 1,
  created_at: '2026-05-24T00:00:00.000Z',
  stores: { id: 1, name: 'Store 1' },
  users: { id: 1, username: 'cashier' },
  customers: null,
  invoice_items: [
    {
      id: 10,
      variant_id: 20,
      quantity: 1,
      unit_price: 100,
      line_total: 100,
      product_variants: {
        name: 'Variant 1',
        barcode: '123',
        products: { name: 'Product 1' },
      },
    },
  ],
  subtotal: 100,
  tax: 0,
  discount: 0,
  total: 100,
  payment_method: 'cash',
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

const mockRefundTransaction = (overrides?: {
  invoiceItems?: Array<{
    id: number;
    invoice_id: number | null;
    variant_id: number | null;
    quantity: number;
    unit_price: number;
  }>;
  invoice?: { id: number; store_id: number } | null;
  inventory?: { id: number; quantity: number } | null;
}) => {
  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      invoice_items: {
        findMany: jest.fn(async () =>
          overrides?.invoiceItems ?? [
            {
              id: 10,
              invoice_id: 30,
              variant_id: 20,
              quantity: 2,
              unit_price: 100,
            },
          ],
        ),
      },
      invoices: {
        findUnique: jest.fn(async () => (overrides && 'invoice' in overrides ? overrides.invoice : { id: 30, store_id: 1 })),
      },
      inventories: {
        findFirst: jest.fn(async () => (overrides && 'inventory' in overrides ? overrides.inventory : { id: 40, quantity: 5 })),
        update: jest.fn(async () => ({ id: 40 })),
      },
      stock_movements: {
        create: jest.fn(async () => ({ id: 50 })),
      },
    };
    return fn(tx);
  });
};

const mockResumeCheckoutTransaction = (invoiceStoreId: number) => {
  const updateInventory = jest.fn(async () => ({ id: 40 }));
  const updateInvoice = jest.fn(async () => ({ id: 30 }));
  const createMovement = jest.fn(async () => ({ id: 50 }));

  (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      invoices: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 30,
            store_id: invoiceStoreId,
            created_by: 1,
            payment_method: null,
            invoice_items: [{ id: 10, variant_id: 20, quantity: 1 }],
          })
          .mockResolvedValueOnce({ id: 30, store_id: invoiceStoreId, invoice_items: [] }),
        update: updateInvoice,
      },
      inventories: {
        findMany: jest.fn(async () => [{ id: 40, variant_id: 20, quantity: 5, reserved: 1 }]),
        update: updateInventory,
      },
      stock_movements: {
        create: createMovement,
      },
    };
    return fn(tx);
  });

  return { updateInventory, updateInvoice, createMovement };
};

describe('POS route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.pos_shifts.findFirst as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.variant_prices.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValue(receiptInvoice);
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

  it('allows same-store POS receipt with unchanged response shape', async () => {
    const token = signToken({ role: 'cashier' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce(receiptInvoice);

    const res = await request(app)
      .get('/api/v1/pos/invoices/30/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.invoice).toEqual(receiptInvoice);
    expect(res.body.receipt).toEqual({
      invoiceId: 30,
      invoiceNumber: 'INV-30',
      createdAt: '2026-05-24T00:00:00.000Z',
      store: { id: 1, name: 'Store 1' },
      cashier: { id: 1, username: 'cashier' },
      customer: null,
      items: [
        {
          id: 10,
          variantId: 20,
          name: 'Variant 1',
          barcode: '123',
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
        },
      ],
      subtotal: 100,
      tax: 0,
      discount: 0,
      total: 100,
      paymentMethod: 'cash',
    });
  });

  it('returns 403 when POS receipt invoice belongs to a different active store', async () => {
    const token = signToken({ role: 'cashier', storeIds: [1, 2], primaryStoreId: 1 });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...receiptInvoice, store_id: 2 });

    const res = await request(app)
      .get('/api/v1/pos/invoices/30/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: invoice does not belong to active store' });
  });

  it('returns 403 when POS receipt invoice store_id is null', async () => {
    const token = signToken({ role: 'cashier' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...receiptInvoice, store_id: null });

    const res = await request(app)
      .get('/api/v1/pos/invoices/30/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: invoice does not belong to active store' });
  });

  it('returns 403 when POS receipt invoice store_id is missing', async () => {
    const token = signToken({ role: 'cashier' });
    const invoiceWithoutStoreId: Record<string, unknown> = { ...receiptInvoice };
    delete invoiceWithoutStoreId.store_id;
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce(invoiceWithoutStoreId);

    const res = await request(app)
      .get('/api/v1/pos/invoices/30/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: invoice does not belong to active store' });
  });

  it('returns 403 when POS receipt invoice store_id is invalid', async () => {
    const token = signToken({ role: 'cashier' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...receiptInvoice, store_id: 'abc' });

    const res = await request(app)
      .get('/api/v1/pos/invoices/30/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: invoice does not belong to active store' });
  });

  it('keeps ADMIN scoped to active store for POS receipt', async () => {
    const token = signToken({ role: 'admin', storeIds: [1], primaryStoreId: 1 });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...receiptInvoice, store_id: 2 });

    const res = await request(app)
      .get('/api/v1/pos/invoices/30/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: invoice does not belong to active store' });
  });

  it('keeps missing POS receipt invoice returned as 404', async () => {
    const token = signToken({ role: 'cashier' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/pos/invoices/30/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Invoice not found' });
  });

  it('keeps invalid POS receipt invoice id returned as 400', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/pos/invoices/not-a-number/receipt')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid invoice id' });
    expect(prisma.invoices.findUnique).not.toHaveBeenCalled();
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

  it('writes POS_REFUND_CREATED audit log after successful legacy POS refund', async () => {
    const token = signToken({ userId: 77, role: 'store_manager' });
    mockRefundTransaction();

    const res = await request(app)
      .post('/api/v1/pos/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .set('User-Agent', 'pos-test-agent')
      .send({
        items: [{ invoiceItemId: 10, quantity: 1 }],
        reason: 'Customer returned unopened item',
        token: 'should-not-be-logged',
        password: 'should-not-be-logged',
        cardNumber: '4111111111111111',
        customerPhone: '555-0100',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ refund: { invoiceId: 30, totalRefund: 100 } });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'POS_REFUND_CREATED',
        objectType: 'invoice',
        objectId: '30',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'pos-test-agent' }),
          storeId: 1,
          invoiceId: 30,
          effectiveCashierId: 77,
          refund: {
            totalRefund: 100,
            itemCount: 1,
          },
          metadata: expect.objectContaining({
            itemIds: [10],
            variantIds: [20],
            quantities: [1],
            reasonPresent: true,
            reasonPreview: 'Customer returned unopened item',
          }),
        }),
      }),
    );

    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('4111111111111111');
    expect(auditPayload).not.toContain('555-0100');
  });

  it('keeps legacy POS refund response successful when audit logging rejects', async () => {
    const token = signToken({ role: 'store_manager' });
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));
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
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'POS_REFUND_CREATED' }));
  });

  it('returns 403 when legacy POS refund invoice belongs to a different store', async () => {
    const token = signToken({ role: 'store_manager' });
    mockRefundTransaction({ invoice: { id: 30, store_id: 2 } });

    const res = await request(app)
      .post('/api/v1/pos/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Invoice does not belong to this store' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('returns 404 when legacy POS refund invoice item is missing', async () => {
    const token = signToken({ role: 'store_manager' });
    mockRefundTransaction({ invoiceItems: [] });

    const res = await request(app)
      .post('/api/v1/pos/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'One or more invoice items not found' });
  });

  it('returns 400 when legacy POS refund items belong to different invoices', async () => {
    const token = signToken({ role: 'store_manager' });
    mockRefundTransaction({
      invoiceItems: [
        { id: 10, invoice_id: 30, variant_id: 20, quantity: 2, unit_price: 100 },
        { id: 11, invoice_id: 31, variant_id: 21, quantity: 2, unit_price: 100 },
      ],
    });

    const res = await request(app)
      .post('/api/v1/pos/refund')
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

  it('returns 409 when legacy POS refund quantity exceeds sold quantity', async () => {
    const token = signToken({ role: 'store_manager' });
    mockRefundTransaction();

    const res = await request(app)
      .post('/api/v1/pos/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        items: [{ invoiceItemId: 10, quantity: 3 }],
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Refund quantity exceeds sold quantity for invoice item 10' });
  });

  it('returns 409 when legacy POS refund inventory is missing', async () => {
    const token = signToken({ role: 'store_manager' });
    mockRefundTransaction({ inventory: null });

    const res = await request(app)
      .post('/api/v1/pos/refund')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        items: [{ invoiceItemId: 10, quantity: 1 }],
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Inventory not found for variant 20' });
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

  it('returns 403 when resumed held invoice belongs to a different active store', async () => {
    const token = signToken({ role: 'cashier', storeIds: [1, 2], primaryStoreId: 1 });
    const txMocks = mockResumeCheckoutTransaction(2);

    const res = await request(app)
      .post('/api/v1/pos/resume/30/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ paymentMethod: 'cash' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: invoice does not belong to active store' });
    expect(txMocks.updateInventory).not.toHaveBeenCalled();
    expect(txMocks.updateInvoice).not.toHaveBeenCalled();
    expect(txMocks.createMovement).not.toHaveBeenCalled();
  });

  it('allows resume checkout to reach existing handler path when invoice store matches active store', async () => {
    const token = signToken({ role: 'cashier' });
    const txMocks = mockResumeCheckoutTransaction(1);

    const res = await request(app)
      .post('/api/v1/pos/resume/30/checkout')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ paymentMethod: 'cash' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ invoice: { id: 30, store_id: 1, invoice_items: [] } });
    expect(txMocks.updateInventory).toHaveBeenCalled();
    expect(txMocks.updateInvoice).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { payment_method: 'cash' },
    });
    expect(txMocks.createMovement).toHaveBeenCalled();
  });
});
