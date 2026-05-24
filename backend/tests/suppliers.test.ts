import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      suppliers: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
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

type PrismaMock = typeof prisma & {
  suppliers: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

const prismaMock = prisma as PrismaMock;
const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'supplier-test@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Suppliers routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps GET /api/v1/suppliers response shape and query mapping', async () => {
    const supplier = { id: 1, name: 'Acme', phone: '123', email: null };
    prismaMock.suppliers.count.mockResolvedValueOnce(1);
    prismaMock.suppliers.findMany.mockResolvedValueOnce([supplier]);

    const res = await request(app)
      .get('/api/v1/suppliers?page=2&limit=5&search=ac')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(prismaMock.suppliers.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'ac', mode: 'insensitive' } },
          { phone: { contains: 'ac', mode: 'insensitive' } },
          { contact_name: { contains: 'ac', mode: 'insensitive' } },
        ],
      },
    });
    expect(prismaMock.suppliers.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'ac', mode: 'insensitive' } },
          { phone: { contains: 'ac', mode: 'insensitive' } },
          { contact_name: { contains: 'ac', mode: 'insensitive' } },
        ],
      },
      skip: 5,
      take: 5,
      orderBy: { created_at: 'desc' },
    });
    expect(res.body).toEqual({
      data: [supplier],
      pagination: {
        total: 1,
        page: 2,
        limit: 5,
        totalPages: 1,
      },
    });
  });

  it('keeps GET /api/v1/suppliers/:id response shape', async () => {
    const supplier = { id: 7, name: 'Acme', phone: '123' };
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(supplier);

    const res = await request(app)
      .get('/api/v1/suppliers/7')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(prismaMock.suppliers.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(res.body).toEqual(supplier);
  });

  it('keeps not-found response for GET /api/v1/suppliers/:id', async () => {
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/suppliers/999')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Supplier not found' });
  });

  it('keeps required field validation on create', async () => {
    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ name: 'Acme' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Name and Phone are required' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('keeps POST /api/v1/suppliers create response shape and writes audit log', async () => {
    const supplier = {
      id: 2,
      name: 'Acme',
      phone: '123',
      email: 'ops@example.com',
      address: '123 Main',
      contact_name: 'Ops Lead',
      note: 'preferred',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const payload = {
      name: 'Acme',
      phone: '123',
      email: 'ops@example.com',
      address: '123 Main',
      contactPerson: 'Ops Lead',
      note: 'preferred',
      token: 'should-not-be-audited',
      password: 'should-not-be-audited',
      secret: 'should-not-be-audited',
    };
    prismaMock.suppliers.findFirst.mockResolvedValueOnce(null);
    prismaMock.suppliers.findFirst.mockResolvedValueOnce(null);
    prismaMock.suppliers.create.mockResolvedValueOnce(supplier);

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER', userId: 77 })}`)
      .set('User-Agent', 'supplier-audit-test')
      .send(payload);

    expect(res.status).toBe(201);
    expect(prismaMock.suppliers.create).toHaveBeenCalledWith({
      data: {
        name: 'Acme',
        phone: '123',
        email: 'ops@example.com',
        address: '123 Main',
        contact_name: 'Ops Lead',
        note: 'preferred',
      },
    });
    expect(res.body).toEqual(supplier);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUPPLIER_CREATED',
        objectType: 'supplier',
        objectId: '2',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'supplier-audit-test' }),
          after: {
            id: 2,
            name: 'Acme',
            created_at: '2026-01-01T00:00:00.000Z',
          },
          metadata: {
            contactNamePresent: true,
            phonePresent: true,
            emailPresent: true,
            addressPresent: true,
            notePresent: true,
          },
        }),
      }),
    );
    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0].payload);
    expect(auditPayload).not.toContain('123 Main');
    expect(auditPayload).not.toContain('ops@example.com');
    expect(auditPayload).not.toContain('Ops Lead');
    expect(auditPayload).not.toContain('preferred');
    expect(auditPayload).not.toContain('should-not-be-audited');
    expect(auditPayload).not.toContain('token');
    expect(auditPayload).not.toContain('password');
    expect(auditPayload).not.toContain('secret');
  });

  it('writes SUPPLIER_UPDATED with before/after and changed fields', async () => {
    const beforeSupplier = {
      id: 8,
      name: 'Acme',
      phone: '123',
      email: 'old@example.com',
      address: null,
      contact_name: 'Old Contact',
      note: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const updatedSupplier = {
      ...beforeSupplier,
      name: 'Acme Updated',
      phone: '456',
      email: 'new@example.com',
      address: 'New Address',
    };
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(beforeSupplier);
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(beforeSupplier);
    prismaMock.suppliers.findFirst.mockResolvedValueOnce(null);
    prismaMock.suppliers.findFirst.mockResolvedValueOnce(null);
    prismaMock.suppliers.update.mockResolvedValueOnce(updatedSupplier);

    const res = await request(app)
      .put('/api/v1/suppliers/8')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN', userId: 88 })}`)
      .set('User-Agent', 'supplier-update-audit-test')
      .send({
        name: 'Acme Updated',
        phone: '456',
        email: 'new@example.com',
        address: 'New Address',
        token: 'should-not-be-audited',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updatedSupplier);
    expect(prismaMock.suppliers.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: {
        name: 'Acme Updated',
        phone: '456',
        email: 'new@example.com',
        address: 'New Address',
      },
    });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUPPLIER_UPDATED',
        objectType: 'supplier',
        objectId: '8',
        userId: 88,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'supplier-update-audit-test' }),
          before: {
            id: 8,
            name: 'Acme',
            created_at: '2026-01-01T00:00:00.000Z',
          },
          after: {
            id: 8,
            name: 'Acme Updated',
            created_at: '2026-01-01T00:00:00.000Z',
          },
          metadata: expect.objectContaining({
            changedFields: expect.arrayContaining(['name', 'phone', 'email', 'address']),
            contactNamePresent: true,
            phonePresent: true,
            emailPresent: true,
            addressPresent: true,
            notePresent: false,
          }),
        }),
      }),
    );
    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0].payload);
    expect(auditPayload).not.toContain('old@example.com');
    expect(auditPayload).not.toContain('new@example.com');
    expect(auditPayload).not.toContain('New Address');
    expect(auditPayload).not.toContain('Old Contact');
    expect(auditPayload).not.toContain('should-not-be-audited');
  });

  it('keeps DELETE /api/v1/suppliers/:id response shape and writes audit log', async () => {
    const supplier = {
      id: 3,
      name: 'Acme',
      phone: '123',
      email: 'ops@example.com',
      address: '123 Main',
      contact_name: 'Ops Lead',
      note: 'preferred',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(supplier);
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(supplier);
    prismaMock.suppliers.delete.mockResolvedValueOnce(supplier);

    const res = await request(app)
      .delete('/api/v1/suppliers/3')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN', userId: 99 })}`)
      .set('User-Agent', 'supplier-delete-audit-test');

    expect(res.status).toBe(200);
    expect(prismaMock.suppliers.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(res.body).toEqual({ message: 'Supplier deleted successfully' });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUPPLIER_DELETED',
        objectType: 'supplier',
        objectId: '3',
        userId: 99,
        payload: expect.objectContaining({
          result: 'success',
          source: expect.objectContaining({ userAgent: 'supplier-delete-audit-test' }),
          before: {
            id: 3,
            name: 'Acme',
            created_at: '2026-01-01T00:00:00.000Z',
          },
          metadata: {
            deleted: true,
            contactNamePresent: true,
            phonePresent: true,
            emailPresent: true,
            addressPresent: true,
            notePresent: true,
          },
        }),
      }),
    );
    expect(JSON.stringify(auditLogsMock.createLog.mock.calls[0][0].payload)).not.toContain('ops@example.com');
  });

  it('keeps auth requirement', async () => {
    const res = await request(app).get('/api/v1/suppliers');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
  });

  it('rejects CASHIER from reading suppliers', async () => {
    const res = await request(app)
      .get('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'cashier' })}`);

    expect(res.status).toBe(403);
    expect(prismaMock.suppliers.findMany).not.toHaveBeenCalled();
  });

  it('allows INVENTORY_STAFF to read suppliers', async () => {
    const supplier = { id: 4, name: 'Inventory Supplier', phone: '456', email: null };
    prismaMock.suppliers.count.mockResolvedValueOnce(1);
    prismaMock.suppliers.findMany.mockResolvedValueOnce([supplier]);

    const res = await request(app)
      .get('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'inventory_staff' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [supplier],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    });
  });

  it('keeps role requirement for create', async () => {
    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'CASHIER' })}`)
      .send({ name: 'Acme', phone: '123' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('keeps delete role protection unchanged', async () => {
    const res = await request(app)
      .delete('/api/v1/suppliers/3')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(prismaMock.suppliers.delete).not.toHaveBeenCalled();
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('does not write success audit log when supplier create domain validation fails', async () => {
    prismaMock.suppliers.findFirst.mockResolvedValueOnce({ id: 9, name: 'Existing', phone: '123' });

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ name: 'Acme', phone: '123' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Supplier with this phone number already exists.' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('does not write success audit log when supplier update fails after before snapshot', async () => {
    const supplier = { id: 10, name: 'Acme', phone: '123', email: null };
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(supplier);
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(supplier);
    prismaMock.suppliers.findFirst.mockResolvedValueOnce({ id: 11, name: 'Other', phone: '456' });

    const res = await request(app)
      .put('/api/v1/suppliers/10')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ phone: '456' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Phone number is already taken.' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('keeps successful supplier response when audit logging fails', async () => {
    const supplier = { id: 12, name: 'Acme', phone: '123', email: null };
    prismaMock.suppliers.findFirst.mockResolvedValueOnce(null);
    prismaMock.suppliers.create.mockResolvedValueOnce(supplier);
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ name: 'Acme', phone: '123' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(supplier);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUPPLIER_CREATED' }));
  });
});
