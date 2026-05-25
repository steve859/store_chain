import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

type ListArgs<TWhere> = {
  where: TWhere;
  take: number;
  skip: number;
};

type ReceiveInventoryArgs = {
  storeId: number;
  variantId: number;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  lotCode: unknown;
  expiry: Date | null;
  referenceId: unknown;
  reason: unknown;
  createdBy: unknown;
};

type AdjustInventoryArgs = {
  storeId: number;
  variantId: number;
  hasDelta: boolean;
  deltaValue: unknown;
  setToValue: unknown;
  reason: unknown;
  referenceId: unknown;
  note: unknown;
  createdBy: unknown;
  toDecimal: (value: unknown) => Prisma.Decimal;
};

export const InventoryRepository = {
  listAdjustments: ({ where, take, skip }: ListArgs<Prisma.stock_movementsWhereInput>) =>
    Promise.all([
      prisma.stock_movements.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take,
        skip,
        include: {
          stores: true,
          users: { select: { id: true, username: true, full_name: true, email: true } },
          product_variants: { include: { products: true } },
        },
      }),
      prisma.stock_movements.count({ where }),
    ]),

  listInventory: ({ where, take, skip }: ListArgs<Prisma.inventoriesWhereInput>) =>
    Promise.all([
      prisma.inventories.findMany({
        where,
        include: { product_variants: { include: { products: true } } },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.inventories.count({ where }),
    ]),

  findInventoryByStoreAndVariant: (storeId: number, variantId: number) =>
    prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variantId },
      include: { product_variants: { include: { products: true } }, stores: true },
    }),

  findVariantByBarcode: (barcode: string) =>
    prisma.product_variants.findFirst({
      where: { barcode },
      include: { products: true },
    }),

  findInventoryQuantityByStoreAndVariant: (storeId: number, variantId: number) =>
    prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variantId },
    }),

  receiveInventory: ({
    storeId,
    variantId,
    quantity,
    unitCost,
    lotCode,
    expiry,
    referenceId,
    reason,
    createdBy,
  }: ReceiveInventoryArgs) =>
    prisma.$transaction(async (tx) => {
      const variant = await tx.product_variants.findUnique({ where: { id: variantId } });
      if (!variant) {
        throw new Error('Variant not found');
      }

      const store = await tx.stores.findUnique({ where: { id: storeId } });
      if (!store) {
        throw new Error('Store not found');
      }

      const existingInventory = await tx.inventories.findFirst({
        where: { store_id: storeId, variant_id: variantId },
      });

      const inventory = existingInventory
        ? await tx.inventories.update({
            where: { id: existingInventory.id },
            data: {
              quantity: { increment: quantity },
              last_cost: unitCost,
              last_update: new Date(),
            },
          })
        : await tx.inventories.create({
            data: {
              store_id: storeId,
              variant_id: variantId,
              quantity,
              reserved: new Prisma.Decimal(0),
              last_cost: unitCost,
              last_update: new Date(),
            },
          });

      const lot = await tx.stock_lots.create({
        data: {
          store_id: storeId,
          variant_id: variantId,
          lot_code: lotCode ? String(lotCode) : null,
          quantity,
          quantity_remaining: quantity,
          cost: unitCost,
          expiry_date: expiry,
        },
      });

      const movement = await tx.stock_movements.create({
        data: {
          store_id: storeId,
          variant_id: variantId,
          change: quantity,
          movement_type: 'receive',
          reference_id: referenceId ? String(referenceId) : String(lot.id),
          reason: reason ? String(reason) : 'Stock receive',
          created_by: createdBy ? Number(createdBy) : null,
        },
      });

      return { inventory, lot, movement };
    }),

  adjustInventory: ({
    storeId,
    variantId,
    hasDelta,
    deltaValue,
    setToValue,
    reason,
    referenceId,
    note,
    createdBy,
    toDecimal,
  }: AdjustInventoryArgs) => {
    let previousInventory: unknown = null;

    return prisma.$transaction(async (tx) => {
      const inventory = await tx.inventories.findFirst({
        where: { store_id: storeId, variant_id: variantId },
      });
      previousInventory = inventory;

      const deltaDec = hasDelta ? toDecimal(deltaValue) : toDecimal(setToValue);

      if (!inventory) {
        const initialQty = hasDelta ? deltaDec : deltaDec;
        if (hasDelta && initialQty.lte(0)) {
          throw new Error('Inventory not found');
        }
        if (!hasDelta && initialQty.lt(0)) {
          throw new Error('Resulting quantity would be negative');
        }

        const created = await tx.inventories.create({
          data: {
            store_id: storeId,
            variant_id: variantId,
            quantity: initialQty,
            reserved: new Prisma.Decimal(0),
            last_cost: new Prisma.Decimal(0),
            last_update: new Date(),
          },
        });

        const movement = await tx.stock_movements.create({
          data: {
            store_id: storeId,
            variant_id: variantId,
            change: initialQty,
            movement_type: 'adjustment',
            reference_id:
              referenceId !== undefined && referenceId !== null && String(referenceId).trim() !== ''
                ? String(referenceId)
                : note !== undefined && note !== null && String(note).trim() !== ''
                  ? `NOTE:${String(note).trim()}`
                  : null,
            reason: reason ? String(reason) : 'Inventory adjustment',
            created_by: createdBy ? Number(createdBy) : null,
          },
        });

        return { inventory: created, movement, previousInventory };
      }

      const currentQty = new Prisma.Decimal(inventory.quantity ?? 0);
      const reserved = new Prisma.Decimal(inventory.reserved ?? 0);
      const effectiveDelta = hasDelta ? deltaDec : deltaDec.minus(currentQty);

      const newQty = currentQty.plus(effectiveDelta);
      if (newQty.lt(0)) {
        throw new Error('Resulting quantity would be negative');
      }

      if (newQty.lt(reserved)) {
        throw new Error('Resulting quantity would be below reserved');
      }

      const updated = await tx.inventories.update({
        where: { id: inventory.id },
        data: {
          quantity: newQty,
          last_update: new Date(),
        },
      });

      const movement = await tx.stock_movements.create({
        data: {
          store_id: storeId,
          variant_id: variantId,
          change: effectiveDelta,
          movement_type: 'adjustment',
          reference_id:
            referenceId !== undefined && referenceId !== null && String(referenceId).trim() !== ''
              ? String(referenceId)
              : note !== undefined && note !== null && String(note).trim() !== ''
                ? `NOTE:${String(note).trim()}`
                : null,
          reason: reason ? String(reason) : 'Inventory adjustment',
          created_by: createdBy ? Number(createdBy) : null,
        },
      });

      return { inventory: updated, movement, previousInventory };
    });
  },
};
