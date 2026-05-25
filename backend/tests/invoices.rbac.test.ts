import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      invoices: {
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
    role: 'cashier',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

const invoice = {
  id: 10,
  store_id: 1,
  total: 1500,
  payment_method: 'cash',
  created_at: '2026-05-24T00:00:00.000Z',
  stores: { id: 1, name: 'Store 1', code: 'S1' },
  users: { id: 1, username: 'cashier', full_name: 'Cashier One', email: 'cashier@example.com' },
  _count: { invoice_items: 1 },
  invoice_items: [
    {
      id: 20,
      quantity: 2,
      unit_price: 750,
      product_variants: {
        name: 'Variant 1',
        variant_code: 'V1',
        barcode: '123',
        products: {
          name: 'Product 1',
          sku: 'SKU-1',
          unit: 'each',
        },
      },
    },
  ],
};

describe('Invoices route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.invoices.findMany as unknown as jest.Mock).mockResolvedValue([invoice]);
    (prisma.invoices.count as unknown as jest.Mock).mockResolvedValue(1);
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValue(invoice);
  });

  it('returns 401 for unauthenticated invoice access', async () => {
    const res = await request(app).get('/api/v1/invoices');

    expect(res.status).toBe(401);
  });

  it('rejects INVENTORY_STAFF from invoice routes', async () => {
    const token = signToken({ role: 'inventory_staff' });

    const listRes = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const detailRes = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(listRes.status).toBe(403);
    expect(detailRes.status).toBe(403);
    expect(prisma.invoices.findMany).not.toHaveBeenCalled();
    expect(prisma.invoices.findUnique).not.toHaveBeenCalled();
  });

  it('allows CASHIER to list and view detail with active store', async () => {
    const token = signToken({ role: 'cashier' });

    const listRes = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const detailRes = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual({
      items: [
        {
          id: 10,
          cashier_name: 'Cashier One',
          store_name: 'Store 1',
          store_code: 'S1',
          items_count: 1,
          total_amount: 1500,
          paid_amount: null,
          payment_method: 'cash',
          created_at: '2026-05-24T00:00:00.000Z',
          status: 'completed',
        },
      ],
      total: 1,
      take: 50,
      skip: 0,
    });
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.order).toEqual(
      expect.objectContaining({
        id: 10,
        cashier_name: 'Cashier One',
        store_name: 'Store 1',
        status: 'completed',
      }),
    );
  });

  it('allows DISTRICT_MANAGER to list and view detail with active store', async () => {
    const token = signToken({ role: 'district_manager' });

    const listRes = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    const detailRes = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(listRes.status).toBe(200);
    expect(detailRes.status).toBe(200);
  });

  it('keeps non-admin cross-store detail check rejected with 403', async () => {
    const token = signToken({ role: 'store_manager' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...invoice, store_id: 2 });

    const res = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects non-admin invoice detail when store_id is null', async () => {
    const token = signToken({ role: 'store_manager' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...invoice, store_id: null });

    const res = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects non-admin invoice detail when store_id is missing', async () => {
    const token = signToken({ role: 'store_manager' });
    const invoiceWithoutStoreId: Record<string, unknown> = { ...invoice };
    delete invoiceWithoutStoreId.store_id;
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce(invoiceWithoutStoreId);

    const res = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects non-admin invoice detail when store_id is invalid', async () => {
    const token = signToken({ role: 'store_manager' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce({ ...invoice, store_id: 'abc' });

    const res = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('keeps missing invoice detail returned as 404', async () => {
    const token = signToken({ role: 'store_manager' });
    (prisma.invoices.findUnique as unknown as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Invoice not found' });
  });

  it('keeps invalid invoice detail id returned as 400', async () => {
    const token = signToken({ role: 'store_manager' });

    const res = await request(app)
      .get('/api/v1/invoices/not-a-number')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid invoice id' });
    expect(prisma.invoices.findUnique).not.toHaveBeenCalled();
  });

  it('allows ADMIN to list and view detail without active store', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });

    const listRes = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`);

    const detailRes = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(detailRes.status).toBe(200);
  });

  it('allows ADMIN to view detail when store_id is null, missing, or invalid', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    const invoiceWithoutStoreId: Record<string, unknown> = { ...invoice };
    delete invoiceWithoutStoreId.store_id;
    (prisma.invoices.findUnique as unknown as jest.Mock)
      .mockResolvedValueOnce({ ...invoice, store_id: null })
      .mockResolvedValueOnce(invoiceWithoutStoreId)
      .mockResolvedValueOnce({ ...invoice, store_id: 'abc' });

    const nullRes = await request(app)
      .get('/api/v1/invoices/10')
      .set('Authorization', `Bearer ${token}`);

    const missingRes = await request(app)
      .get('/api/v1/invoices/11')
      .set('Authorization', `Bearer ${token}`);

    const invalidRes = await request(app)
      .get('/api/v1/invoices/12')
      .set('Authorization', `Bearer ${token}`);

    expect(nullRes.status).toBe(200);
    expect(missingRes.status).toBe(200);
    expect(invalidRes.status).toBe(200);
  });
});
