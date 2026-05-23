import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      products: {
        findMany: jest.fn(),
      },
    },
  };
});

import app from '../src/app';
import prisma from '../src/db/prisma';

type PrismaMock = typeof prisma & {
  products: {
    findMany: jest.Mock;
  };
};

const prismaMock = prisma as PrismaMock;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'category-test@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Categories routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps GET /api/v1/categories response shape', async () => {
    prismaMock.products.findMany.mockResolvedValueOnce([
      { category: 'Drinks' },
      { category: 'Food' },
      { category: 'Drinks' },
      { category: '' },
      { category: null },
    ]);

    const res = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'Drinks', name: 'Drinks', description: null, productsCount: 2 },
      { id: 'Food', name: 'Food', description: null, productsCount: 1 },
    ]);
  });

  it('keeps GET /api/v1/categories/:id response shape', async () => {
    prismaMock.products.findMany.mockResolvedValueOnce([
      { category: 'Drinks' },
      { category: 'Food' },
    ]);

    const res = await request(app)
      .get('/api/v1/categories/Food')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'Food', name: 'Food', description: null, productsCount: 1 });
  });

  it('keeps not-found response for GET /api/v1/categories/:id', async () => {
    prismaMock.products.findMany.mockResolvedValueOnce([{ category: 'Drinks' }]);

    const res = await request(app)
      .get('/api/v1/categories/Missing')
      .set('Authorization', `Bearer ${signToken()}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Category not found' });
  });

  it('keeps auth requirement on GET /api/v1/categories', async () => {
    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
  });

  it('keeps unsupported create response behavior', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ name: 'New Category' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      error: 'Not supported: categories are derived from products.category',
      status: 200,
    });
  });
});
