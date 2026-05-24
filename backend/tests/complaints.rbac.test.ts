import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/modules/complaints/complaints.service', () => {
  return {
    __esModule: true,
    ComplaintsService: {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      remove: jest.fn(),
    },
  };
});

jest.mock('../src/db/prisma', () => {
  return {
    __esModule: true,
    default: {
      stores: {
        findUnique: jest.fn(),
      },
    },
  };
});

import app from '../src/app';
import prisma from '../src/db/prisma';
import { ComplaintsService } from '../src/modules/complaints/complaints.service';

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

const complaint = {
  id: 'CPL-000001',
  storeId: 1,
  storeName: 'Store 1',
  employeeName: 'cashier',
  reason: 'test',
  description: 'test description',
  image: null,
  date: new Date().toISOString(),
  status: 'Chờ xử lý',
  adminNote: null,
};

describe('Complaints route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ComplaintsService.list as unknown as jest.Mock).mockResolvedValue({ items: [complaint], total: 1, take: 200, skip: 0 });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValue(complaint);
    (ComplaintsService.create as unknown as jest.Mock).mockResolvedValue(complaint);
    (ComplaintsService.updateStatus as unknown as jest.Mock).mockResolvedValue({ ...complaint, status: 'Đang xử lý' });
    (ComplaintsService.remove as unknown as jest.Mock).mockResolvedValue(true);
    (prisma.stores.findUnique as unknown as jest.Mock).mockResolvedValue({ id: 1, name: 'Store 1', code: 'S1' });
  });

  it('returns 401 for unauthenticated complaint access', async () => {
    const res = await request(app).get('/api/v1/complaints');

    expect(res.status).toBe(401);
    expect(ComplaintsService.list).not.toHaveBeenCalled();
  });

  it('allows CASHIER to submit a complaint and view /my', async () => {
    const token = signToken({ role: 'cashier' });

    const createRes = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({
        storeName: 'Store 1',
        employeeName: 'cashier',
        reason: 'test',
        description: 'test description',
      });

    const myRes = await request(app)
      .get('/api/v1/complaints/my?employeeName=cashier')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(createRes.status).toBe(201);
    expect(myRes.status).toBe(200);
    expect(ComplaintsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storeName: 'Store 1',
        employeeName: 'cashier',
        storeId: '1',
      }),
    );
    expect(ComplaintsService.list).toHaveBeenCalledWith(expect.objectContaining({ employeeName: 'cashier', storeId: 1 }));
  });

  it('filters /my complaints by active store for non-admin users', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/complaints/my?employeeName=cashier&take=25&skip=5')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(ComplaintsService.list).toHaveBeenCalledWith({
      employeeName: 'cashier',
      storeId: 1,
      take: 25,
      skip: 5,
    });
  });

  it('does not add active store filter to /my complaints for ADMIN', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });

    const res = await request(app)
      .get('/api/v1/complaints/my?employeeName=cashier')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(ComplaintsService.list).toHaveBeenCalledWith({
      employeeName: 'cashier',
      storeId: undefined,
      take: 200,
      skip: 0,
    });
  });

  it('keeps /my missing employeeName rejected with 400', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/complaints/my')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'employeeName is required' });
    expect(ComplaintsService.list).not.toHaveBeenCalled();
  });

  it('rejects CASHIER from listing all complaints', async () => {
    const token = signToken({ role: 'cashier' });

    const res = await request(app)
      .get('/api/v1/complaints')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
  });

  it('allows STORE_MANAGER to update complaint status', async () => {
    const token = signToken({ role: 'store_manager' });

    const res = await request(app)
      .patch('/api/v1/complaints/CPL-000001/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'processing' });

    expect(res.status).toBe(200);
    expect(ComplaintsService.updateStatus).toHaveBeenCalledWith('CPL-000001', 'Đang xử lý', null);
  });

  it('keeps invalid complaint status rejected with existing 400 response', async () => {
    const token = signToken({ role: 'store_manager' });

    const res = await request(app)
      .patch('/api/v1/complaints/CPL-000001/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'not-valid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid status. Allowed:');
    expect(ComplaintsService.get).not.toHaveBeenCalled();
    expect(ComplaintsService.updateStatus).not.toHaveBeenCalled();
  });

  it('keeps missing complaint status update returned as 404', async () => {
    const token = signToken({ role: 'store_manager' });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/v1/complaints/CPL-404/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'processing' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Complaint not found' });
    expect(ComplaintsService.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects CASHIER from updating status or deleting complaints', async () => {
    const token = signToken({ role: 'cashier' });

    const statusRes = await request(app)
      .patch('/api/v1/complaints/CPL-000001/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'processing' });

    const deleteRes = await request(app)
      .delete('/api/v1/complaints/CPL-000001')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(statusRes.status).toBe(403);
    expect(deleteRes.status).toBe(403);
    expect(ComplaintsService.updateStatus).not.toHaveBeenCalled();
    expect(ComplaintsService.remove).not.toHaveBeenCalled();
  });

  it('keeps cross-store detail check rejected with 403', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1], primaryStoreId: 1 });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce({ ...complaint, storeId: 2 });

    const res = await request(app)
      .get('/api/v1/complaints/CPL-000002')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('allows non-admin same-store complaint detail', async () => {
    const token = signToken({ role: 'store_manager' });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce(complaint);

    const res = await request(app)
      .get('/api/v1/complaints/CPL-000001')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(complaint);
  });

  it('rejects non-admin complaint detail when storeId is null', async () => {
    const token = signToken({ role: 'store_manager' });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce({ ...complaint, storeId: null });

    const res = await request(app)
      .get('/api/v1/complaints/CPL-000001')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects non-admin complaint detail when storeId is missing', async () => {
    const token = signToken({ role: 'store_manager' });
    const complaintWithoutStoreId: Record<string, unknown> = { ...complaint };
    delete complaintWithoutStoreId.storeId;
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce(complaintWithoutStoreId);

    const res = await request(app)
      .get('/api/v1/complaints/CPL-000001')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('rejects non-admin complaint detail when storeId is invalid', async () => {
    const token = signToken({ role: 'store_manager' });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce({ ...complaint, storeId: 'abc' });

    const res = await request(app)
      .get('/api/v1/complaints/CPL-000001')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('allows ADMIN complaint detail when storeId is missing, null, or invalid', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    const complaintWithoutStoreId: Record<string, unknown> = { ...complaint };
    delete complaintWithoutStoreId.storeId;

    (ComplaintsService.get as unknown as jest.Mock)
      .mockResolvedValueOnce({ ...complaint, storeId: null })
      .mockResolvedValueOnce(complaintWithoutStoreId)
      .mockResolvedValueOnce({ ...complaint, storeId: 'abc' });

    const nullRes = await request(app)
      .get('/api/v1/complaints/CPL-000001')
      .set('Authorization', `Bearer ${token}`);

    const missingRes = await request(app)
      .get('/api/v1/complaints/CPL-000002')
      .set('Authorization', `Bearer ${token}`);

    const invalidRes = await request(app)
      .get('/api/v1/complaints/CPL-000003')
      .set('Authorization', `Bearer ${token}`);

    expect(nullRes.status).toBe(200);
    expect(missingRes.status).toBe(200);
    expect(invalidRes.status).toBe(200);
  });

  it('keeps missing complaint detail returned as 404', async () => {
    const token = signToken({ role: 'store_manager' });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/v1/complaints/CPL-404')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Complaint not found' });
  });

  it('keeps cross-store status and delete checks rejected with 403 for allowed roles', async () => {
    const managerToken = signToken({ role: 'store_manager', storeIds: [1], primaryStoreId: 1 });
    const adminToken = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });

    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce({ ...complaint, storeId: 2 });
    const statusRes = await request(app)
      .patch('/api/v1/complaints/CPL-000002/status')
      .set('Authorization', `Bearer ${managerToken}`)
      .set('x-store-id', '1')
      .send({ status: 'processing' });

    const deleteAsManagerRes = await request(app)
      .delete('/api/v1/complaints/CPL-000002')
      .set('Authorization', `Bearer ${managerToken}`)
      .set('x-store-id', '1');

    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce({ ...complaint, storeId: 2 });
    const deleteAsAdminRes = await request(app)
      .delete('/api/v1/complaints/CPL-000002')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(statusRes.status).toBe(403);
    expect(deleteAsManagerRes.status).toBe(403);
    expect(deleteAsAdminRes.status).toBe(200);
    expect(ComplaintsService.updateStatus).not.toHaveBeenCalled();
    expect(ComplaintsService.remove).toHaveBeenCalledTimes(1);
  });

  it('rejects STORE_MANAGER status update when complaint storeId is null, missing, or invalid', async () => {
    const token = signToken({ role: 'store_manager', storeIds: [1], primaryStoreId: 1 });
    const complaintWithoutStoreId: Record<string, unknown> = { ...complaint };
    delete complaintWithoutStoreId.storeId;

    (ComplaintsService.get as unknown as jest.Mock)
      .mockResolvedValueOnce({ ...complaint, storeId: null })
      .mockResolvedValueOnce(complaintWithoutStoreId)
      .mockResolvedValueOnce({ ...complaint, storeId: 'abc' });

    const nullRes = await request(app)
      .patch('/api/v1/complaints/CPL-000001/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'processing' });

    const missingRes = await request(app)
      .patch('/api/v1/complaints/CPL-000002/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'processing' });

    const invalidRes = await request(app)
      .patch('/api/v1/complaints/CPL-000003/status')
      .set('Authorization', `Bearer ${token}`)
      .set('x-store-id', '1')
      .send({ status: 'processing' });

    expect(nullRes.status).toBe(403);
    expect(nullRes.body).toEqual({ error: 'Forbidden' });
    expect(missingRes.status).toBe(403);
    expect(missingRes.body).toEqual({ error: 'Forbidden' });
    expect(invalidRes.status).toBe(403);
    expect(invalidRes.body).toEqual({ error: 'Forbidden' });
    expect(ComplaintsService.updateStatus).not.toHaveBeenCalled();
  });

  it('allows ADMIN status update when complaint storeId is null, missing, or invalid', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    const complaintWithoutStoreId: Record<string, unknown> = { ...complaint };
    delete complaintWithoutStoreId.storeId;

    (ComplaintsService.get as unknown as jest.Mock)
      .mockResolvedValueOnce({ ...complaint, storeId: null })
      .mockResolvedValueOnce(complaintWithoutStoreId)
      .mockResolvedValueOnce({ ...complaint, storeId: 'abc' });

    const nullRes = await request(app)
      .patch('/api/v1/complaints/CPL-000001/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'processing' });

    const missingRes = await request(app)
      .patch('/api/v1/complaints/CPL-000002/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'processing' });

    const invalidRes = await request(app)
      .patch('/api/v1/complaints/CPL-000003/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'processing' });

    expect(nullRes.status).toBe(200);
    expect(missingRes.status).toBe(200);
    expect(invalidRes.status).toBe(200);
    expect(ComplaintsService.updateStatus).toHaveBeenCalledTimes(3);
  });

  it('allows ADMIN delete when complaint storeId is null, missing, or invalid', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    const complaintWithoutStoreId: Record<string, unknown> = { ...complaint };
    delete complaintWithoutStoreId.storeId;

    (ComplaintsService.get as unknown as jest.Mock)
      .mockResolvedValueOnce({ ...complaint, storeId: null })
      .mockResolvedValueOnce(complaintWithoutStoreId)
      .mockResolvedValueOnce({ ...complaint, storeId: 'abc' });

    const nullRes = await request(app)
      .delete('/api/v1/complaints/CPL-000001')
      .set('Authorization', `Bearer ${token}`);

    const missingRes = await request(app)
      .delete('/api/v1/complaints/CPL-000002')
      .set('Authorization', `Bearer ${token}`);

    const invalidRes = await request(app)
      .delete('/api/v1/complaints/CPL-000003')
      .set('Authorization', `Bearer ${token}`);

    expect(nullRes.status).toBe(200);
    expect(nullRes.body).toEqual({ message: 'Deleted' });
    expect(missingRes.status).toBe(200);
    expect(missingRes.body).toEqual({ message: 'Deleted' });
    expect(invalidRes.status).toBe(200);
    expect(invalidRes.body).toEqual({ message: 'Deleted' });
    expect(ComplaintsService.remove).toHaveBeenCalledTimes(3);
  });

  it('keeps missing complaint delete returned as 404', async () => {
    const token = signToken({ role: 'admin', storeIds: [], primaryStoreId: null });
    (ComplaintsService.get as unknown as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/v1/complaints/CPL-404')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Complaint not found' });
    expect(ComplaintsService.remove).not.toHaveBeenCalled();
  });
});
