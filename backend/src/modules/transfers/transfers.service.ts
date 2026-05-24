import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { TransfersRepository } from './transfers.repository';

type AuditSource = {
  ip: string | undefined;
  userAgent: string | null;
};

type UserContext = {
  role: string;
  userId: number | undefined;
};

type ServiceContext = {
  user: UserContext;
  source: AuditSource;
  activeStoreId: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const isAdminRole = (role: string) => role.toLowerCase() === 'admin';

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch {
    // Audit logging is best-effort for this phase.
  }
};

const safeTransferSnapshot = (transfer: unknown) => {
  if (!transfer) return null;
  const row = asRecord(transfer);
  return {
    id: row.id,
    transfer_number: row.transfer_number,
    from_store_id: row.from_store_id,
    to_store_id: row.to_store_id,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
  };
};

const transferItemMetadata = (items: unknown[]) => ({
  itemCount: items.length,
  variantIds: items.map((item) => asRecord(item).variant_id).filter((variantId) => variantId !== undefined && variantId !== null),
  quantities: items.map((item) => String(asRecord(item).quantity)),
});

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

const generateTransferNumber = (): string => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TR-${Date.now()}-${rand}`;
};

const parseTransferItems = (items: unknown[]) =>
  items
    .map((item) => {
      const record = asRecord(item);
      return { variantId: Number(record.variantId), quantity: toDecimal(record.quantity) };
    })
    .filter((item) => Number.isFinite(item.variantId) && item.quantity.gt(0));

const isForbiddenSentinel = (value: unknown) => '__forbiddenActiveStore' in asRecord(value);

export const TransfersService = {
  listTransfers: async ({
    query,
    context,
  }: {
    query: Record<string, unknown>;
    context: ServiceContext;
  }) => {
    const fromStoreId = query.fromStoreId ? Number(query.fromStoreId) : undefined;
    const toStoreId = query.toStoreId ? Number(query.toStoreId) : undefined;
    const status = query.status ? String(query.status) : undefined;
    const q = String(query.q ?? '').trim();
    const take = query.take ? Math.min(Number(query.take), 200) : 50;
    const skip = query.skip ? Number(query.skip) : 0;

    const isAdmin = isAdminRole(context.user.role);
    const activeStoreId = Number.isFinite(context.activeStoreId) ? context.activeStoreId : null;

    if (!isAdmin && activeStoreId) {
      if (Number.isFinite(fromStoreId) && fromStoreId !== activeStoreId) {
        return { status: 'forbidden' as const, body: { error: 'Forbidden: fromStoreId not allowed' } };
      }
      if (Number.isFinite(toStoreId) && toStoreId !== activeStoreId) {
        return { status: 'forbidden' as const, body: { error: 'Forbidden: toStoreId not allowed' } };
      }
    }

    const where: Prisma.store_transfersWhereInput = {
      ...(Number.isFinite(fromStoreId) ? { from_store_id: fromStoreId } : {}),
      ...(Number.isFinite(toStoreId) ? { to_store_id: toStoreId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { transfer_number: { contains: q, mode: 'insensitive' } },
              { stores_store_transfers_from_store_idTostores: { is: { name: { contains: q, mode: 'insensitive' } } } },
              { stores_store_transfers_from_store_idTostores: { is: { code: { contains: q, mode: 'insensitive' } } } },
              { stores_store_transfers_to_store_idTostores: { is: { name: { contains: q, mode: 'insensitive' } } } },
              { stores_store_transfers_to_store_idTostores: { is: { code: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    if (!isAdmin && activeStoreId && !Number.isFinite(fromStoreId) && !Number.isFinite(toStoreId)) {
      where.OR = [{ from_store_id: activeStoreId }, { to_store_id: activeStoreId }];
    }

    const [items, total] = await TransfersRepository.listTransfers({ where, take, skip });
    return { status: 'ok' as const, data: { items, total, take, skip } };
  },

  getTransferDetail: async ({ id, context }: { id: number; context: ServiceContext }) => {
    const transfer = await TransfersRepository.findTransferDetail(id);
    if (!transfer) {
      return { status: 'not_found' as const };
    }

    const isAdmin = isAdminRole(context.user.role);
    const isSourceStore = Number(transfer.from_store_id) === context.activeStoreId;
    const isDestinationStore = Number(transfer.to_store_id) === context.activeStoreId;
    if (!isAdmin && !isSourceStore && !isDestinationStore) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: transfer does not belong to active store' } };
    }

    return { status: 'ok' as const, transfer };
  },

  createTransfer: async ({ body, context }: { body: Record<string, unknown>; context: ServiceContext }) => {
    const { fromStoreId, toStoreId, createdBy, transferNumber, items } = body;
    const isAdmin = isAdminRole(context.user.role);
    const fromStoreIdNum = isAdmin ? Number(fromStoreId) : context.activeStoreId;
    const toStoreIdNum = Number(toStoreId);
    const createdByNum = Number.isFinite(context.user.userId)
      ? Number(context.user.userId)
      : createdBy !== undefined && createdBy !== null
        ? Number(createdBy)
        : null;

    if (!isAdmin && Number.isFinite(fromStoreId) && Number(fromStoreId) !== context.activeStoreId) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: fromStoreId must match active store' } };
    }

    if (!Number.isFinite(fromStoreIdNum) || !Number.isFinite(toStoreIdNum) || fromStoreIdNum === toStoreIdNum) {
      return { status: 'bad_request' as const, body: { error: 'Invalid fromStoreId/toStoreId' } };
    }
    if (createdByNum !== null && !Number.isFinite(createdByNum)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid createdBy' } };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'items is required' } };
    }

    const parsedItems = parseTransferItems(items);
    if (parsedItems.length !== items.length) {
      return { status: 'bad_request' as const, body: { error: 'Invalid items payload' } };
    }

    const created = await TransfersRepository.createTransfer({
      fromStoreId: fromStoreIdNum,
      toStoreId: toStoreIdNum,
      createdBy: createdByNum,
      transferNumber: transferNumber ? String(transferNumber) : generateTransferNumber(),
      items: parsedItems,
    });

    const createdRecord = asRecord(created);
    const createdItems = Array.isArray(createdRecord.store_transfer_items) ? (createdRecord.store_transfer_items as unknown[]) : [];
    await writeAuditLog({
      action: 'TRANSFER_CREATED',
      objectType: 'store_transfer',
      objectId: createdRecord.id !== undefined && createdRecord.id !== null ? String(createdRecord.id) : undefined,
      userId: context.user.userId,
      payload: {
        result: 'success',
        source: context.source,
        fromStoreId: fromStoreIdNum,
        toStoreId: toStoreIdNum,
        after: safeTransferSnapshot(created),
        metadata: {
          itemCount: parsedItems.length,
          variantIds: parsedItems.map((item) => item.variantId),
          quantities: parsedItems.map((item) => item.quantity.toString()),
          reservedStockChanged: true,
          transferItemIds: createdItems.map((item) => asRecord(item).id).filter((idValue) => idValue !== undefined && idValue !== null),
        },
      },
    });

    return { status: 'created' as const, transfer: created };
  },

  dispatchTransfer: async ({ id, body, context }: { id: number; body: Record<string, unknown>; context: ServiceContext }) => {
    const createdBy = body.createdBy !== undefined ? Number(body.createdBy) : null;
    const referenceId = body.referenceId ? String(body.referenceId) : null;
    const reason = body.reason ? String(body.reason) : 'Dispatch transfer';
    if (createdBy !== null && !Number.isFinite(createdBy)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid createdBy' } };
    }

    const result = await TransfersRepository.dispatchTransfer({
      id,
      isAdmin: isAdminRole(context.user.role),
      activeStoreId: context.activeStoreId,
      createdBy,
      referenceId,
      reason,
    });

    if (isForbiddenSentinel(result.transfer)) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: transfer source store does not match active store' } };
    }

    const details = asRecord(result.auditDetails);
    const dispatchItems = Array.isArray(details.items) ? details.items : [];
    await writeAuditLog({
      action: 'TRANSFER_DISPATCHED',
      objectType: 'store_transfer',
      objectId: String(asRecord(result.transfer).id ?? id),
      userId: context.user.userId,
      payload: {
        result: 'success',
        source: context.source,
        fromStoreId: details.fromStoreId,
        toStoreId: details.toStoreId,
        transferId: asRecord(result.transfer).id ?? id,
        before: safeTransferSnapshot(details.before),
        after: safeTransferSnapshot(result.transfer),
        metadata: {
          ...transferItemMetadata(dispatchItems),
          stockMovementIds: Array.isArray(details.stockMovementIds) ? details.stockMovementIds : [],
          movementType: 'transfer_out',
          reasonPresent: reason.length > 0,
          reasonPreview: reason ? reason.slice(0, 80) : undefined,
        },
      },
    });

    return { status: 'created' as const, transfer: result.transfer };
  },

  receiveTransfer: async ({ id, body, context }: { id: number; body: Record<string, unknown>; context: ServiceContext }) => {
    const createdBy = body.createdBy !== undefined ? Number(body.createdBy) : null;
    const referenceId = body.referenceId ? String(body.referenceId) : null;
    const reason = body.reason ? String(body.reason) : 'Receive transfer';
    const bodyItems = Array.isArray(body.items) ? body.items : null;
    if (createdBy !== null && !Number.isFinite(createdBy)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid createdBy' } };
    }

    if (bodyItems !== null && bodyItems.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'items must be non-empty when provided' } };
    }

    const result = await TransfersRepository.receiveTransfer({
      id,
      isAdmin: isAdminRole(context.user.role),
      activeStoreId: context.activeStoreId,
      createdBy,
      referenceId,
      reason,
      bodyItems,
      toDecimal,
    });

    if (isForbiddenSentinel(result.transfer)) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: transfer destination store does not match active store' } };
    }

    const details = asRecord(result.auditDetails);
    const receiveItems = Array.isArray(details.items) ? details.items : [];
    await writeAuditLog({
      action: 'TRANSFER_RECEIVED',
      objectType: 'store_transfer',
      objectId: String(asRecord(result.transfer).id ?? id),
      userId: context.user.userId,
      payload: {
        result: 'success',
        source: context.source,
        fromStoreId: details.fromStoreId,
        toStoreId: details.toStoreId,
        transferId: asRecord(result.transfer).id ?? id,
        before: safeTransferSnapshot(details.before),
        after: safeTransferSnapshot(result.transfer),
        metadata: {
          ...transferItemMetadata(receiveItems),
          receivedQuantities: Array.isArray(details.receivedItems) ? details.receivedItems : [],
          stockMovementIds: Array.isArray(details.stockMovementIds) ? details.stockMovementIds : [],
          movementType: 'transfer_in',
          reasonPresent: reason.length > 0,
          reasonPreview: reason ? reason.slice(0, 80) : undefined,
        },
      },
    });

    return { status: 'created' as const, transfer: result.transfer };
  },

  cancelTransfer: async ({ id, context }: { id: number; context: ServiceContext }) => {
    const result = await TransfersRepository.cancelTransfer({
      id,
      isAdmin: isAdminRole(context.user.role),
      activeStoreId: context.activeStoreId,
    });

    if (isForbiddenSentinel(result.transfer)) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: transfer source store does not match active store' } };
    }

    const details = asRecord(result.auditDetails);
    const cancelItems = Array.isArray(details.items) ? details.items : [];
    await writeAuditLog({
      action: 'TRANSFER_CANCELLED',
      objectType: 'store_transfer',
      objectId: String(asRecord(result.transfer).id ?? id),
      userId: context.user.userId,
      payload: {
        result: 'success',
        source: context.source,
        fromStoreId: details.fromStoreId,
        toStoreId: details.toStoreId,
        transferId: asRecord(result.transfer).id ?? id,
        before: safeTransferSnapshot(details.before),
        after: safeTransferSnapshot(result.transfer),
        metadata: {
          ...transferItemMetadata(cancelItems),
          releasedReservedQuantities: cancelItems.map((item) => ({
            variantId: asRecord(item).variant_id,
            quantity: String(asRecord(item).quantity),
          })),
        },
      },
    });

    return { status: 'created' as const, transfer: result.transfer };
  },
};
