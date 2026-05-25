import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => ({
  __esModule: true,
  default: {
    stores: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    users: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    inventories: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    invoices: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../src/modules/audit_logs/audit_logs.service', () => ({
  AuditLogsService: {
    createLog: jest.fn(),
  },
}));

import app from '../src/app';
import prisma from '../src/db/prisma';
import { AuditLogsService } from '../src/modules/audit_logs/audit_logs.service';

const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

type PrismaMock = typeof prisma & {
  stores: {
    aggregate: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  users: {
    groupBy: jest.Mock;
    findMany: jest.Mock;
  };
  inventories: {
    groupBy: jest.Mock;
    findMany: jest.Mock;
  };
  invoices: {
    groupBy: jest.Mock;
    findMany: jest.Mock;
  };
};

const prismaMock = prisma as PrismaMock;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'stores-test@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Stores routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for unauthenticated store reads', async () => {
    const res = await request(app).get('/api/v1/stores');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
    expect(prismaMock.stores.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated wrong role on store writes', async () => {
    const res = await request(app)
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`)
      .send({ name: 'New Store' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(prismaMock.stores.create).not.toHaveBeenCalled();
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('allows STORE_MANAGER to reach GET /api/v1/stores existing handler behavior', async () => {
    const stores = [{ id: 1, code: 'SHP-001', name: 'Main Store' }];
    prismaMock.stores.findMany.mockResolvedValueOnce(stores);
    prismaMock.stores.count.mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/v1/stores?take=10&skip=0')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`);

    expect(res.status).toBe(200);
    expect(prismaMock.stores.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { id: 'desc' },
      take: 10,
      skip: 0,
    });
    expect(res.body).toEqual({ items: stores, total: 1, take: 10, skip: 0 });
  });

  it('allows DISTRICT_MANAGER to reach POST /api/v1/stores existing handler behavior', async () => {
    const store = {
      id: 2,
      code: 'SHP-002',
      name: 'District Store',
      timezone: 'Asia/Ho_Chi_Minh',
      address: '123 Secret Street',
      phone: '0900000000',
      is_active: true,
      created_at: new Date('2026-05-24T08:00:00.000Z'),
    };
    prismaMock.stores.aggregate.mockResolvedValueOnce({ _max: { id: 1 } });
    prismaMock.stores.create.mockResolvedValueOnce(store);

    const res = await request(app)
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'DISTRICT_MANAGER' })}`)
      .set('User-Agent', 'stores-test-agent')
      .send({
        name: 'District Store',
        address: '123 Secret Street',
        phone: '0900000000',
        token: 'should-not-be-logged',
        password: 'should-not-be-logged',
        secret: 'should-not-be-logged',
      });

    expect(res.status).toBe(201);
    expect(prismaMock.stores.create).toHaveBeenCalledWith({
      data: {
        code: 'SHP-002',
        name: 'District Store',
        address: '123 Secret Street',
        phone: '0900000000',
        timezone: undefined,
        is_active: true,
      },
    });
    expect(res.body).toEqual({ store: { ...store, created_at: store.created_at.toISOString() } });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STORE_CREATED',
        objectType: 'store',
        objectId: '2',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'stores-test-agent' }),
          after: expect.objectContaining({
            id: 2,
            code: 'SHP-002',
            name: 'District Store',
            timezone: 'Asia/Ho_Chi_Minh',
            is_active: true,
          }),
          metadata: expect.objectContaining({
            addressPresent: true,
            phonePresent: true,
          }),
        }),
      }),
    );

    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
    expect(auditPayload).not.toContain('123 Secret Street');
    expect(auditPayload).not.toContain('0900000000');
  });

  it('allows ADMIN to reach GET /api/v1/stores/:id/overview existing handler behavior', async () => {
    const store = { id: 1, code: 'SHP-001', name: 'Main Store' };
    prismaMock.stores.findUnique.mockResolvedValueOnce(store);
    prismaMock.users.findMany.mockResolvedValueOnce([]);
    prismaMock.inventories.findMany.mockResolvedValueOnce([]);
    prismaMock.invoices.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/v1/stores/1/overview')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      store,
      stats: {
        employees: 0,
        products: 0,
        orders: 0,
      },
      employees: [],
      inventories: [],
      invoices: [],
    });
  });

  it('keeps invalid store create response shape for allowed writer role', async () => {
    const res = await request(app)
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'name is required' });
    expect(prismaMock.stores.create).not.toHaveBeenCalled();
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('writes STORE_UPDATED audit log after successful store update', async () => {
    const before = {
      id: 2,
      code: 'SHP-002',
      name: 'Old Store',
      timezone: 'Asia/Ho_Chi_Minh',
      address: 'Old Secret Street',
      phone: '0911111111',
      is_active: true,
      created_at: new Date('2026-05-24T08:00:00.000Z'),
    };
    const updated = {
      ...before,
      name: 'Updated Store',
      address: 'New Secret Street',
      phone: null,
    };
    prismaMock.stores.findUnique.mockResolvedValueOnce(before);
    prismaMock.stores.update.mockResolvedValueOnce(updated);

    const res = await request(app)
      .put('/api/v1/stores/2')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'ADMIN' })}`)
      .set('User-Agent', 'stores-test-agent')
      .send({
        name: 'Updated Store',
        address: 'New Secret Street',
        phone: '',
        token: 'should-not-be-logged',
        password: 'should-not-be-logged',
        secret: 'should-not-be-logged',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ store: { ...updated, created_at: updated.created_at.toISOString() } });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STORE_UPDATED',
        objectType: 'store',
        objectId: '2',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'stores-test-agent' }),
          before: expect.objectContaining({ id: 2, name: 'Old Store' }),
          after: expect.objectContaining({ id: 2, name: 'Updated Store' }),
          metadata: expect.objectContaining({
            changedFields: expect.arrayContaining(['name', 'address', 'phone']),
            addressPresent: true,
            phonePresent: false,
          }),
        }),
      }),
    );

    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('should-not-be-logged');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
    expect(auditPayload).not.toContain('Old Secret Street');
    expect(auditPayload).not.toContain('New Secret Street');
    expect(auditPayload).not.toContain('0911111111');
  });

  it('writes STORE_DEACTIVATED audit log after successful store delete', async () => {
    const before = {
      id: 2,
      code: 'SHP-002',
      name: 'District Store',
      timezone: 'Asia/Ho_Chi_Minh',
      address: '123 Secret Street',
      phone: '0900000000',
      is_active: true,
      created_at: new Date('2026-05-24T08:00:00.000Z'),
    };
    const updated = { ...before, is_active: false };
    prismaMock.stores.findUnique.mockResolvedValueOnce(before);
    prismaMock.stores.update.mockResolvedValueOnce(updated);

    const res = await request(app)
      .delete('/api/v1/stores/2')
      .set('Authorization', `Bearer ${signToken({ userId: 88, role: 'DISTRICT_MANAGER' })}`)
      .set('User-Agent', 'stores-test-agent');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ store: { ...updated, created_at: updated.created_at.toISOString() } });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STORE_DEACTIVATED',
        objectType: 'store',
        objectId: '2',
        userId: 88,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'stores-test-agent' }),
          before: expect.objectContaining({ id: 2, is_active: true }),
          after: expect.objectContaining({ id: 2, is_active: false }),
          metadata: expect.objectContaining({
            previousIsActive: true,
            newIsActive: false,
          }),
        }),
      }),
    );
  });

  it('keeps successful store response when audit logging rejects', async () => {
    const store = { id: 2, code: 'SHP-002', name: 'District Store', is_active: true };
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));
    prismaMock.stores.aggregate.mockResolvedValueOnce({ _max: { id: 1 } });
    prismaMock.stores.create.mockResolvedValueOnce(store);

    const res = await request(app)
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${signToken({ role: 'DISTRICT_MANAGER' })}`)
      .send({ name: 'District Store' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ store });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'STORE_CREATED' }));
  });
});
