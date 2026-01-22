import { Router } from 'express';
import prisma from '../../db/prisma';
import { Prisma } from '../../generated/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { requireActiveStore } from '../../middlewares/storeScope.middleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStore);

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

const generateReturnNumber = (): string => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RTN-${Date.now()}-${rand}`;
};

const getOpenShiftId = async (storeId: number): Promise<number | null> => {
  const open = await prisma.pos_shifts.findFirst({ where: { store_id: storeId, status: 'open' }, orderBy: { opened_at: 'desc' } });
  return open?.id ?? null;
};

/**
 * UC-M7: List invoices for return/refund lookup
 * GET /api/v1/returns/invoices?storeId=1&from=2025-01-01&to=2025-01-31&take=50&skip=0
 */
router.get('/invoices', async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    if (from && Number.isNaN(from.getTime())) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (to && Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid to date' });
    }

    const where: any = {
      store_id: storeId,
      ...(from || to
        ? {
            created_at: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.invoices.findMany({
        where,
        include: { invoice_items: true, customers: true, users: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.invoices.count({ where }),
    ]);

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M7: Invoice lookup for returns
 * GET /api/v1/returns/invoices/:id
 */
router.get('/invoices/:id', async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const invoiceId = Number(req.params.id);
    if (!Number.isFinite(storeId) || !Number.isFinite(invoiceId)) {
      return res.status(400).json({ error: 'Invalid store/invoice id' });
    }

    const invoice = await prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: {
        invoice_items: {
          include: { product_variants: { include: { products: true } } },
        },
        customers: true,
        users: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (Number(invoice.store_id) !== Number(storeId)) {
      return res.status(403).json({ error: 'Invoice does not belong to this store' });
    }

    const invoiceItemIds = invoice.invoice_items.map((it) => it.id);
    const returnedAgg = await prisma.return_items.groupBy({
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
        returnedByInvoiceItemId.set(key, (row._sum.quantity as any) ?? new Prisma.Decimal(0));
      }
    }

    const items = invoice.invoice_items.map((it) => {
      const returned = returnedByInvoiceItemId.get(it.id) ?? new Prisma.Decimal(0);
      const sold = it.quantity ?? new Prisma.Decimal(0);
      const remaining = sold.sub(returned);
      return {
        invoiceItemId: it.id,
        variantId: it.variant_id,
        name: it.product_variants?.products?.name ?? it.product_variants?.name ?? null,
        sku: it.product_variants?.products?.sku ?? it.product_variants?.variant_code ?? null,
        unitPrice: it.unit_price,
        soldQty: sold,
        returnedQty: returned,
        remainingQty: remaining,
      };
    });

    return res.json({ invoice, items });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M7: Create a return (and optionally restock)
 * POST /api/v1/returns
 * Body:
 * {
 *   invoiceId: number,
 *   refundMethod?: 'cash'|'card'|'other',
 *   restock?: boolean,
 *   reason?: string,
 *   note?: string,
 *   items: [{ invoiceItemId: number, quantity: number, reason?: string }]
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const createdByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const createdBy = Number.isFinite(createdByFromToken) ? createdByFromToken : null;
    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '').toLowerCase() : '';

    const invoiceId = Number(req.body?.invoiceId);
    const refundMethod = req.body?.refundMethod ? String(req.body.refundMethod) : null;
    const restock = req.body?.restock !== undefined ? Boolean(req.body.restock) : true;
    const reason = req.body?.reason ? String(req.body.reason) : null;
    const note = req.body?.note ? String(req.body.note) : null;
    const bodyItems = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : null;

    if (!Number.isFinite(storeId) || !Number.isFinite(invoiceId) || !bodyItems || bodyItems.length === 0) {
      return res.status(400).json({ error: 'invoiceId and non-empty items are required' });
    }

    const parsedItems: Array<{ invoiceItemId: number; quantity: Prisma.Decimal; reason: string | null }> = bodyItems
      .map((it: any) => ({
        invoiceItemId: Number(it?.invoiceItemId),
        quantity: toDecimal(it?.quantity),
        reason: it?.reason ? String(it.reason) : null,
      }))
      .filter((it) => Number.isFinite(it.invoiceItemId) && it.quantity.gt(0));

    if (parsedItems.length !== bodyItems.length) {
      return res.status(400).json({ error: 'Invalid items payload' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.findUnique({
        where: { id: invoiceId },
        include: { invoice_items: true, customers: true },
      });
      if (!invoice) throw new Error('Invoice not found');
      if (Number(invoice.store_id) !== Number(storeId)) throw new Error('Invoice does not belong to this store');

      const invoiceItems = await tx.invoice_items.findMany({
        where: { id: { in: parsedItems.map((i) => i.invoiceItemId) } },
      });
      if (invoiceItems.length !== parsedItems.length) throw new Error('One or more invoice items not found');
      if (invoiceItems.some((it) => it.invoice_id !== invoiceId)) throw new Error('All items must belong to the same invoice');

      const invoiceItemIds = invoiceItems.map((it) => it.id);
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
          returnedByInvoiceItemId.set(key, (row._sum.quantity as any) ?? new Prisma.Decimal(0));
        }
      }

      const returnNumber = generateReturnNumber();

      // Validate quantities and compute total refund
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
        const invItem = invoiceItems.find((x) => x.id === reqItem.invoiceItemId)!;
        if (!invItem.variant_id) throw new Error(`Invoice item ${invItem.id} missing variant_id`);

        const soldQty = invItem.quantity ?? new Prisma.Decimal(0);
        const returnedQty = returnedByInvoiceItemId.get(invItem.id) ?? new Prisma.Decimal(0);
        const remaining = soldQty.sub(returnedQty);
        if (remaining.lte(0)) throw new Error(`Invoice item ${invItem.id} already fully returned`);
        if (reqItem.quantity.gt(remaining)) throw new Error(`Return quantity exceeds remaining for invoice item ${invItem.id}`);

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

      // Policy: large refunds require manager/admin
      const approvalThreshold = new Prisma.Decimal(500000);
      if (totalRefund.gt(approvalThreshold)) {
        const allowed = ['admin', 'manager', 'store_manager'];
        if (!allowed.includes(role)) {
          throw new Error('Large refund requires manager/admin approval');
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

      for (const row of itemRows) {
        await tx.return_items.create({
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

        if (restock) {
          const inventory = await tx.inventories.findFirst({ where: { store_id: storeId, variant_id: row.variantId } });
          if (!inventory) throw new Error(`Inventory not found for variant ${row.variantId}`);

          await tx.inventories.update({
            where: { id: inventory.id },
            data: { quantity: { increment: row.quantity }, last_update: new Date() },
          });

          await tx.stock_movements.create({
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
        }
      }

      // Audit log
      await tx.audit_logs.create({
        data: {
          user_id: createdBy ?? undefined,
          action: 'return_create',
          object_type: 'return',
          object_id: String(createdReturn.id),
          payload: {
            storeId,
            invoiceId,
            returnNumber,
            totalRefund: totalRefund.toString(),
            restock,
            refundMethod,
          },
        },
      });

      // Optional cash movement for cash refunds
      if (refundMethod === 'cash' && totalRefund.gt(0)) {
        const shiftId = await getOpenShiftId(storeId);
        await tx.cash_movements.create({
          data: {
            store_id: storeId,
            shift_id: shiftId,
            type: 'cash_out',
            amount: totalRefund,
            reason: `Refund ${returnNumber}`,
            created_by: createdBy,
          },
        });
      }

      const full = await tx.returns.findUnique({
        where: { id: createdReturn.id },
        include: { return_items: true, invoices: true, customers: true, users: true },
      });

      return { return: full, returnNumber, totalRefund, restock };
    });

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M7: List returns
 * GET /api/v1/returns?take=50&skip=0
 */
router.get('/', async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;
    const q = String(req.query.q ?? '').trim();

    const where: Prisma.returnsWhereInput = {
      store_id: storeId,
      ...(q
        ? {
            OR: [
              { return_number: { contains: q, mode: 'insensitive' } },
              { invoices: { is: { invoice_number: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.returns.findMany({
        where,
        include: { invoices: true, customers: true, users: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.returns.count({ where }),
    ]);

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M7: Return details
 * GET /api/v1/returns/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid return id' });
    }

    const item = await prisma.returns.findUnique({
      where: { id },
      include: {
        return_items: { include: { product_variants: { include: { products: true } } } },
        invoices: true,
        customers: true,
        users: true,
      },
    });

    if (!item || Number(item.store_id) !== Number(storeId)) {
      return res.status(404).json({ error: 'Return not found' });
    }

    return res.json({ return: item });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M7: Manager refund (audit-logged)
 * POST /api/v1/returns/refund
 * Body: { storeId, createdBy, items: [{ invoiceItemId, quantity }], reason? }
 */
router.post('/refund', async (req, res, next) => {
  try {
    // Legacy endpoint. Prefer POST /api/v1/returns.
    const { createdBy, items, reason } = req.body ?? {};
    const storeId = Number(req.activeStoreId);
    const createdByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const createdByEffective = Number.isFinite(createdByFromToken)
      ? createdByFromToken
      : createdBy !== undefined && createdBy !== null
        ? Number(createdBy)
        : null;

    if (!createdByEffective || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedItems: Array<{ invoiceItemId: number; quantity: number }> = items
      .map((it: any) => ({ invoiceItemId: Number(it?.invoiceItemId), quantity: Number(it?.quantity) }))
      .filter((it) => Number.isFinite(it.invoiceItemId) && Number.isFinite(it.quantity) && it.quantity > 0);

    if (parsedItems.length !== items.length) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    const refundResult = await prisma.$transaction(async (tx) => {
      const invoiceItems = await tx.invoice_items.findMany({
        where: { id: { in: parsedItems.map((i) => i.invoiceItemId) } },
      });

      if (invoiceItems.length !== parsedItems.length) {
        throw new Error('One or more invoice items not found');
      }

      const invoiceId = invoiceItems[0].invoice_id;
      if (!invoiceId || invoiceItems.some((it) => it.invoice_id !== invoiceId)) {
        throw new Error('Refund items must belong to the same invoice');
      }

      const invoice = await tx.invoices.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (Number(invoice.store_id) !== Number(storeId)) {
        throw new Error('Invoice does not belong to this store');
      }

      const audit = await tx.audit_logs.create({
        data: {
          user_id: Number(createdByEffective),
          action: 'manager_refund',
          object_type: 'invoice',
          object_id: String(invoiceId),
          payload: {
            storeId: Number(storeId),
            reason: reason ? String(reason) : null,
            items: parsedItems,
          },
        },
      });

      let totalRefund = 0;

      for (const reqItem of parsedItems) {
        const invItem = invoiceItems.find((it) => it.id === reqItem.invoiceItemId)!;
        if (!invItem.variant_id) {
          throw new Error(`Invoice item ${invItem.id} missing variant_id`);
        }

        const soldQty = Number(invItem.quantity);
        const refundQty = reqItem.quantity;
        if (refundQty > soldQty) {
          throw new Error(`Refund quantity exceeds sold quantity for invoice item ${invItem.id}`);
        }

        const unitPrice = Number(invItem.unit_price);
        totalRefund += unitPrice * refundQty;

        const inventory = await tx.inventories.findFirst({
          where: { store_id: Number(storeId), variant_id: invItem.variant_id },
        });

        if (!inventory) {
          throw new Error(`Inventory not found for variant ${invItem.variant_id}`);
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
            store_id: Number(storeId),
            variant_id: invItem.variant_id,
            change: refundQty,
            movement_type: 'refund',
            reference_id: `audit:${audit.id.toString()}`,
            reason: reason ? String(reason) : 'Manager refund',
            created_by: Number(createdByEffective),
          },
        });
      }

      return {
        invoiceId,
        totalRefund,
        auditLogId: audit.id.toString(),
      };
    });

    return res.status(201).json({ refund: refundResult });
  } catch (err) {
    next(err);
  }
});

export default router;
