import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/db/prisma', () => ({
  __esModule: true,
  default: {
    roles: {
      findMany: jest.fn(),
    },
    stores: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../src/modules/users/users.service', () => ({
  UserService: {
    getAllUsers: jest.fn(),
    getUserById: jest.fn(),
    getUserStores: jest.fn(),
    setUserStores: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
  },
}));

import app from '../src/app';
import prisma from '../src/db/prisma';
import { UserService } from '../src/modules/users/users.service';

type PrismaMock = typeof prisma & {
  roles: {
    findMany: jest.Mock;
  };
  stores: {
    findMany: jest.Mock;
  };
};

const prismaMock = prisma as PrismaMock;
const userServiceMock = UserService as jest.Mocked<typeof UserService>;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'users-test@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Users routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 for unauthenticated access', async () => {
    const res = await request(app).get('/api/v1/users');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
    expect(userServiceMock.getAllUsers).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin access', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(userServiceMock.getAllUsers).not.toHaveBeenCalled();
  });

  it('allows ADMIN to reach GET /api/v1/users existing handler behavior', async () => {
    const users = [{ id: 1, email: 'admin@example.com', username: 'admin' }];
    userServiceMock.getAllUsers.mockResolvedValueOnce(
      users as unknown as Awaited<ReturnType<typeof UserService.getAllUsers>>,
    );

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`);

    expect(res.status).toBe(200);
    expect(userServiceMock.getAllUsers).toHaveBeenCalled();
    expect(res.body).toEqual(users);
  });

  it('allows ADMIN to reach GET /api/v1/users/meta existing handler behavior', async () => {
    const roles = [{ id: 1, name: 'ADMIN' }];
    const stores = [{ id: 1, name: 'Main Store' }];
    prismaMock.roles.findMany.mockResolvedValueOnce(roles);
    prismaMock.stores.findMany.mockResolvedValueOnce(stores);

    const res = await request(app)
      .get('/api/v1/users/meta')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`);

    expect(res.status).toBe(200);
    expect(prismaMock.roles.findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } });
    expect(prismaMock.stores.findMany).toHaveBeenCalledWith({
      where: { is_active: true },
      orderBy: { id: 'asc' },
    });
    expect(res.body).toEqual({ roles, stores });
  });

  it('allows ADMIN to reach PUT /api/v1/users/:id/stores existing handler behavior', async () => {
    const stores = [{ storeId: 1, isPrimary: true }];
    userServiceMock.setUserStores.mockResolvedValueOnce(
      stores as unknown as Awaited<ReturnType<typeof UserService.setUserStores>>,
    );

    const res = await request(app)
      .put('/api/v1/users/7/stores')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ storeIds: [1], primaryStoreId: 1 });

    expect(res.status).toBe(200);
    expect(userServiceMock.setUserStores).toHaveBeenCalledWith('7', {
      storeIds: [1],
      primaryStoreId: 1,
    });
    expect(res.body).toEqual({ stores });
  });

  it('keeps invalid store assignment response shape for ADMIN', async () => {
    const res = await request(app)
      .put('/api/v1/users/7/stores')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ storeIds: '1' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'storeIds must be an array of numbers' });
    expect(userServiceMock.setUserStores).not.toHaveBeenCalled();
  });
});
