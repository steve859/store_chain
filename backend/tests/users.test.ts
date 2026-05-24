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
    users: {
      findUnique: jest.fn(),
    },
    user_stores: {
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

jest.mock('../src/modules/audit_logs/audit_logs.service', () => ({
  AuditLogsService: {
    createLog: jest.fn(),
  },
}));

import app from '../src/app';
import prisma from '../src/db/prisma';
import { UserService } from '../src/modules/users/users.service';
import { AuditLogsService } from '../src/modules/audit_logs/audit_logs.service';

type PrismaMock = typeof prisma & {
  roles: {
    findMany: jest.Mock;
  };
  stores: {
    findMany: jest.Mock;
  };
  users: {
    findUnique: jest.Mock;
  };
  user_stores: {
    findMany: jest.Mock;
  };
};

const prismaMock = prisma as PrismaMock;
const userServiceMock = UserService as jest.Mocked<typeof UserService>;
const auditLogsMock = AuditLogsService as jest.Mocked<typeof AuditLogsService>;

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

  it('writes USER_CREATED audit log after successful POST /api/v1/users', async () => {
    const newUser = {
      id: 9,
      username: 'cashier01',
      email: 'cashier01@example.com',
      full_name: 'Cashier One',
      role_id: 4,
      store_id: 1,
      is_active: true,
    };
    userServiceMock.createUser.mockResolvedValueOnce(
      newUser as unknown as Awaited<ReturnType<typeof UserService.createUser>>,
    );

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'ADMIN' })}`)
      .set('User-Agent', 'users-test-agent')
      .send({
        email: 'cashier01@example.com',
        password: 'secret-password',
        roleId: 4,
        storeIds: [1, 2],
        primaryStoreId: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(newUser);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_CREATED',
        objectType: 'user',
        objectId: '9',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          targetUser: expect.objectContaining({
            id: 9,
            username: 'cashier01',
            email: 'cashier01@example.com',
            fullName: 'Cashier One',
            roleId: 4,
            storeId: 1,
            isActive: true,
          }),
          metadata: expect.objectContaining({
            requestedStoreIds: [1, 2],
            primaryStoreId: 1,
          }),
        }),
      }),
    );
    expect(JSON.stringify(auditLogsMock.createLog.mock.calls[0][0])).not.toContain('secret-password');
  });

  it('writes USER_UPDATED audit log with safe password metadata only', async () => {
    prismaMock.users.findUnique.mockResolvedValueOnce({
      id: 7,
      username: 'cashier01',
      email: 'old@example.com',
      full_name: 'Old Name',
      role_id: 4,
      store_id: 1,
      is_active: true,
      password_hash: 'old-hash',
    });
    const updated = {
      id: 7,
      username: 'cashier01',
      email: 'new@example.com',
      full_name: 'New Name',
      role_id: 4,
      store_id: 1,
      is_active: true,
    };
    userServiceMock.updateUser.mockResolvedValueOnce(
      updated as unknown as Awaited<ReturnType<typeof UserService.updateUser>>,
    );

    const res = await request(app)
      .put('/api/v1/users/7')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'ADMIN' })}`)
      .send({ email: 'new@example.com', name: 'New Name', password: 'new-secret' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_UPDATED',
        objectType: 'user',
        objectId: '7',
        userId: 77,
        payload: expect.objectContaining({
          result: 'success',
          before: expect.objectContaining({ email: 'old@example.com', fullName: 'Old Name' }),
          after: expect.objectContaining({ email: 'new@example.com', fullName: 'New Name' }),
          changedFields: ['email', 'name'],
          passwordChanged: true,
        }),
      }),
    );
    const auditPayload = JSON.stringify(auditLogsMock.createLog.mock.calls[0][0]);
    expect(auditPayload).not.toContain('new-secret');
    expect(auditPayload).not.toContain('old-hash');
    expect(auditPayload).not.toContain('password_hash');
  });

  it('writes USER_STORE_ASSIGNMENTS_UPDATED audit log after store assignment update', async () => {
    prismaMock.user_stores.findMany.mockResolvedValueOnce([
      { store_id: 1, role_id: null, is_primary: true, is_active: true },
    ]);
    const stores = [
      { storeId: 2, roleId: null, isPrimary: true, isActive: true },
      { storeId: 3, roleId: null, isPrimary: false, isActive: true },
    ];
    userServiceMock.setUserStores.mockResolvedValueOnce(
      stores as unknown as Awaited<ReturnType<typeof UserService.setUserStores>>,
    );

    const res = await request(app)
      .put('/api/v1/users/7/stores')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'ADMIN' })}`)
      .send({ storeIds: [2, 3], primaryStoreId: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ stores });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_STORE_ASSIGNMENTS_UPDATED',
        objectType: 'user',
        objectId: '7',
        userId: 77,
        payload: expect.objectContaining({
          before: [{ storeId: 1, roleId: null, isPrimary: true, isActive: true }],
          after: stores,
          requestedStoreIds: [2, 3],
          primaryStoreId: 2,
        }),
      }),
    );
  });

  it('writes USER_DEACTIVATED audit log after successful DELETE /api/v1/users/:id', async () => {
    prismaMock.users.findUnique.mockResolvedValueOnce({
      id: 7,
      username: 'cashier01',
      email: 'cashier01@example.com',
      full_name: 'Cashier One',
      role_id: 4,
      store_id: 1,
      is_active: true,
      password_hash: 'old-hash',
    });
    userServiceMock.deleteUser.mockResolvedValueOnce({
      id: 7,
      username: 'cashier01',
      email: 'cashier01@example.com',
      full_name: 'Cashier One',
      role_id: 4,
      store_id: 1,
      is_active: false,
    } as unknown as Awaited<ReturnType<typeof UserService.deleteUser>>);

    const res = await request(app)
      .delete('/api/v1/users/7')
      .set('Authorization', `Bearer ${signToken({ userId: 77, role: 'ADMIN' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'User deleted successfully (Soft Delete)' });
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_DEACTIVATED',
        objectType: 'user',
        objectId: '7',
        userId: 77,
        payload: expect.objectContaining({
          before: expect.objectContaining({ isActive: true }),
          after: expect.objectContaining({ isActive: false }),
        }),
      }),
    );
  });

  it('does not write success audit log when validation fails', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ email: 'missing-role@example.com', password: 'secret' });

    expect(res.status).toBe(400);
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
    expect(userServiceMock.createUser).not.toHaveBeenCalled();
  });

  it('does not write success audit log when service call fails', async () => {
    userServiceMock.updateUser.mockRejectedValueOnce(new Error('User not found'));

    const res = await request(app)
      .put('/api/v1/users/7')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ email: 'new@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'User not found' });
    expect(auditLogsMock.createLog).not.toHaveBeenCalled();
  });

  it('keeps mutation response successful when audit logging rejects', async () => {
    const newUser = { id: 9, username: 'cashier01', email: 'cashier01@example.com' };
    userServiceMock.createUser.mockResolvedValueOnce(
      newUser as unknown as Awaited<ReturnType<typeof UserService.createUser>>,
    );
    auditLogsMock.createLog.mockRejectedValueOnce(new Error('audit failed'));

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send({ email: 'cashier01@example.com', password: 'secret-password', roleId: 4 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(newUser);
    expect(auditLogsMock.createLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_CREATED' }));
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
