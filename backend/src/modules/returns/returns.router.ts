import { Router } from 'express';
import prisma from '../../db/prisma';

const router = Router();

/**
 * UC-M7: List invoices for return/refund lookup
 * GET /api/v1/returns/invoices?storeId=1&from=2025-01-01&to=2025-01-31&take=50&skip=0
 */
router.get('/invoices', async (req, res, next) => {
  try {
    const storeId = req.query.storeId ? Number(req.query.storeId) : NaN;
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'storeId is required' });
    }
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
 * UC-M7: Manager refund (audit-logged)
 * POST /api/v1/returns/refund
 * Body: { storeId, createdBy, items: [{ invoiceItemId, quantity }], reason? }
 */
router.post('/refund', async (req, res, next) => {
  try {
    const { storeId, createdBy, items, reason } = req.body ?? {};

    if (!storeId || !createdBy || !Array.isArray(items) || items.length === 0) {
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
          user_id: Number(createdBy),
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
            created_by: Number(createdBy),
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
