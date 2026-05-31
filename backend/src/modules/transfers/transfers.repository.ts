import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

type ListTransfersArgs = {
  where: Prisma.store_transfersWhereInput;
  take: number;
  skip: number;
};

type ParsedTransferItem = {
  variantId: number;
  quantity: Prisma.Decimal;
};

type CreateTransferArgs = {
  fromStoreId: number;
  toStoreId: number;
  createdBy: number | null;
  transferNumber: string;
  items: ParsedTransferItem[];
};

type DispatchTransferArgs = {
  id: number;
  isAdmin: boolean;
  activeStoreId: number;
  createdBy: number | null;
  referenceId: string | null;
  reason: string;
};

type ReceiveTransferArgs = {
  id: number;
  isAdmin: boolean;
  activeStoreId: number;
  createdBy: number | null;
  referenceId: string | null;
  reason: string;
  bodyItems: unknown[] | null;
  toDecimal: (value: unknown) => Prisma.Decimal;
};

type CancelTransferArgs = {
  id: number;
  isAdmin: boolean;
  activeStoreId: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toDecimalValue = (value: unknown) => (value === undefined || value === null ? 0 : String(value));

export const TransfersRepository = {
  listTransfers: ({ where, take, skip }: ListTransfersArgs) =>
    Promise.all([
      prisma.store_transfers.findMany({
        where,
        include: {
          store_transfer_items: { include: { product_variants: { include: { products: true } } } },
          stores_store_transfers_from_store_idTostores: true,
          stores_store_transfers_to_store_idTostores: true,
          users: true,
        },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.store_transfers.count({ where }),
    ]),

  findTransferDetail: (id: number) =>
    prisma.store_transfers.findUnique({
      where: { id },
      include: {
        store_transfer_items: { include: { product_variants: { include: { products: true } } } },
        stores_store_transfers_from_store_idTostores: true,
        stores_store_transfers_to_store_idTostores: true,
        users: true,
      },
    }),

  createTransfer: ({ fromStoreId, toStoreId, createdBy, transferNumber, items }: CreateTransferArgs) =>
    prisma.$transaction(async (tx) => {
      const [fromStore, toStore] = await Promise.all([
        tx.stores.findUnique({ where: { id: fromStoreId } }),
        tx.stores.findUnique({ where: { id: toStoreId } }),
      ]);
      if (!fromStore) throw new Error('From store not found');
      if (!toStore) throw new Error('To store not found');

      for (const item of items) {
        const inv = await tx.inventories.findFirst({
          where: { store_id: fromStoreId, variant_id: item.variantId },
        });
        if (!inv) throw new Error(`Inventory not found for variant ${item.variantId}`);

        const available = new Prisma.Decimal(inv.quantity ?? 0).sub(new Prisma.Decimal(inv.reserved ?? 0));
        if (available.lt(item.quantity)) {
          throw new Error(`Not enough available stock for variant ${item.variantId}`);
        }
      }

      const transfer = await tx.store_transfers.create({
        data: {
          from_store_id: fromStoreId,
          to_store_id: toStoreId,
          created_by: createdBy,
          transfer_number: transferNumber,
          status: 'pending',
        },
      });

      for (const item of items) {
        await tx.store_transfer_items.create({
          data: {
            transfer_id: transfer.id,
            variant_id: item.variantId,
            quantity: item.quantity,
          },
        });

        const inv = await tx.inventories.findFirst({
          where: { store_id: fromStoreId, variant_id: item.variantId },
        });
        if (!inv) throw new Error(`Inventory not found for variant ${item.variantId}`);

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            reserved: { increment: item.quantity },
            last_update: new Date(),
          },
        });
      }

      return tx.store_transfers.findUnique({
        where: { id: transfer.id },
        include: { store_transfer_items: true },
      });
    }),

  dispatchTransfer: ({ id, isAdmin, activeStoreId, createdBy, referenceId, reason }: DispatchTransferArgs) => {
    const auditDetails: { current: unknown } = { current: null };

    const result = prisma.$transaction(async (tx) => {
      const transfer = await tx.store_transfers.findUnique({
        where: { id },
        include: { store_transfer_items: true },
      });
      if (!transfer) throw new Error('Transfer not found');
      if (!transfer.from_store_id || !transfer.to_store_id) throw new Error('Transfer missing store ids');
      if (transfer.status !== 'pending') throw new Error('Transfer is not dispatchable');
      if (!isAdmin && Number(transfer.from_store_id) !== activeStoreId) {
        return { __forbiddenActiveStore: true };
      }

      const stockMovementIds: string[] = [];
      auditDetails.current = {
        before: transfer,
        items: transfer.store_transfer_items,
        stockMovementIds,
        fromStoreId: transfer.from_store_id,
        toStoreId: transfer.to_store_id,
      };

      for (const item of transfer.store_transfer_items) {
        if (!item.variant_id) throw new Error('Transfer item missing variant_id');

        const inv = await tx.inventories.findFirst({
          where: { store_id: transfer.from_store_id, variant_id: item.variant_id },
        });
        if (!inv) throw new Error(`Inventory not found for variant ${item.variant_id}`);

        const reserved = new Prisma.Decimal(inv.reserved ?? 0);
        if (reserved.lt(item.quantity)) {
          throw new Error(`Reserved stock is insufficient for variant ${item.variant_id}`);
        }

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            reserved: { decrement: item.quantity },
            quantity: { decrement: item.quantity },
            last_update: new Date(),
          },
        });

        const movement = await tx.stock_movements.create({
          data: {
            store_id: transfer.from_store_id,
            variant_id: item.variant_id,
            change: item.quantity.mul(-1),
            movement_type: 'transfer_out',
            reference_id: referenceId ?? String(transfer.id),
            reason,
            created_by: createdBy,
          },
        });
        const movementId = asRecord(movement).id;
        if (movementId !== undefined && movementId !== null) {
          stockMovementIds.push(String(movementId));
        }
      }

      return tx.store_transfers.update({ where: { id: transfer.id }, data: { status: 'in_transit' } });
    });

    return result.then((transfer) => ({ transfer, auditDetails: auditDetails.current }));
  },

  receiveTransfer: ({ id, isAdmin, activeStoreId, createdBy, referenceId, reason, bodyItems, toDecimal }: ReceiveTransferArgs) => {
    const auditDetails: { current: unknown } = { current: null };

    const result = prisma.$transaction(async (tx) => {
      const transfer = await tx.store_transfers.findUnique({
        where: { id },
        include: { store_transfer_items: true },
      });
      if (!transfer) throw new Error('Transfer not found');
      if (!transfer.from_store_id || !transfer.to_store_id) throw new Error('Transfer missing store ids');
      if (transfer.status !== 'in_transit') throw new Error('Transfer is not receivable');
      if (!isAdmin && Number(transfer.to_store_id) !== activeStoreId) {
        return { __forbiddenActiveStore: true };
      }

      const stockMovementIds: string[] = [];
      const receivedItems: Array<{ variantId: number; receivedQty: string }> = [];
      auditDetails.current = {
        before: transfer,
        items: transfer.store_transfer_items,
        receivedItems,
        stockMovementIds,
        fromStoreId: transfer.from_store_id,
        toStoreId: transfer.to_store_id,
      };

      const reference = referenceId ?? `TR:${transfer.id}`;

      const itemsToReceive: Array<{ variantId: number; receivedQty: Prisma.Decimal }> =
        bodyItems === null
          ? transfer.store_transfer_items
              .map((item) => ({
                variantId: item.variant_id ?? NaN,
                receivedQty: item.quantity,
              }))
              .filter((item) => Number.isFinite(item.variantId) && item.receivedQty.gt(0))
          : bodyItems
              .map((item) => {
                const record = asRecord(item);
                return { variantId: Number(record.variantId), receivedQty: toDecimal(record.receivedQty) };
              })
              .filter((item) => Number.isFinite(item.variantId) && item.receivedQty.gte(0));

      if (itemsToReceive.length === 0) {
        throw new Error('No receivable items');
      }

      const transferItemsByVariant = new Map(
        transfer.store_transfer_items
          .filter((item) => item.variant_id !== null && item.variant_id !== undefined)
          .map((item) => [item.variant_id as number, item]),
      );

      for (const item of itemsToReceive) {
        const transferItem = transferItemsByVariant.get(item.variantId);
        if (!transferItem) throw new Error('One or more items do not belong to this transfer');

        const alreadyReceived = new Prisma.Decimal(toDecimalValue(asRecord(transferItem).received_quantity));
        const remaining = transferItem.quantity.sub(alreadyReceived);
        if (remaining.lte(0)) {
          continue;
        }

        const requestQty = item.receivedQty;
        if (requestQty.lt(0)) throw new Error('receivedQty must be >= 0');
        if (requestQty.gt(remaining)) throw new Error(`receivedQty exceeds remaining for variant ${item.variantId}`);

        if (requestQty.eq(0)) continue;
        receivedItems.push({ variantId: item.variantId, receivedQty: requestQty.toString() });

        await tx.store_transfer_items.update({
          where: { id: transferItem.id },
          data: { received_quantity: { increment: requestQty } },
        });

        const inv = await tx.inventories.findFirst({
          where: { store_id: transfer.to_store_id, variant_id: item.variantId },
        });

        if (inv) {
          await tx.inventories.update({
            where: { id: inv.id },
            data: {
              quantity: { increment: requestQty },
              last_update: new Date(),
            },
          });
        } else {
          await tx.inventories.create({
            data: {
              store_id: transfer.to_store_id,
              variant_id: item.variantId,
              quantity: requestQty,
              reserved: new Prisma.Decimal(0),
              last_cost: new Prisma.Decimal(0),
              last_update: new Date(),
            },
          });
        }

        const movement = await tx.stock_movements.create({
          data: {
            store_id: transfer.to_store_id,
            variant_id: item.variantId,
            change: requestQty,
            movement_type: 'transfer_in',
            reference_id: reference,
            reason,
            created_by: createdBy,
          },
        });
        const movementId = asRecord(movement).id;
        if (movementId !== undefined && movementId !== null) {
          stockMovementIds.push(String(movementId));
        }
      }

      const refreshed = await tx.store_transfers.findUnique({
        where: { id: transfer.id },
        include: { store_transfer_items: true },
      });
      if (!refreshed) throw new Error('Transfer not found');

      const isCompleted = refreshed.store_transfer_items.every((item) => {
        const receivedQty = new Prisma.Decimal(toDecimalValue(asRecord(item).received_quantity));
        return receivedQty.gte(item.quantity);
      });

      return tx.store_transfers.update({
        where: { id: transfer.id },
        data: { status: isCompleted ? 'completed' : 'in_transit' },
      });
    });

    return result.then((transfer) => ({ transfer, auditDetails: auditDetails.current }));
  },

  cancelTransfer: ({ id, isAdmin, activeStoreId }: CancelTransferArgs) => {
    const auditDetails: { current: unknown } = { current: null };

    const result = prisma.$transaction(async (tx) => {
      const transfer = await tx.store_transfers.findUnique({
        where: { id },
        include: { store_transfer_items: true },
      });
      if (!transfer) throw new Error('Transfer not found');
      if (!transfer.from_store_id) throw new Error('Transfer missing from_store_id');
      if (transfer.status !== 'pending') throw new Error('Only pending transfers can be cancelled');
      if (!isAdmin && Number(transfer.from_store_id) !== activeStoreId) {
        return { __forbiddenActiveStore: true };
      }

      auditDetails.current = {
        before: transfer,
        items: transfer.store_transfer_items,
        fromStoreId: transfer.from_store_id,
        toStoreId: transfer.to_store_id,
      };

      for (const item of transfer.store_transfer_items) {
        if (!item.variant_id) throw new Error('Transfer item missing variant_id');

        const inv = await tx.inventories.findFirst({
          where: { store_id: transfer.from_store_id, variant_id: item.variant_id },
        });
        if (!inv) throw new Error(`Inventory not found for variant ${item.variant_id}`);

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            reserved: { decrement: item.quantity },
            last_update: new Date(),
          },
        });
      }

      return tx.store_transfers.update({ where: { id: transfer.id }, data: { status: 'cancelled' } });
    });

    return result.then((transfer) => ({ transfer, auditDetails: auditDetails.current }));
  },
};
