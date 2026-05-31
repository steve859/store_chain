import { Prisma } from '@prisma/client';
import { invalidateCatalogCache } from '../../lib/cache/catalog';
import { OrdersRepository } from './orders.repository';

type UserContext = {
  role: string;
  userId: number | null;
};

type CreateOrderInput = {
  activeStoreId: number;
  user: UserContext;
  body: Record<string, unknown>;
};

type ReceiveOrderInput = {
  id: number;
  activeStoreId: number;
  user: UserContext;
  body: Record<string, unknown>;
};

const forbiddenStoreResponse = {
  status: 'forbidden' as const,
  body: { error: 'Forbidden: order does not belong to active store' },
};

const toDecimal = (value: unknown): Prisma.Decimal => {
  if (value === null || value === undefined || value === '') {
    throw new Error('Invalid decimal value');
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new Error('Invalid decimal value');
  }
  return new Prisma.Decimal(num);
};

const generateOrderNumber = (): string => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PO-${Date.now()}-${rand}`;
};

const generateReceiptNumber = (): string => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `GRN-${Date.now()}-${rand}`;
};

const isAdminRole = (role: string) => role.toLowerCase() === 'admin';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const buildListWhere = ({
  storeId,
  status,
  supplierId,
  q,
}: {
  storeId: number | undefined;
  status: string | undefined;
  supplierId: number | undefined;
  q: string;
}): Prisma.purchase_ordersWhereInput => ({
  ...(Number.isFinite(storeId) ? { store_id: storeId } : {}),
  ...(status ? { status } : {}),
  ...(Number.isFinite(supplierId) ? { supplier_id: supplierId } : {}),
  ...(q
    ? {
        OR: [
          { order_number: { contains: q, mode: 'insensitive' } },
          { suppliers: { is: { name: { contains: q, mode: 'insensitive' } } } },
          { stores: { is: { name: { contains: q, mode: 'insensitive' } } } },
          { stores: { is: { code: { contains: q, mode: 'insensitive' } } } },
        ],
      }
    : {}),
});

const parseCreateItems = (items: unknown[]) =>
  items
    .map((item) => {
      const record = asRecord(item);
      return {
        variantId: Number(record.variantId),
        quantity: toDecimal(record.quantity),
        unitCost: toDecimal(record.unitCost),
      };
    })
    .filter((item) => Number.isFinite(item.variantId) && item.quantity.gt(0) && item.unitCost.gte(0));

const parseBodyReceiveItems = (bodyItems: unknown[]) =>
  bodyItems
    .map((item) => {
      const record = asRecord(item);
      const variantId = Number(record.variantId);
      const receivedQty = toDecimal(record.receivedQty);
      const unitCost = record.unitCost !== undefined && record.unitCost !== null ? toDecimal(record.unitCost) : null;
      const lotCode = record.lotCode !== undefined && record.lotCode !== null && String(record.lotCode).trim() !== '' ? String(record.lotCode) : null;
      const expiryDateRaw = record.expiryDate !== undefined && record.expiryDate !== null && String(record.expiryDate).trim() !== '' ? new Date(String(record.expiryDate)) : null;
      const expiryDate = expiryDateRaw && Number.isNaN(expiryDateRaw.getTime()) ? null : expiryDateRaw;
      return {
        variantId,
        receivedQty,
        unitCost: unitCost ?? new Prisma.Decimal(0),
        lotCode,
        expiryDate,
      };
    })
    .filter((item) => Number.isFinite(item.variantId) && item.receivedQty.gt(0));

const parseStoredPurchaseItems = (purchaseItems: Array<Record<string, unknown>>) =>
  purchaseItems
    .map((item) => ({
      variantId: Number(item.variant_id ?? NaN),
      receivedQty: item.quantity as Prisma.Decimal,
      unitCost: item.unit_cost as Prisma.Decimal,
      lotCode: null,
      expiryDate: null,
    }))
    .filter((item) => Number.isFinite(item.variantId) && item.receivedQty.gt(0));

export const OrdersService = {
  listOrders: async ({
    storeId,
    status,
    supplierId,
    q,
    take,
    skip,
  }: {
    storeId: number | undefined;
    status: string | undefined;
    supplierId: number | undefined;
    q: string;
    take: number;
    skip: number;
  }) => {
    const where = buildListWhere({ storeId, status, supplierId, q });
    const [items, total] = await OrdersRepository.listOrders({ where, take, skip });
    return { items, total, take, skip };
  },

  getOrderDetail: async ({ id, activeStoreId, user }: { id: number; activeStoreId: number; user: UserContext }) => {
    const order = await OrdersRepository.findOrderDetail(id);
    if (!order) {
      return { status: 'not_found' as const };
    }

    if (!isAdminRole(user.role) && Number(order.store_id) !== activeStoreId) {
      return forbiddenStoreResponse;
    }

    return { status: 'ok' as const, order };
  },

  createOrder: async ({ activeStoreId, user, body }: CreateOrderInput) => {
    const supplierId = body.supplierId;
    const createdBy = body.createdBy;
    const orderNumber = body.orderNumber;
    const items = body.items;

    const supplierIdNum = supplierId !== undefined && supplierId !== null ? Number(supplierId) : null;
    const createdByNum = Number.isFinite(user.userId)
      ? user.userId
      : createdBy !== undefined && createdBy !== null
        ? Number(createdBy)
        : null;

    if (!Array.isArray(items) || items.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'Invalid items' } };
    }
    if (supplierIdNum !== null && !Number.isFinite(supplierIdNum)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid supplierId' } };
    }
    if (createdByNum !== null && !Number.isFinite(createdByNum)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid createdBy' } };
    }

    const parsedItems = parseCreateItems(items);
    if (parsedItems.length !== items.length) {
      return { status: 'bad_request' as const, body: { error: 'Invalid items payload' } };
    }

    const order = await OrdersRepository.createOrder({
      storeId: activeStoreId,
      supplierId: supplierIdNum,
      createdBy: createdByNum,
      orderNumber: orderNumber ? String(orderNumber) : generateOrderNumber(),
      items: parsedItems,
    });

    return { status: 'created' as const, order };
  },

  updateOrderStatus: async ({ id, status, activeStoreId, user }: { id: number; status: string; activeStoreId: number; user: UserContext }) => {
    const order = await OrdersRepository.findOrderById(id);
    if (!order) {
      throw new Error('Order not found');
    }

    if (!isAdminRole(user.role) && Number(order.store_id) !== activeStoreId) {
      return forbiddenStoreResponse;
    }

    const updated = await OrdersRepository.updateOrderStatus(id, status);
    return { status: 'ok' as const, order: updated };
  },

  deleteDraftOrder: async ({ id, activeStoreId, user }: { id: number; activeStoreId: number; user: UserContext }) => {
    const deleted = await OrdersRepository.deleteDraftOrder({
      id,
      isAdmin: isAdminRole(user.role),
      activeStoreId,
    });

    if (!deleted) {
      return { status: 'not_found' as const };
    }

    if ('__forbiddenActiveStore' in deleted) {
      return forbiddenStoreResponse;
    }

    return { status: 'ok' as const, order: deleted };
  },

  receiveOrder: async ({ id, activeStoreId, user, body }: ReceiveOrderInput) => {
    const referenceId = body.referenceId ? String(body.referenceId) : null;
    const supplierInvoice = body.supplierInvoice ? String(body.supplierInvoice) : null;
    const note = body.note ? String(body.note) : null;
    const reason = body.reason ? String(body.reason) : 'Receive purchase order';
    const bodyItems = Array.isArray(body.items) ? body.items : null;

    if (bodyItems !== null && bodyItems.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'items must be non-empty when provided' } };
    }

    const result = await OrdersRepository.receiveOrder({
      id,
      isAdmin: isAdminRole(user.role),
      activeStoreId,
      createdBy: user.userId,
      referenceId,
      supplierInvoice,
      note,
      reason,
      bodyItems,
      parseItems: (purchaseItems) => (bodyItems === null ? parseStoredPurchaseItems(purchaseItems) : parseBodyReceiveItems(bodyItems)),
      generateReceiptNumber,
    });

    const resultRecord = asRecord(result);
    const orderRecord = asRecord(resultRecord.order);
    const storeIdToInvalidate = Number(orderRecord.store_id ?? activeStoreId);
    await invalidateCatalogCache(storeIdToInvalidate);

    return { status: 'created' as const, result };
  },
};
