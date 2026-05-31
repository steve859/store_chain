import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

type ParsedCartItem = {
  variantId: number;
  quantity: number;
};

type CheckoutArgs = {
  storeId: number;
  cashierId: number;
  customerId: unknown;
  paymentMethod: string;
  items: ParsedCartItem[];
  discount: unknown;
  tax: unknown;
};

type HoldArgs = {
  storeId: number;
  cashierId: number;
  customerId: unknown;
  items: ParsedCartItem[];
};

type ResumeArgs = {
  invoiceId: number;
  paymentMethod: string;
  activeStoreId: number;
};

type RefundArgs = {
  storeId: number;
  cashierId: number;
  items: Array<{ invoiceItemId: number; quantity: number }>;
  reason: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getEffectivePriceByVariantId = async (storeId: number, variantIds: number[]) => {
  if (!variantIds.length) return new Map<number, unknown>();
  const now = new Date();
  const rows = await prisma.variant_prices.findMany({
    where: {
      store_id: storeId,
      variant_id: { in: variantIds },
      start_at: { lte: now },
      OR: [{ end_at: null }, { end_at: { gt: now } }],
    },
    orderBy: { start_at: 'desc' },
    distinct: ['variant_id'],
  });
  return new Map<number, unknown>(rows.map((row) => [row.variant_id, row.price]));
};

export const PosRepository = {
  getOpenShift: (storeId: number) =>
    prisma.pos_shifts.findFirst({
      where: { store_id: storeId, status: 'open' },
      orderBy: { opened_at: 'desc' },
      include: { opened_user: true, closed_user: true },
    }),

  aggregateInvoices: (args: Parameters<typeof prisma.invoices.aggregate>[0]) => prisma.invoices.aggregate(args),

  aggregateCashMovements: (args: Parameters<typeof prisma.cash_movements.aggregate>[0]) => prisma.cash_movements.aggregate(args),

  createShift: (data: Parameters<typeof prisma.pos_shifts.create>[0]['data']) => prisma.pos_shifts.create({ data }),

  updateShift: (id: number, data: Parameters<typeof prisma.pos_shifts.update>[0]['data']) =>
    prisma.pos_shifts.update({ where: { id }, data }),

  findShiftById: (id: number) => prisma.pos_shifts.findUnique({ where: { id } }),

  createCashMovement: (data: Parameters<typeof prisma.cash_movements.create>[0]['data']) => prisma.cash_movements.create({ data }),

  findCashMovementsByShift: (storeId: number, shiftId: number) =>
    prisma.cash_movements.findMany({
      where: { store_id: storeId, shift_id: shiftId },
      orderBy: { created_at: 'desc' },
      take: 200,
    }),

  findVariantByBarcode: (barcode: string) => prisma.product_variants.findFirst({ where: { barcode }, include: { products: true } }),

  findVariantById: (variantId: number) => prisma.product_variants.findUnique({ where: { id: variantId }, include: { products: true } }),

  findInventoryByStoreAndVariant: (storeId: number, variantId: number) =>
    prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variantId },
    }),

  findReceiptInvoice: (invoiceId: number) =>
    prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: {
        invoice_items: {
          include: {
            product_variants: {
              include: { products: true },
            },
          },
        },
        stores: true,
        users: true,
        customers: true,
      },
    }),

  checkout: ({ storeId, cashierId, customerId, paymentMethod, items, discount, tax }: CheckoutArgs) =>
    prisma.$transaction(async (tx) => {
      const variants = await tx.product_variants.findMany({
        where: { id: { in: items.map((item) => item.variantId) } },
      });

      if (variants.length !== items.length) {
        throw new Error('One or more variants not found');
      }

      const inventoryRows = await tx.inventories.findMany({
        where: {
          store_id: storeId,
          variant_id: { in: items.map((item) => item.variantId) },
        },
      });

      for (const item of items) {
        const inv = inventoryRows.find((row) => row.variant_id === item.variantId);
        if (!inv || inv.quantity === null) {
          throw new Error(`Inventory not found for variant ${item.variantId}`);
        }
        const available = Number(inv.quantity) - Number(inv.reserved ?? 0);
        if (available < item.quantity) {
          throw new Error(`Insufficient stock for variant ${item.variantId}`);
        }
      }

      const variantIds = items.map((item) => item.variantId);
      const storePriceByVariantId = await getEffectivePriceByVariantId(storeId, variantIds);

      const unitPriceByVariantId = new Map<number, unknown>();
      for (const variant of variants) {
        unitPriceByVariantId.set(variant.id, storePriceByVariantId.get(variant.id) ?? variant.price);
      }

      const subtotal = items.reduce((sum, item) => {
        const unitPrice = unitPriceByVariantId.get(item.variantId);
        return sum + Number(unitPrice ?? 0) * item.quantity;
      }, 0);

      const discountNum = discount !== undefined && discount !== null ? Number(discount) : 0;
      const taxNum = tax !== undefined && tax !== null ? Number(tax) : 0;
      const total = subtotal + taxNum - discountNum;

      const createdInvoice = await tx.invoices.create({
        data: {
          store_id: storeId,
          customer_id: customerId ? Number(customerId) : null,
          created_by: Number(cashierId),
          payment_method: String(paymentMethod),
          subtotal,
          discount: discountNum,
          tax: taxNum,
          total,
        },
      });

      for (const item of items) {
        const variant = variants.find((row) => row.id === item.variantId)!;
        const inv = inventoryRows.find((row) => row.variant_id === item.variantId)!;
        const unitPrice = unitPriceByVariantId.get(item.variantId) ?? variant.price;

        await tx.invoice_items.create({
          data: {
            invoice_id: createdInvoice.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: unitPrice as Prisma.Decimal,
            unit_cost: inv.last_cost,
          },
        });

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            quantity: { decrement: item.quantity },
            last_update: new Date(),
          },
        });

        await tx.stock_movements.create({
          data: {
            store_id: storeId,
            variant_id: item.variantId,
            change: -item.quantity,
            movement_type: 'sale',
            reference_id: String(createdInvoice.id),
            reason: 'POS checkout',
            created_by: Number(cashierId),
          },
        });
      }

      return tx.invoices.findUnique({
        where: { id: createdInvoice.id },
        include: { invoice_items: true },
      });
    }),

  hold: ({ storeId, cashierId, customerId, items }: HoldArgs) =>
    prisma.$transaction(async (tx) => {
      const variants = await tx.product_variants.findMany({
        where: { id: { in: items.map((item) => item.variantId) } },
      });

      if (variants.length !== items.length) {
        throw new Error('One or more variants not found');
      }

      const inventoryRows = await tx.inventories.findMany({
        where: {
          store_id: storeId,
          variant_id: { in: items.map((item) => item.variantId) },
        },
      });

      for (const item of items) {
        const inv = inventoryRows.find((row) => row.variant_id === item.variantId);
        if (!inv || inv.quantity === null) {
          throw new Error(`Inventory not found for variant ${item.variantId}`);
        }
        const available = Number(inv.quantity) - Number(inv.reserved ?? 0);
        if (available < item.quantity) {
          throw new Error(`Insufficient stock for variant ${item.variantId}`);
        }
      }

      const variantIds = items.map((item) => item.variantId);
      const storePriceByVariantId = await getEffectivePriceByVariantId(storeId, variantIds);
      const unitPriceByVariantId = new Map<number, unknown>();
      for (const variant of variants) {
        unitPriceByVariantId.set(variant.id, storePriceByVariantId.get(variant.id) ?? variant.price);
      }

      const subtotal = items.reduce((sum, item) => {
        const unitPrice = unitPriceByVariantId.get(item.variantId);
        return sum + Number(unitPrice ?? 0) * item.quantity;
      }, 0);

      const createdInvoice = await tx.invoices.create({
        data: {
          store_id: storeId,
          customer_id: customerId ? Number(customerId) : null,
          created_by: Number(cashierId),
          payment_method: null,
          subtotal,
          discount: 0,
          tax: 0,
          total: subtotal,
        },
      });

      for (const item of items) {
        const variant = variants.find((row) => row.id === item.variantId)!;
        const inv = inventoryRows.find((row) => row.variant_id === item.variantId)!;
        const unitPrice = unitPriceByVariantId.get(item.variantId) ?? variant.price;

        await tx.invoice_items.create({
          data: {
            invoice_id: createdInvoice.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: unitPrice as Prisma.Decimal,
            unit_cost: inv.last_cost,
          },
        });

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            reserved: { increment: item.quantity },
            last_update: new Date(),
          },
        });
      }

      return tx.invoices.findUnique({
        where: { id: createdInvoice.id },
        include: { invoice_items: true },
      });
    }),

  resumeCheckout: ({ invoiceId, paymentMethod, activeStoreId }: ResumeArgs) =>
    prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.findUnique({
        where: { id: invoiceId },
        include: { invoice_items: true },
      });

      if (!invoice) {
        return null;
      }

      if (Number(invoice.store_id) !== activeStoreId) {
        return { __forbiddenActiveStore: true };
      }

      if (invoice.payment_method) {
        throw new Error('Invoice is already paid/checked out');
      }

      const storeId = invoice.store_id;
      const cashierId = invoice.created_by;

      if (!storeId || !cashierId) {
        throw new Error('Held invoice missing store/cashier');
      }

      const variantIds = invoice.invoice_items.map((item) => item.variant_id).filter((variantId): variantId is number => typeof variantId === 'number');
      const inventoryRows = await tx.inventories.findMany({
        where: { store_id: storeId, variant_id: { in: variantIds } },
      });

      for (const item of invoice.invoice_items) {
        if (!item.variant_id) continue;
        const inv = inventoryRows.find((row) => row.variant_id === item.variant_id);
        if (!inv || inv.quantity === null) {
          throw new Error(`Inventory not found for variant ${item.variant_id}`);
        }
        const qty = Number(item.quantity);
        const available = Number(inv.quantity) - (Number(inv.reserved ?? 0) - qty);
        if (available < qty) {
          throw new Error(`Insufficient stock for variant ${item.variant_id}`);
        }
      }

      for (const item of invoice.invoice_items) {
        if (!item.variant_id) continue;
        const inv = inventoryRows.find((row) => row.variant_id === item.variant_id)!;
        const qty = Number(item.quantity);

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            reserved: { decrement: qty },
            quantity: { decrement: qty },
            last_update: new Date(),
          },
        });

        await tx.stock_movements.create({
          data: {
            store_id: storeId,
            variant_id: item.variant_id,
            change: -qty,
            movement_type: 'sale',
            reference_id: String(invoice.id),
            reason: 'POS resume checkout',
            created_by: cashierId,
          },
        });
      }

      await tx.invoices.update({
        where: { id: invoiceId },
        data: { payment_method: String(paymentMethod) },
      });

      return tx.invoices.findUnique({
        where: { id: invoiceId },
        include: { invoice_items: true },
      });
    }),

  refund: ({ storeId, cashierId, items, reason }: RefundArgs) => {
    const auditDetails: { current: unknown } = { current: null };

    const result = prisma.$transaction(async (tx) => {
      const invoiceItems = await tx.invoice_items.findMany({
        where: { id: { in: items.map((item) => item.invoiceItemId) } },
      });

      if (invoiceItems.length !== items.length) {
        return { __error: true, status: 404, body: { error: 'One or more invoice items not found' } };
      }

      const invoiceId = invoiceItems[0].invoice_id;
      if (!invoiceId || invoiceItems.some((item) => item.invoice_id !== invoiceId)) {
        return { __error: true, status: 400, body: { error: 'Refund items must belong to the same invoice' } };
      }

      const invoice = await tx.invoices.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        return { __error: true, status: 404, body: { error: 'Invoice not found' } };
      }

      if (Number(invoice.store_id) !== storeId) {
        return { __error: true, status: 403, body: { error: 'Invoice does not belong to this store' } };
      }

      let totalRefund = 0;

      for (const reqItem of items) {
        const invItem = invoiceItems.find((item) => item.id === reqItem.invoiceItemId)!;
        if (!invItem.variant_id) {
          return { __error: true, status: 409, body: { error: `Invoice item ${invItem.id} missing variant_id` } };
        }

        const soldQty = Number(invItem.quantity);
        const refundQty = reqItem.quantity;
        if (refundQty > soldQty) {
          return { __error: true, status: 409, body: { error: `Refund quantity exceeds sold quantity for invoice item ${invItem.id}` } };
        }

        const unitPrice = Number(invItem.unit_price);
        totalRefund += unitPrice * refundQty;

        const inventory = await tx.inventories.findFirst({
          where: { store_id: storeId, variant_id: invItem.variant_id },
        });

        if (!inventory) {
          return { __error: true, status: 409, body: { error: `Inventory not found for variant ${invItem.variant_id}` } };
        }

        await tx.inventories.update({
          where: { id: inventory.id },
          data: {
            quantity: { increment: refundQty },
            last_update: new Date(),
          },
        });

        await tx.stock_movements.create({
          data: {
            store_id: storeId,
            variant_id: invItem.variant_id,
            change: refundQty,
            movement_type: 'refund',
            reference_id: String(invoiceId),
            reason: reason ? String(reason) : 'POS partial refund',
            created_by: Number(cashierId),
          },
        });
      }

      auditDetails.current = {
        invoiceId,
        itemIds: items.map((item) => item.invoiceItemId),
        variantIds: invoiceItems.map((item) => item.variant_id).filter((variantId): variantId is number => typeof variantId === 'number'),
        quantities: items.map((item) => item.quantity),
        itemCount: items.length,
      };

      return {
        invoiceId,
        totalRefund,
      };
    });

    return result.then((refund) => ({ refund, auditDetails: auditDetails.current }));
  },

  asRecord,
};
