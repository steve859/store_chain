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

import app from '../src/app';
import prisma from '../src/db/prisma';

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
  });

  it('keeps POST /api/v1/suppliers create response shape', async () => {
    const supplier = { id: 2, name: 'Acme', phone: '123', email: null };
    prismaMock.suppliers.findFirst.mockResolvedValueOnce(null);
    prismaMock.suppliers.create.mockResolvedValueOnce(supplier);

    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`)
      .send({ name: 'Acme', phone: '123' });

    expect(res.status).toBe(201);
    expect(prismaMock.suppliers.create).toHaveBeenCalledWith({
      data: {
        name: 'Acme',
        phone: '123',
        email: null,
        address: null,
        contact_name: null,
        note: null,
      },
    });
    expect(res.body).toEqual(supplier);
  });

  it('keeps DELETE /api/v1/suppliers/:id response shape', async () => {
    const supplier = { id: 3, name: 'Acme', phone: '123' };
    prismaMock.suppliers.findUnique.mockResolvedValueOnce(supplier);
    prismaMock.suppliers.delete.mockResolvedValueOnce(supplier);

    const res = await request(app)
      .delete('/api/v1/suppliers/3')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`);

    expect(res.status).toBe(200);
    expect(prismaMock.suppliers.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(res.body).toEqual({ message: 'Supplier deleted successfully' });
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
  });

  it('keeps delete role protection unchanged', async () => {
    const res = await request(app)
      .delete('/api/v1/suppliers/3')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(prismaMock.suppliers.delete).not.toHaveBeenCalled();
  });
});
