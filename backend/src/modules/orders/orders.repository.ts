import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

type OrderListArgs = {
  where: Prisma.purchase_ordersWhereInput;
  take: number;
  skip: number;
};

type ParsedOrderItem = {
  variantId: number;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
};

type CreateOrderArgs = {
  storeId: number;
  supplierId: number | null;
  createdBy: number | null;
  orderNumber: string;
  items: ParsedOrderItem[];
};

type DeleteOrderArgs = {
  id: number;
  isAdmin: boolean;
  activeStoreId: number;
};

type ReceiveItem = {
  variantId: number;
  receivedQty: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  lotCode: string | null;
  expiryDate: Date | null;
};

type ReceiveOrderArgs = {
  id: number;
  isAdmin: boolean;
  activeStoreId: number;
  createdBy: number | null;
  referenceId: string | null;
  supplierInvoice: string | null;
  note: string | null;
  reason: string;
  bodyItems: unknown[] | null;
  parseItems: (purchaseItems: Array<Record<string, unknown>>) => ReceiveItem[];
  generateReceiptNumber: () => string;
};

export const OrdersRepository = {
  listOrders: ({ where, take, skip }: OrderListArgs) =>
    Promise.all([
      prisma.purchase_orders.findMany({
        where,
        include: { purchase_items: true, suppliers: true, stores: true, users: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.purchase_orders.count({ where }),
    ]),

  findOrderDetail: (id: number) =>
    prisma.purchase_orders.findUnique({
      where: { id },
      include: {
        suppliers: true,
        stores: true,
        users: true,
        purchase_items: { include: { product_variants: { include: { products: true } } } },
        purchase_order_receipts: {
          include: {
            purchase_order_receipt_items: {
              include: { product_variants: { include: { products: true } } },
            },
          },
          orderBy: { received_at: 'desc' },
        },
      },
    }),

  findOrderById: (id: number) => prisma.purchase_orders.findUnique({ where: { id } }),

  updateOrderStatus: (id: number, status: string) =>
    prisma.purchase_orders.update({ where: { id }, data: { status } }),

  deleteDraftOrder: ({ id, isAdmin, activeStoreId }: DeleteOrderArgs) =>
    prisma.$transaction(async (tx) => {
      const po = await tx.purchase_orders.findUnique({ where: { id }, include: { purchase_items: true } });
      if (!po) {
        return null;
      }
      if (po.status !== 'draft') {
        throw new Error('Only draft orders can be deleted');
      }
      if (!isAdmin && Number(po.store_id) !== activeStoreId) {
        return { __forbiddenActiveStore: true };
      }

      await tx.purchase_items.deleteMany({ where: { purchase_order_id: id } });
      return tx.purchase_orders.delete({ where: { id } });
    }),

  createOrder: ({ storeId, supplierId, createdBy, orderNumber, items }: CreateOrderArgs) =>
    prisma.$transaction(async (tx) => {
      const store = await tx.stores.findUnique({ where: { id: storeId } });
      if (!store) throw new Error('Store not found');

      if (supplierId !== null) {
        const supplier = await tx.suppliers.findUnique({ where: { id: supplierId } });
        if (!supplier) throw new Error('Supplier not found');
      }

      const variantIds = items.map((item) => item.variantId);
      const variants = await tx.product_variants.findMany({ where: { id: { in: variantIds } } });
      if (variants.length !== variantIds.length) {
        throw new Error('One or more variants not found');
      }

      const po = await tx.purchase_orders.create({
        data: {
          store_id: storeId,
          supplier_id: supplierId,
          created_by: createdBy,
          order_number: orderNumber,
          status: 'draft',
          total_amount: new Prisma.Decimal(0),
        },
      });

      for (const item of items) {
        await tx.purchase_items.create({
          data: {
            purchase_order_id: po.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          },
        });
      }

      const totalAmount = items.reduce(
        (sum, item) => sum.add(item.quantity.mul(item.unitCost)),
        new Prisma.Decimal(0),
      );

      const updated = await tx.purchase_orders.update({
        where: { id: po.id },
        data: { total_amount: totalAmount },
      });

      return tx.purchase_orders.findUnique({
        where: { id: updated.id },
        include: { purchase_items: true, suppliers: true, stores: true, users: true },
      });
    }),

  receiveOrder: ({
    id,
    isAdmin,
    activeStoreId,
    createdBy,
    referenceId,
    supplierInvoice,
    note,
    reason,
    bodyItems,
    parseItems,
    generateReceiptNumber,
  }: ReceiveOrderArgs) =>
    prisma.$transaction(async (tx) => {
      const po = await tx.purchase_orders.findUnique({
        where: { id },
        include: { purchase_items: true },
      });
      if (!po) throw new Error('Order not found');
      if (!po.store_id) throw new Error('Order missing store_id');
      if (!isAdmin && Number.isFinite(activeStoreId) && Number(po.store_id) !== activeStoreId) {
        throw new Error('Forbidden: order does not belong to active store');
      }
      if (!po.status || !['approved', 'submitted', 'draft'].includes(po.status)) {
        throw new Error('Order is not receivable in current status');
      }

      if (referenceId) {
        const existingReceipt = await tx.purchase_order_receipts.findUnique({ where: { receipt_number: referenceId } });
        if (existingReceipt) {
          if (existingReceipt.purchase_order_id !== po.id) {
            throw new Error('referenceId already used for a different purchase order');
          }
          const existingOrder = await tx.purchase_orders.findUnique({
            where: { id: po.id },
            include: { purchase_items: true, suppliers: true, stores: true, users: true, purchase_order_receipts: true },
          });
          return { order: existingOrder, receipt: existingReceipt };
        }
      }

      const receiptNumber = referenceId ?? generateReceiptNumber();
      const movementReference = `GRN:${receiptNumber}`;
      const itemsToReceive = parseItems(po.purchase_items as unknown as Array<Record<string, unknown>>);

      if (itemsToReceive.length === 0) {
        throw new Error('No receivable items');
      }

      const poVariantIds = new Set(po.purchase_items.map((item) => item.variant_id).filter((variantId): variantId is number => typeof variantId === 'number'));
      for (const item of itemsToReceive) {
        if (!poVariantIds.has(item.variantId)) {
          throw new Error('One or more items do not belong to this purchase order');
        }
      }

      const purchaseItemByVariantId = new Map<number, typeof po.purchase_items[number]>();
      for (const item of po.purchase_items) {
        if (typeof item.variant_id === 'number') {
          purchaseItemByVariantId.set(item.variant_id, item);
        }
      }

      for (const item of itemsToReceive) {
        const poItem = purchaseItemByVariantId.get(item.variantId);
        if (!poItem) throw new Error('One or more items do not belong to this purchase order');
        const alreadyReceived = poItem.received_quantity ?? new Prisma.Decimal(0);
        const remaining = poItem.quantity.sub(alreadyReceived);
        if (remaining.lte(0)) {
          throw new Error(`Variant ${item.variantId} already fully received`);
        }
        if (item.receivedQty.gt(remaining)) {
          throw new Error(`Received quantity exceeds remaining for variant ${item.variantId}`);
        }
      }

      const receipt = await tx.purchase_order_receipts.create({
        data: {
          purchase_order_id: po.id,
          supplier_id: po.supplier_id ?? null,
          store_id: po.store_id,
          receipt_number: receiptNumber,
          supplier_invoice: supplierInvoice,
          status: 'received',
          received_at: new Date(),
          note,
          total_cost: new Prisma.Decimal(0),
          created_by: createdBy,
        },
      });

      if (bodyItems !== null) {
        for (const item of itemsToReceive) {
          const original = bodyItems.find((bodyItem) => {
            const record = bodyItem && typeof bodyItem === 'object' ? (bodyItem as Record<string, unknown>) : {};
            return Number(record.variantId) === item.variantId;
          });
          const originalRecord = original && typeof original === 'object' ? (original as Record<string, unknown>) : {};
          if (original && originalRecord.unitCost !== undefined && originalRecord.unitCost !== null) {
            await tx.purchase_items.updateMany({
              where: { purchase_order_id: po.id, variant_id: item.variantId },
              data: { unit_cost: item.unitCost },
            });
          }
        }
      }

      let receiptTotal = new Prisma.Decimal(0);

      for (const item of itemsToReceive) {
        const poItem = purchaseItemByVariantId.get(item.variantId)!;

        const inventory = await tx.inventories.findFirst({
          where: { store_id: po.store_id, variant_id: item.variantId },
        });

        if (inventory) {
          await tx.inventories.update({
            where: { id: inventory.id },
            data: {
              quantity: { increment: item.receivedQty },
              last_cost: item.unitCost,
              last_update: new Date(),
            },
          });
        } else {
          await tx.inventories.create({
            data: {
              store_id: po.store_id,
              variant_id: item.variantId,
              quantity: item.receivedQty,
              reserved: new Prisma.Decimal(0),
              last_cost: item.unitCost,
              last_update: new Date(),
            },
          });
        }

        await tx.purchase_items.update({
          where: { id: poItem.id },
          data: {
            received_quantity: { increment: item.receivedQty },
          },
        });

        const lineTotal = item.receivedQty.mul(item.unitCost);
        receiptTotal = receiptTotal.add(lineTotal);

        await tx.purchase_order_receipt_items.create({
          data: {
            receipt_id: receipt.id,
            variant_id: item.variantId,
            purchase_item_id: poItem.id,
            quantity_received: item.receivedQty,
            unit_cost: item.unitCost,
            line_total: lineTotal,
            lot_code: item.lotCode,
            expiry_date: item.expiryDate,
          },
        });

        await tx.stock_lots.create({
          data: {
            store_id: po.store_id,
            variant_id: item.variantId,
            lot_code: item.lotCode,
            quantity: item.receivedQty,
            quantity_remaining: item.receivedQty,
            cost: item.unitCost,
            expiry_date: item.expiryDate,
          },
        });

        await tx.stock_movements.create({
          data: {
            store_id: po.store_id,
            variant_id: item.variantId,
            change: item.receivedQty,
            movement_type: 'receive',
            reference_id: movementReference,
            reason,
            created_by: createdBy,
          },
        });
      }

      await tx.purchase_order_receipts.update({
        where: { id: receipt.id },
        data: { total_cost: receiptTotal },
      });

      const refreshed = await tx.purchase_orders.findUnique({
        where: { id: po.id },
        include: { purchase_items: true, suppliers: true, stores: true, users: true },
      });
      if (!refreshed) throw new Error('Order not found');

      const totalAmount = refreshed.purchase_items.reduce((sum, item) => sum.add(item.quantity.mul(item.unit_cost)), new Prisma.Decimal(0));
      const isFullyReceived = refreshed.purchase_items.every((item) => {
        const receivedQty = item.received_quantity ?? new Prisma.Decimal(0);
        return receivedQty.gte(item.quantity);
      });

      const updatedOrder = await tx.purchase_orders.update({
        where: { id: po.id },
        data: {
          total_amount: totalAmount,
          status: isFullyReceived ? 'received' : (po.status ?? 'submitted'),
        },
        include: { purchase_items: true, suppliers: true, stores: true, users: true },
      });

      return { order: updatedOrder, receipt };
    }),
};
