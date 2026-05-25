import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { StoresRepository } from './stores.repository';

interface AuditSource {
  ip: string | undefined;
  userAgent: string | null;
}

interface StoreListParams {
  q: string;
  take: number;
  skip: number;
  wantsStats: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

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

const buildStoreWhere = (q: string): Prisma.storesWhereInput =>
  q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

const buildNextStoreCode = async (): Promise<string> => {
  const result = await StoresRepository.aggregateMaxId();
  const nextId = (result._max.id ?? 0) + 1;
  return `SHP-${String(nextId).padStart(3, '0')}`;
};

const buildStoreCreateData = async (body: Record<string, unknown>): Promise<Prisma.storesCreateInput> => {
  const name = body.name !== undefined && body.name !== null ? String(body.name).trim() : '';
  const codeProvided = body.code !== undefined && body.code !== null && String(body.code).trim() !== '' ? String(body.code).trim() : null;
  const code = codeProvided ?? (await buildNextStoreCode());

  return {
    code,
    name,
    address: body.address !== undefined && body.address !== null && String(body.address).trim() !== '' ? String(body.address) : null,
    phone: body.phone !== undefined && body.phone !== null && String(body.phone).trim() !== '' ? String(body.phone) : null,
    timezone: body.timezone !== undefined && body.timezone !== null && String(body.timezone).trim() !== '' ? String(body.timezone) : undefined,
    is_active: body.isActive !== undefined ? Boolean(body.isActive) : true,
  };
};

const buildStoreUpdateData = (body: Record<string, unknown>): Prisma.storesUpdateInput => {
  const data: Prisma.storesUpdateInput = {};
  if (body.code !== undefined) data.code = String(body.code);
  if (body.name !== undefined) data.name = String(body.name);
  if (body.address !== undefined) data.address = body.address === null || String(body.address).trim() === '' ? null : String(body.address);
  if (body.phone !== undefined) data.phone = body.phone === null || String(body.phone).trim() === '' ? null : String(body.phone);
  if (body.timezone !== undefined) data.timezone = body.timezone === null || String(body.timezone).trim() === '' ? null : String(body.timezone);
  if (body.isActive !== undefined) data.is_active = Boolean(body.isActive);
  return data;
};

export const StoreService = {
  listStores: async ({ q, take, skip, wantsStats }: StoreListParams) => {
    const where = buildStoreWhere(q);
    const [items, total] = await Promise.all([StoresRepository.findMany({ where, take, skip }), StoresRepository.count(where)]);

    if (!wantsStats || items.length === 0) {
      return { items, total, take, skip };
    }

    const storeIds = items.map((store) => store.id);
    const [usersCounts, inventoriesCounts, invoicesCounts] = await Promise.all([
      StoresRepository.countUsersByStore(storeIds),
      StoresRepository.countInventoriesByStore(storeIds),
      StoresRepository.countInvoicesByStore(storeIds),
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

    const enriched = items.map((store) => ({
      ...store,
      stats: {
        employees: employeesByStore.get(store.id) ?? 0,
        products: productsByStore.get(store.id) ?? 0,
        orders: ordersByStore.get(store.id) ?? 0,
      },
    }));

    return { items: enriched, total, take, skip };
  },

  getStoreById: (storeId: number) => StoresRepository.findById(storeId),

  getStoreOverview: async (storeId: number) => {
    const [store, employees, inventories, invoices] = await Promise.all([
      StoresRepository.findById(storeId),
      StoresRepository.findEmployeesForOverview(storeId),
      StoresRepository.findInventoriesForOverview(storeId),
      StoresRepository.findInvoicesForOverview(storeId),
    ]);

    return {
      store,
      stats: {
        employees: employees.length,
        products: inventories.length,
        orders: invoices.length,
      },
      employees,
      inventories,
      invoices,
    };
  },

  createStore: async (body: Record<string, unknown>, userId: number | undefined, source: AuditSource) => {
    const created = await StoresRepository.create(await buildStoreCreateData(body));

    await writeAuditLog({
      action: 'STORE_CREATED',
      objectType: 'store',
      objectId: String(created.id),
      userId,
      payload: {
        result: 'success',
        source,
        after: safeStoreSnapshot(created),
        metadata: storePresenceMetadata(created),
      },
    });

    return created;
  },

  updateStore: async (storeId: number, body: Record<string, unknown>, userId: number | undefined, source: AuditSource) => {
    const before = await StoresRepository.findById(storeId);
    const updated = await StoresRepository.update(storeId, buildStoreUpdateData(body));

    await writeAuditLog({
      action: 'STORE_UPDATED',
      objectType: 'store',
      objectId: String(storeId),
      userId,
      payload: {
        result: 'success',
        source,
        before: safeStoreSnapshot(before),
        after: safeStoreSnapshot(updated),
        metadata: {
          ...storePresenceMetadata(updated),
          changedFields: changedFields(before, updated),
        },
      },
    });

    return updated;
  },

  deactivateStore: async (storeId: number, userId: number | undefined, source: AuditSource) => {
    const before = await StoresRepository.findById(storeId);
    const updated = await StoresRepository.deactivate(storeId);

    await writeAuditLog({
      action: 'STORE_DEACTIVATED',
      objectType: 'store',
      objectId: String(storeId),
      userId,
      payload: {
        result: 'success',
        source,
        before: safeStoreSnapshot(before),
        after: safeStoreSnapshot(updated),
        metadata: {
          previousIsActive: asRecord(before).is_active,
          newIsActive: asRecord(updated).is_active,
        },
      },
    });

    return updated;
  },
};
