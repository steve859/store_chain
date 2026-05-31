import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

type StandardReturnItem = {
  invoiceItemId: number;
  quantity: Prisma.Decimal;
  reason: string | null;
};

type StandardReturnArgs = {
  storeId: number;
  createdBy: number | null;
  role: string;
  invoiceId: number;
  refundMethod: string | null;
  restock: boolean;
  reason: string | null;
  note: string | null;
  parsedItems: StandardReturnItem[];
  returnNumber: string;
  auditSource: { ip: string | undefined; userAgent: string | null };
};

type ManagerRefundItem = {
  invoiceItemId: number;
  quantity: number;
};

type ManagerRefundArgs = {
  storeId: number;
  createdByEffective: number;
  items: ManagerRefundItem[];
  reason: unknown;
  auditSource: { ip: string | undefined; userAgent: string | null };
};

const toAuditScalar = (value: unknown): Prisma.InputJsonValue | null => {
  if (value === undefined || value === null) return null;
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
};

const safeReturnSnapshot = (row: Record<string, unknown>) => ({
  id: toAuditScalar(row.id),
  return_number: toAuditScalar(row.return_number),
  invoice_id: toAuditScalar(row.invoice_id),
  store_id: toAuditScalar(row.store_id),
  customer_id: toAuditScalar(row.customer_id),
  status: toAuditScalar(row.status),
  total_refund: toAuditScalar(row.total_refund),
  created_by: toAuditScalar(row.created_by),
  created_at: toAuditScalar(row.created_at),
});

const getOpenShiftId = async (storeId: number): Promise<number | null> => {
  const open = await prisma.pos_shifts.findFirst({ where: { store_id: storeId, status: 'open' }, orderBy: { opened_at: 'desc' } });
  return open?.id ?? null;
};

export const ReturnsRepository = {
  listInvoices: ({ where, take, skip }: { where: Prisma.invoicesWhereInput; take: number; skip: number }) =>
    Promise.all([
      prisma.invoices.findMany({
        where,
        include: { invoice_items: true, customers: true, users: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.invoices.count({ where }),
    ]),

  findInvoiceForReturn: (invoiceId: number) =>
    prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: {
        invoice_items: {
          include: { product_variants: { include: { products: true } } },
        },
        customers: true,
        users: true,
      },
    }),

  groupReturnedItems: (invoiceItemIds: number[]) =>
    prisma.return_items.groupBy({
      by: ['invoice_item_id'],
      where: {
        invoice_item_id: { in: invoiceItemIds },
        returns: { is: { status: { not: 'cancelled' } } },
      },
      _sum: { quantity: true },
    }),

  listReturns: ({ where, take, skip }: { where: Prisma.returnsWhereInput; take: number; skip: number }) =>
    Promise.all([
      prisma.returns.findMany({
        where,
        include: { invoices: true, customers: true, users: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.returns.count({ where }),
    ]),

  findReturnDetail: (id: number) =>
    prisma.returns.findUnique({
      where: { id },
      include: {
        return_items: { include: { product_variants: { include: { products: true } } } },
        invoices: true,
        customers: true,
        users: true,
      },
    }),

  createStandardReturn: ({
    storeId,
    createdBy,
    role,
    invoiceId,
    refundMethod,
    restock,
    reason,
    note,
    parsedItems,
    returnNumber,
    auditSource,
  }: StandardReturnArgs) =>
    prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.findUnique({
        where: { id: invoiceId },
        include: { invoice_items: true, customers: true },
      });
      if (!invoice) return { __error: true, status: 404, body: { error: 'Invoice not found' } };
      if (Number(invoice.store_id) !== Number(storeId)) {
        return { __error: true, status: 403, body: { error: 'Invoice does not belong to this store' } };
      }

      const invoiceItems = await tx.invoice_items.findMany({
        where: { id: { in: parsedItems.map((item) => item.invoiceItemId) } },
      });
      if (invoiceItems.length !== parsedItems.length) {
        return { __error: true, status: 404, body: { error: 'One or more invoice items not found' } };
      }
      if (invoiceItems.some((item) => item.invoice_id !== invoiceId)) {
        return { __error: true, status: 400, body: { error: 'All items must belong to the same invoice' } };
      }

      const invoiceItemIds = invoiceItems.map((item) => item.id);
      const returnedAgg = await tx.return_items.groupBy({
        by: ['invoice_item_id'],
        where: {
          invoice_item_id: { in: invoiceItemIds },
          returns: { is: { status: { not: 'cancelled' } } },
        },
        _sum: { quantity: true },
      });
      const returnedByInvoiceItemId = new Map<number, Prisma.Decimal>();
      for (const row of returnedAgg) {
        const key = row.invoice_item_id;
        if (typeof key === 'number') {
          returnedByInvoiceItemId.set(key, row._sum.quantity ?? new Prisma.Decimal(0));
        }
      }

      let totalRefund = new Prisma.Decimal(0);
      const itemRows: Array<{
        invoiceItemId: number;
        variantId: number;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        refundAmount: Prisma.Decimal;
        reason: string | null;
      }> = [];

      for (const reqItem of parsedItems) {
        const invItem = invoiceItems.find((item) => item.id === reqItem.invoiceItemId)!;
        if (!invItem.variant_id) {
          return { __error: true, status: 409, body: { error: `Invoice item ${invItem.id} missing variant_id` } };
        }

        const soldQty = invItem.quantity ?? new Prisma.Decimal(0);
        const returnedQty = returnedByInvoiceItemId.get(invItem.id) ?? new Prisma.Decimal(0);
        const remaining = soldQty.sub(returnedQty);
        if (remaining.lte(0)) {
          return { __error: true, status: 409, body: { error: `Invoice item ${invItem.id} already fully returned` } };
        }
        if (reqItem.quantity.gt(remaining)) {
          return { __error: true, status: 409, body: { error: `Return quantity exceeds remaining for invoice item ${invItem.id}` } };
        }

        const unitPrice = invItem.unit_price ?? new Prisma.Decimal(0);
        const refundAmount = unitPrice.mul(reqItem.quantity);
        totalRefund = totalRefund.add(refundAmount);

        itemRows.push({
          invoiceItemId: invItem.id,
          variantId: invItem.variant_id,
          quantity: reqItem.quantity,
          unitPrice,
          refundAmount,
          reason: reqItem.reason,
        });
      }

      const approvalThreshold = new Prisma.Decimal(500000);
      if (totalRefund.gt(approvalThreshold)) {
        const allowed = ['admin', 'manager', 'store_manager'];
        if (!allowed.includes(role)) {
          return { __error: true, status: 403, body: { error: 'Large refund requires manager/admin approval' } };
        }
      }

      const inventoryByVariantId = new Map<number, { id: number }>();
      if (restock) {
        for (const row of itemRows) {
          const inventory = await tx.inventories.findFirst({ where: { store_id: storeId, variant_id: row.variantId } });
          if (!inventory) {
            return { __error: true, status: 409, body: { error: `Inventory not found for variant ${row.variantId}` } };
          }
          inventoryByVariantId.set(row.variantId, inventory);
        }
      }

      const createdReturn = await tx.returns.create({
        data: {
          return_number: returnNumber,
          invoice_id: invoiceId,
          store_id: storeId,
          customer_id: invoice.customer_id ?? null,
          status: 'completed',
          reason,
          note: note
            ? refundMethod
              ? `${note}\nrefundMethod=${refundMethod}`
              : note
            : refundMethod
              ? `refundMethod=${refundMethod}`
              : null,
          total_refund: totalRefund,
          created_by: createdBy,
        },
      });

      const returnItemIds: Array<number | string> = [];
      const stockMovementIds: string[] = [];
      for (const row of itemRows) {
        const returnItem = await tx.return_items.create({
          data: {
            return_id: createdReturn.id,
            invoice_item_id: row.invoiceItemId,
            variant_id: row.variantId,
            quantity: row.quantity,
            unit_price: row.unitPrice,
            refund_amount: row.refundAmount,
            reason: row.reason,
          },
        });
        if (returnItem?.id !== undefined && returnItem?.id !== null) {
          returnItemIds.push(returnItem.id);
        }

        if (restock) {
          const inventory = inventoryByVariantId.get(row.variantId);
          if (!inventory) {
            return { __error: true, status: 409, body: { error: `Inventory not found for variant ${row.variantId}` } };
          }

          await tx.inventories.update({
            where: { id: inventory.id },
            data: { quantity: { increment: row.quantity }, last_update: new Date() },
          });

          const movement = await tx.stock_movements.create({
            data: {
              store_id: storeId,
              variant_id: row.variantId,
              change: row.quantity,
              movement_type: 'return',
              reference_id: `RTN:${returnNumber}`,
              reason: reason ?? 'Return',
              created_by: createdBy,
            },
          });
          if (movement?.id !== undefined && movement?.id !== null) {
            stockMovementIds.push(movement.id.toString());
          }
        }
      }

      let cashMovementCreated = false;
      let cashMovementId: string | undefined;
      if (refundMethod === 'cash' && totalRefund.gt(0)) {
        const shiftId = await getOpenShiftId(storeId);
        const cashMovement = await tx.cash_movements.create({
          data: {
            store_id: storeId,
            shift_id: shiftId,
            type: 'cash_out',
            amount: totalRefund,
            reason: `Refund ${returnNumber}`,
            created_by: createdBy,
          },
        });
        cashMovementCreated = true;
        if (cashMovement?.id !== undefined && cashMovement?.id !== null) {
          cashMovementId = cashMovement.id.toString();
        }
      }

      await tx.audit_logs.create({
        data: {
          user_id: createdBy ?? undefined,
          action: 'RETURN_CREATED',
          object_type: 'return',
          object_id: String(createdReturn.id),
          payload: {
            result: 'success',
            source: auditSource,
            storeId,
            invoiceId,
            returnId: createdReturn.id,
            returnNumber,
            after: safeReturnSnapshot(createdReturn as Record<string, unknown>),
            metadata: {
              refundMethod,
              restock,
              totalRefund: totalRefund.toString(),
              itemCount: itemRows.length,
              invoiceItemIds: itemRows.map((row) => row.invoiceItemId),
              variantIds: itemRows.map((row) => row.variantId),
              quantities: itemRows.map((row) => row.quantity.toString()),
              returnItemIds,
              stockMovementIds,
              cashMovementCreated,
              cashMovementId,
              reasonPresent: Boolean(reason),
              reasonPreview: reason ? reason.slice(0, 80) : undefined,
              notePresent: Boolean(note),
            },
          },
        },
      });

      const full = await tx.returns.findUnique({
        where: { id: createdReturn.id },
        include: { return_items: true, invoices: true, customers: true, users: true },
      });

      return { return: full, returnNumber, totalRefund, restock };
    }),

  createManagerRefund: ({ storeId, createdByEffective, items, reason, auditSource }: ManagerRefundArgs) =>
    prisma.$transaction(async (tx) => {
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

      if (Number(invoice.store_id) !== Number(storeId)) {
        return { __error: true, status: 403, body: { error: 'Invoice does not belong to this store' } };
      }

      let totalRefund = 0;
      const itemRows: Array<{
        invoiceItemId: number;
        variantId: number;
        refundQty: number;
        unitPrice: number;
        inventory: { id: number };
      }> = [];

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
        const inventory = await tx.inventories.findFirst({
          where: { store_id: Number(storeId), variant_id: invItem.variant_id },
        });

        if (!inventory) {
          return { __error: true, status: 409, body: { error: `Inventory not found for variant ${invItem.variant_id}` } };
        }

        totalRefund += unitPrice * refundQty;
        itemRows.push({
          invoiceItemId: invItem.id,
          variantId: invItem.variant_id,
          refundQty,
          unitPrice,
          inventory,
        });
      }

      const invoiceItemIds = itemRows.map((row) => row.invoiceItemId);
      const variantIds = itemRows.map((row) => row.variantId);
      const quantities = itemRows.map((row) => row.refundQty);
      const stockMovementIds: string[] = [];
      const reasonText = reason ? String(reason) : '';
      const managerRefundAuditPayload = {
        result: 'success',
        source: auditSource,
        storeId: Number(storeId),
        invoiceId,
        metadata: {
          totalRefund,
          itemCount: itemRows.length,
          invoiceItemIds,
          variantIds,
          quantities,
          stockMovementIds,
          reasonPresent: reasonText.length > 0,
          reasonPreview: reasonText ? reasonText.slice(0, 80) : undefined,
        },
      };
      const audit = await tx.audit_logs.create({
        data: {
          user_id: Number(createdByEffective),
          action: 'MANAGER_REFUND_CREATED',
          object_type: 'invoice',
          object_id: String(invoiceId),
          payload: managerRefundAuditPayload,
        },
      });

      for (const row of itemRows) {
        await tx.inventories.update({
          where: { id: row.inventory.id },
          data: {
            quantity: { increment: row.refundQty },
            last_update: new Date(),
          },
        });

        const movement = await tx.stock_movements.create({
          data: {
            store_id: Number(storeId),
            variant_id: row.variantId,
            change: row.refundQty,
            movement_type: 'refund',
            reference_id: `audit:${audit.id.toString()}`,
            reason: reason ? String(reason) : 'Manager refund',
            created_by: Number(createdByEffective),
          },
        });
        if (movement?.id !== undefined && movement?.id !== null) {
          stockMovementIds.push(movement.id.toString());
        }
      }

      await tx.audit_logs.update({
        where: { id: audit.id },
        data: { payload: managerRefundAuditPayload },
      });

      return {
        invoiceId,
        totalRefund,
        auditLogId: audit.id.toString(),
      };
    }),
};
