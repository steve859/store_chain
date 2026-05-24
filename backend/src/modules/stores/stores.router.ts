import { Request, Router } from 'express';
import prisma from '../../db/prisma';
import { Prisma } from '@prisma/client'
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { AuditLogsService } from '../audit_logs/audit_logs.service';

const router = Router();

const readStoreRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER'];
const writeStoreRoles = ['ADMIN', 'DISTRICT_MANAGER'];

router.use(authenticateToken);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorUserId = (req: Request): number | undefined => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch {
    // Audit logging is best-effort for this phase.
  }
};

const safeStoreSnapshot = (store: unknown) => {
  if (!store) return null;
  const row = asRecord(store);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    timezone: row.timezone,
    is_active: row.is_active,
    created_at: row.created_at,
  };
};

const storePresenceMetadata = (store: unknown) => {
  const row = asRecord(store);
  return {
    addressPresent: row.address !== undefined && row.address !== null && String(row.address).trim() !== '',
    phonePresent: row.phone !== undefined && row.phone !== null && String(row.phone).trim() !== '',
  };
};

const changedFields = (before: unknown, after: unknown) => {
  const beforeRow = asRecord(before);
  const afterRow = asRecord(after);
  return ['code', 'name', 'address', 'phone', 'timezone', 'is_active'].filter((field) => {
    const beforeValue = beforeRow[field] === undefined || beforeRow[field] === null ? null : String(beforeRow[field]);
    const afterValue = afterRow[field] === undefined || afterRow[field] === null ? null : String(afterRow[field]);
    return beforeValue !== afterValue;
  });
};

const buildNextStoreCode = async (): Promise<string> => {
  const result = await prisma.stores.aggregate({
    _max: { id: true },
  });
  const nextId = (result._max.id ?? 0) + 1;
  return `SHP-${String(nextId).padStart(3, '0')}`;
};

/**
 * UC-S1: Store list
 * GET /api/v1/stores?take=50&skip=0&q=q1
 */
router.get('/', authorizeRoles(readStoreRoles), async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;
    const includeStats = String(req.query.includeStats ?? '').toLowerCase();
    const wantsStats = includeStats === '1' || includeStats === 'true' || includeStats === 'yes';

    const where: Prisma.storesWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.stores.findMany({
        where,
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.stores.count({ where }),
    ]);

    if (!wantsStats || items.length === 0) {
      return res.json({ items, total, take, skip });
    }

    const storeIds = items.map(s => s.id);

    const [usersCounts, inventoriesCounts, invoicesCounts] = await Promise.all([
      prisma.users.groupBy({
        by: ['store_id'],
        where: { store_id: { in: storeIds }, is_active: true },
        _count: { _all: true },
      }),
      prisma.inventories.groupBy({
        by: ['store_id'],
        where: { store_id: { in: storeIds } },
        _count: { _all: true },
      }),
      prisma.invoices.groupBy({
        by: ['store_id'],
        where: { store_id: { in: storeIds } },
        _count: { _all: true },
      }),
    ]);

    const employeesByStore = new Map<number, number>();
    for (const row of usersCounts) {
      if (row.store_id !== null) employeesByStore.set(row.store_id, row._count._all);
    }

    const productsByStore = new Map<number, number>();
    for (const row of inventoriesCounts) {
      if (row.store_id !== null) productsByStore.set(row.store_id, row._count._all);
    }

    const ordersByStore = new Map<number, number>();
    for (const row of invoicesCounts) {
      if (row.store_id !== null) ordersByStore.set(row.store_id, row._count._all);
    }

    const enriched = items.map(store => ({
      ...store,
      stats: {
        employees: employeesByStore.get(store.id) ?? 0,
        products: productsByStore.get(store.id) ?? 0,
        orders: ordersByStore.get(store.id) ?? 0,
      },
    }));

    return res.json({ items: enriched, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-S1: Store details
 * GET /api/v1/stores/:id
 */
router.get('/:id', authorizeRoles(readStoreRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.params.id);
    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'Invalid store id' });
    }

    const store = await prisma.stores.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    return res.json({ store });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-S1: Store overview (details modal)
 * GET /api/v1/stores/:id/overview
 */
router.get('/:id/overview', authorizeRoles(readStoreRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.params.id);
    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'Invalid store id' });
    }

    const [store, employees, inventories, invoices] = await Promise.all([
      prisma.stores.findUnique({ where: { id: storeId } }),
      prisma.users.findMany({
        where: { store_id: storeId, is_active: true },
        orderBy: { id: 'desc' },
        select: {
          id: true,
          username: true,
          full_name: true,
          email: true,
          phone: true,
          role_id: true,
          roles: { select: { name: true } },
        },
      }),
      prisma.inventories.findMany({
        where: { store_id: storeId },
        orderBy: [{ quantity: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          id: true,
          quantity: true,
          reserved: true,
          last_update: true,
          product_variants: {
            select: {
              id: true,
              barcode: true,
              name: true,
              price: true,
              products: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.invoices.findMany({
        where: { store_id: storeId },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          invoice_number: true,
          total: true,
          created_at: true,
          customers: { select: { name: true, phone: true } },
        },
      }),
    ]);

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    return res.json({
      store,
      stats: {
        employees: employees.length,
        products: inventories.length,
        orders: invoices.length,
      },
      employees,
      inventories,
      invoices,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-S1: Create store
 * POST /api/v1/stores
 * Body: { code?: string, name: string, address?: string, phone?: string, timezone?: string, isActive?: boolean }
 */
router.post('/', authorizeRoles(writeStoreRoles), async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = body.name !== undefined && body.name !== null ? String(body.name).trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const codeProvided = body.code !== undefined && body.code !== null && String(body.code).trim() !== '' ? String(body.code).trim() : null;
    const code = codeProvided ?? (await buildNextStoreCode());

    const created = await prisma.stores.create({
      data: {
        code,
        name,
        address: body.address !== undefined && body.address !== null && String(body.address).trim() !== '' ? String(body.address) : null,
        phone: body.phone !== undefined && body.phone !== null && String(body.phone).trim() !== '' ? String(body.phone) : null,
        timezone: body.timezone !== undefined && body.timezone !== null && String(body.timezone).trim() !== '' ? String(body.timezone) : undefined,
        is_active: body.isActive !== undefined ? Boolean(body.isActive) : true,
      },
    });

    await writeAuditLog({
      action: 'STORE_CREATED',
      objectType: 'store',
      objectId: String(created.id),
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        after: safeStoreSnapshot(created),
        metadata: storePresenceMetadata(created),
      },
    });

    return res.status(201).json({ store: created });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-S1: Update store
 * PUT /api/v1/stores/:id
 */
router.put('/:id', authorizeRoles(writeStoreRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.params.id);
    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'Invalid store id' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.storesUpdateInput = {};
    if (body.code !== undefined) data.code = String(body.code);
    if (body.name !== undefined) data.name = String(body.name);
    if (body.address !== undefined) data.address = body.address === null || String(body.address).trim() === '' ? null : String(body.address);
    if (body.phone !== undefined) data.phone = body.phone === null || String(body.phone).trim() === '' ? null : String(body.phone);
    if (body.timezone !== undefined) data.timezone = body.timezone === null || String(body.timezone).trim() === '' ? null : String(body.timezone);
    if (body.isActive !== undefined) data.is_active = Boolean(body.isActive);

    const before = await prisma.stores.findUnique({ where: { id: storeId } });
    const updated = await prisma.stores.update({
      where: { id: storeId },
      data,
    });

    await writeAuditLog({
      action: 'STORE_UPDATED',
      objectType: 'store',
      objectId: String(storeId),
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        before: safeStoreSnapshot(before),
        after: safeStoreSnapshot(updated),
        metadata: {
          ...storePresenceMetadata(updated),
          changedFields: changedFields(before, updated),
        },
      },
    });

    return res.json({ store: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-S1: Deactivate store (soft delete)
 * DELETE /api/v1/stores/:id
 */
router.delete('/:id', authorizeRoles(writeStoreRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.params.id);
    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'Invalid store id' });
    }

    const before = await prisma.stores.findUnique({ where: { id: storeId } });
    const updated = await prisma.stores.update({
      where: { id: storeId },
      data: { is_active: false },
    });

    await writeAuditLog({
      action: 'STORE_DEACTIVATED',
      objectType: 'store',
      objectId: String(storeId),
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        before: safeStoreSnapshot(before),
        after: safeStoreSnapshot(updated),
        metadata: {
          previousIsActive: asRecord(before).is_active,
          newIsActive: asRecord(updated).is_active,
        },
      },
    });

    return res.json({ store: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
