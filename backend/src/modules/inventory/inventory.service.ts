import { Prisma } from '@prisma/client';
import { invalidateCatalogCache } from '../../lib/cache/catalog';
import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { InventoryRepository } from './inventory.repository';

type AuditSource = {
  ip: string | undefined;
  userAgent: string | null;
};

type UserContext = {
  role: string;
  userId: number | undefined;
};

type MutationContext = {
  source: AuditSource;
  user: UserContext;
};

type ReceiveInput = {
  body: Record<string, unknown>;
  activeStoreId: number;
  context: MutationContext;
};

type AdjustInput = {
  body: Record<string, unknown>;
  activeStoreId: number;
  context: MutationContext;
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

const safeInventorySnapshot = (inventory: unknown) => {
  if (!inventory) return null;
  const row = asRecord(inventory);
  return {
    id: row.id,
    store_id: row.store_id,
    variant_id: row.variant_id,
    quantity: row.quantity,
    reserved: row.reserved,
    last_cost: row.last_cost,
    last_update: row.last_update,
  };
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

const resolveWriteStoreId = (body: Record<string, unknown>, activeStoreId: number, role: string) => {
  const requestedStoreId = body.storeId;
  return isAdminRole(role) && requestedStoreId !== undefined && requestedStoreId !== null && requestedStoreId !== ''
    ? Number(requestedStoreId)
    : activeStoreId;
};

export const InventoryService = {
  listAdjustments: async ({
    isAdmin,
    activeStoreId,
    queryStoreId,
    q,
    take,
    skip,
  }: {
    isAdmin: boolean;
    activeStoreId: number;
    queryStoreId: number | undefined;
    q: string;
    take: number;
    skip: number;
  }) => {
    const storeId = isAdmin && queryStoreId !== undefined ? queryStoreId : activeStoreId;
    const where: Prisma.stock_movementsWhereInput = {
      movement_type: 'adjustment',
      ...(Number.isFinite(storeId) ? { store_id: storeId } : {}),
      ...(q
        ? {
            OR: [
              { reason: { contains: q, mode: 'insensitive' } },
              { reference_id: { contains: q, mode: 'insensitive' } },
              {
                stores: {
                  is: {
                    OR: [
                      { code: { contains: q, mode: 'insensitive' } },
                      { name: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                users: {
                  is: {
                    OR: [
                      { full_name: { contains: q, mode: 'insensitive' } },
                      { username: { contains: q, mode: 'insensitive' } },
                      { email: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                product_variants: {
                  is: {
                    OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { barcode: { contains: q, mode: 'insensitive' } },
                      { variant_code: { contains: q, mode: 'insensitive' } },
                      {
                        products: {
                          is: {
                            OR: [
                              { name: { contains: q, mode: 'insensitive' } },
                              { sku: { contains: q, mode: 'insensitive' } },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await InventoryRepository.listAdjustments({ where, take, skip });
    return { items, total, take, skip };
  },

  listInventory: async ({
    isAdmin,
    activeStoreId,
    queryStoreId,
    take,
    skip,
  }: {
    isAdmin: boolean;
    activeStoreId: number;
    queryStoreId: number | undefined;
    take: number;
    skip: number;
  }) => {
    const storeId = isAdmin && queryStoreId !== undefined ? queryStoreId : activeStoreId;
    const where = storeId ? { store_id: storeId } : {};
    const [items, total] = await InventoryRepository.listInventory({ where, take, skip });
    return { items, total, take, skip };
  },

  getVariantInventory: async (storeId: number, variantId: number) => {
    const inventory = await InventoryRepository.findInventoryByStoreAndVariant(storeId, variantId);
    if (!inventory) {
      return { status: 'not_found' as const };
    }

    return { status: 'ok' as const, inventory };
  },

  checkLegacyStoreAccess: ({ storeId, activeStoreId, role }: { storeId: number; activeStoreId: number; role: string }) => {
    if (!isAdminRole(role) && Number.isFinite(activeStoreId) && storeId !== activeStoreId) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: store does not match active store' } };
    }

    return { status: 'ok' as const };
  },

  lookupInventory: async (storeId: number, barcode: string) => {
    const variant = await InventoryRepository.findVariantByBarcode(barcode);
    if (!variant) {
      return { status: 'variant_not_found' as const };
    }

    const inventory = await InventoryRepository.findInventoryQuantityByStoreAndVariant(storeId, variant.id);
    return { status: 'ok' as const, variant, inventory };
  },

  receiveInventory: async ({ body, activeStoreId, context }: ReceiveInput) => {
    const { variantId, quantity, unitCost, createdBy, lotCode, expiryDate, referenceId, reason } = body;
    const storeIdNum = resolveWriteStoreId(body, activeStoreId, context.user.role);
    const variantIdNum = Number(variantId);
    const qty = toDecimal(quantity);
    const cost = toDecimal(unitCost);

    if (!Number.isFinite(storeIdNum) || !Number.isFinite(variantIdNum)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid storeId/variantId' } };
    }
    if (qty.lte(0)) {
      return { status: 'bad_request' as const, body: { error: 'Quantity must be > 0' } };
    }

    const expiry = expiryDate ? new Date(String(expiryDate)) : null;
    if (expiryDate && Number.isNaN(expiry!.getTime())) {
      return { status: 'bad_request' as const, body: { error: 'Invalid expiryDate' } };
    }

    const result = await InventoryRepository.receiveInventory({
      storeId: storeIdNum,
      variantId: variantIdNum,
      quantity: qty,
      unitCost: cost,
      lotCode,
      expiry,
      referenceId,
      reason,
      createdBy,
    });

    await invalidateCatalogCache(storeIdNum);
    const movementRecord = asRecord(result.movement);
    const reasonText = reason ? String(reason) : '';
    await writeAuditLog({
      action: 'INVENTORY_RECEIVED',
      objectType: 'stock_movement',
      objectId: movementRecord.id !== undefined && movementRecord.id !== null ? String(movementRecord.id) : undefined,
      userId: context.user.userId,
      payload: {
        result: 'success',
        source: context.source,
        storeId: storeIdNum,
        variantId: variantIdNum,
        after: safeInventorySnapshot(result.inventory),
        metadata: {
          quantity,
          unitCost,
          lotId: asRecord(result.lot).id,
          stockMovementId: movementRecord.id !== undefined && movementRecord.id !== null ? String(movementRecord.id) : undefined,
          referenceId: referenceId !== undefined && referenceId !== null ? String(referenceId) : undefined,
          reasonPresent: reasonText.length > 0,
          reasonPreview: reasonText ? reasonText.slice(0, 80) : undefined,
          createdByEffective: createdBy ? Number(createdBy) : null,
        },
      },
    });

    return { status: 'created' as const, result };
  },

  adjustInventory: async ({ body, activeStoreId, context }: AdjustInput) => {
    const { variantId, delta, setTo, createdBy, reason, referenceId, note } = body;
    const storeIdNum = resolveWriteStoreId(body, activeStoreId, context.user.role);
    const variantIdNum = Number(variantId);
    if (!Number.isFinite(storeIdNum) || !Number.isFinite(variantIdNum)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid storeId/variantId' } };
    }

    const hasDelta = delta !== undefined && delta !== null && delta !== '';
    const hasSetTo = setTo !== undefined && setTo !== null && setTo !== '';
    if (hasDelta === hasSetTo) {
      return { status: 'bad_request' as const, body: { error: 'Provide exactly one of delta or setTo' } };
    }

    const result = await InventoryRepository.adjustInventory({
      storeId: storeIdNum,
      variantId: variantIdNum,
      hasDelta,
      deltaValue: delta,
      setToValue: setTo,
      reason,
      referenceId,
      note,
      createdBy,
      toDecimal,
    });

    await invalidateCatalogCache(storeIdNum);
    const movementRecord = asRecord(result.movement);
    const reasonText = reason ? String(reason) : '';
    await writeAuditLog({
      action: 'INVENTORY_ADJUSTED',
      objectType: 'stock_movement',
      objectId: movementRecord.id !== undefined && movementRecord.id !== null ? String(movementRecord.id) : undefined,
      userId: context.user.userId,
      payload: {
        result: 'success',
        source: context.source,
        storeId: storeIdNum,
        variantId: variantIdNum,
        before: safeInventorySnapshot(result.previousInventory),
        after: safeInventorySnapshot(result.inventory),
        metadata: {
          delta: hasDelta ? delta : undefined,
          setTo: hasSetTo ? setTo : undefined,
          stockMovementId: movementRecord.id !== undefined && movementRecord.id !== null ? String(movementRecord.id) : undefined,
          referenceId: referenceId !== undefined && referenceId !== null ? String(referenceId) : undefined,
          reasonPresent: reasonText.length > 0,
          reasonPreview: reasonText ? reasonText.slice(0, 80) : undefined,
          createdByEffective: createdBy ? Number(createdBy) : null,
        },
      },
    });

    return { status: 'created' as const, result: { inventory: result.inventory, movement: result.movement } };
  },
};
