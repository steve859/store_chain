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

import app from '../src/app';
import prisma from '../src/db/prisma';

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
    const store = { id: 2, code: 'SHP-002', name: 'District Store', is_active: true };
    prismaMock.stores.aggregate.mockResolvedValueOnce({ _max: { id: 1 } });
    prismaMock.stores.create.mockResolvedValueOnce(store);

    const res = await request(app)
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${signToken({ role: 'DISTRICT_MANAGER' })}`)
      .send({ name: 'District Store' });

    expect(res.status).toBe(201);
    expect(prismaMock.stores.create).toHaveBeenCalledWith({
      data: {
        code: 'SHP-002',
        name: 'District Store',
        address: null,
        phone: null,
        timezone: undefined,
        is_active: true,
      },
    });
    expect(res.body).toEqual({ store });
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
  });
});
