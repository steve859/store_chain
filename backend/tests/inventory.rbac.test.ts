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

jest.mock('../src/modules/audit_logs/audit_logs.service', () => ({
  AuditLogsService: {
    createLog: jest.fn(),
  },
}));

import app from '../src/app';
import prisma from '../src/db/prisma';
import { invalidateCatalogCache } from '../src/lib/cache/catalog';
import { AuditLogsService } from '../src/modules/audit_logs/audit_logs.service';

const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

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
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('writes INVENTORY_ADJUSTED audit log after successful stock adjust', async () => {
    const token = signToken({ userId: 77, role: 'store_manager' });
    const beforeInventory = { id: 11, store_id: 1, variant_id: 1, quantity: 10, reserved: 0, last_cost: 100, last_update: new Date('2026-05-24T08:00:00.000Z') };
    const afterInventory = { id: 11, store_id: 1, variant_id: 1, quantity: 12, reserved: 0, last_cost: 100, last_update: new Date('2026-05-24T09:00:00.000Z') };

    (prisma.$transaction as unknown as jest.Mock).mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        inventories: {
          findFirst: jest.fn(async () => beforeInventory),
          update: jest.fn(async () => afterInventory),
          create: jest.fn(async () => afterInventory),
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
      .set('User-Agent', 'inventory-test-agent')
      .send({
        variantId: 1,
        delta: 2,
        reason: 'Cycle count correction',
        referenceId: 'ADJ-1',
        token: 'should-not-be-logged',
        password: 'should-not-be-logged',
        secret: 'should-not-be-logged',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ inventory: { ...afterInventory, last_update: afterInventory.last_update.toISOString() }, movement: { id: 9 } });
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVENTORY_ADJUSTED',
        objectType: 'stock_movement',
        objectId: '9',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'inventory-test-agent' }),
          storeId: 1,
          variantId: 1,
          before: expect.objectContaining({ id: 11, quantity: 10 }),
          after: expect.objectContaining({ id: 11, quantity: 12 }),
          metadata: expect.objectContaining({
            delta: 2,
            stockMovementId: '9',
            referenceId: 'ADJ-1',
            reasonPresent: true,
            reasonPreview: 'Cycle count correction',
          }),
        }),
      }),
    );

    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
  });

  it('keeps stock adjust response successful when audit logging rejects', async () => {
    const token = signToken({ role: 'store_manager' });
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));

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
    expect(res.body).toEqual({ inventory: { id: 11, quantity: 12 }, movement: { id: 9 } });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVENTORY_ADJUSTED' }));
  });

  it('does not write inventory audit log when adjust validation fails', async () => {
    const token = signToken({ role: 'store_manager' });

    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ variantId: 1, delta: 2, setTo: 3, reason: 'test' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Provide exactly one of delta or setTo' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('writes INVENTORY_RECEIVED audit log after successful stock receive', async () => {
    const token = signToken({ userId: 77, role: 'inventory_staff' });
    const inventory = { id: 10, store_id: 1, variant_id: 1, quantity: 2, reserved: 0, last_cost: 1000, last_update: new Date('2026-05-24T09:00:00.000Z') };

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
          update: jest.fn(async () => inventory),
          create: jest.fn(async () => inventory),
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
      .set('User-Agent', 'inventory-test-agent')
      .send({
        variantId: 1,
        quantity: 2,
        unitCost: 1000,
        referenceId: 'RCV-1',
        reason: 'Supplier delivery',
        token: 'should-not-be-logged',
        password: 'should-not-be-logged',
        secret: 'should-not-be-logged',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      inventory: { ...inventory, last_update: inventory.last_update.toISOString() },
      lot: { id: 7 },
      movement: { id: 8 },
    });
    expect(invalidateCatalogCache).toHaveBeenCalledWith(1);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVENTORY_RECEIVED',
        objectType: 'stock_movement',
        objectId: '8',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'inventory-test-agent' }),
          storeId: 1,
          variantId: 1,
          after: expect.objectContaining({ id: 10, quantity: 2 }),
          metadata: expect.objectContaining({
            quantity: 2,
            unitCost: 1000,
            lotId: 7,
            stockMovementId: '8',
            referenceId: 'RCV-1',
            reasonPresent: true,
            reasonPreview: 'Supplier delivery',
          }),
        }),
      }),
    );

    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
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
