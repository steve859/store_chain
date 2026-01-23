import { Router } from 'express';
import { Prisma } from '@prisma/client'
import prisma from '../../db/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { requireActiveStore, requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';
import { invalidateCatalogCache } from '../../lib/cache/catalog';

const router = Router();

router.use(authenticateToken);

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

/**
 * UC-M3: Purchase order list
 * GET /api/v1/orders?storeId=1&status=draft&take=50&skip=0&q=po-2026
 */
router.get('/', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const storeId = req.activeStoreId ?? undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const q = String(req.query.q ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const where: Prisma.purchase_ordersWhereInput = {
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
    };

    const [items, total] = await Promise.all([
      prisma.purchase_orders.findMany({
        where,
        include: { purchase_items: true, suppliers: true, stores: true, users: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.purchase_orders.count({ where }),
    ]);

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M3: Delete draft purchase order
 * DELETE /api/v1/orders/:id
 */
router.delete('/:id', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const po = await tx.purchase_orders.findUnique({ where: { id }, include: { purchase_items: true } });
      if (!po) {
        return null;
      }
      if (po.status !== 'draft') {
        throw new Error('Only draft orders can be deleted');
      }

      await tx.purchase_items.deleteMany({ where: { purchase_order_id: id } });
      return tx.purchase_orders.delete({ where: { id } });
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ order: deleted });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M3: Purchase order details
 * GET /api/v1/orders/:id
 */
router.get('/:id', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const order = await prisma.purchase_orders.findUnique({
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
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ order });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M3: Create purchase order
 * POST /api/v1/orders
 * Body:
 * {
 *   storeId: number,
 *   supplierId?: number,
 *   createdBy?: number,
 *   orderNumber?: string,
 *   items: Array<{ variantId: number, quantity: number, unitCost: number }>
 * }
 */
router.post('/', requireActiveStore, async (req, res, next) => {
  try {
    const { supplierId, createdBy, orderNumber, items } = req.body ?? {};
    const storeIdNum = Number(req.activeStoreId);
    const supplierIdNum = supplierId !== undefined && supplierId !== null ? Number(supplierId) : null;
    const createdByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const createdByNum = Number.isFinite(createdByFromToken)
      ? createdByFromToken
      : createdBy !== undefined && createdBy !== null
        ? Number(createdBy)
        : null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid items' });
    }
    if (supplierIdNum !== null && !Number.isFinite(supplierIdNum)) {
      return res.status(400).json({ error: 'Invalid supplierId' });
    }
    if (createdByNum !== null && !Number.isFinite(createdByNum)) {
      return res.status(400).json({ error: 'Invalid createdBy' });
    }

    const parsedItems: Array<{ variantId: number; quantity: Prisma.Decimal; unitCost: Prisma.Decimal }> = items
      .map((it: any) => ({
        variantId: Number(it?.variantId),
        quantity: toDecimal(it?.quantity),
        unitCost: toDecimal(it?.unitCost),
      }))
      .filter((it) => Number.isFinite(it.variantId) && it.quantity.gt(0) && it.unitCost.gte(0));

    if (parsedItems.length !== items.length) {
      return res.status(400).json({ error: 'Invalid items payload' });
    }

    const created = await prisma.$transaction(async (tx) => {
      const store = await tx.stores.findUnique({ where: { id: storeIdNum } });
      if (!store) throw new Error('Store not found');

      if (supplierIdNum !== null) {
        const supplier = await tx.suppliers.findUnique({ where: { id: supplierIdNum } });
        if (!supplier) throw new Error('Supplier not found');
      }

      // Validate variants exist
      const variantIds = parsedItems.map((i) => i.variantId);
      const variants = await tx.product_variants.findMany({ where: { id: { in: variantIds } } });
      if (variants.length !== variantIds.length) {
        throw new Error('One or more variants not found');
      }

      const po = await tx.purchase_orders.create({
        data: {
          store_id: storeIdNum,
          supplier_id: supplierIdNum,
          created_by: createdByNum,
          order_number: orderNumber ? String(orderNumber) : generateOrderNumber(),
          status: 'draft',
          total_amount: new Prisma.Decimal(0),
        },
      });

      for (const item of parsedItems) {
        await tx.purchase_items.create({
          data: {
            purchase_order_id: po.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          },
        });
      }

      const totalAmount = parsedItems.reduce(
        (sum, it) => sum.add(it.quantity.mul(it.unitCost)),
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
    });

    return res.status(201).json({ order: created });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M3: Update purchase order status
 * POST /api/v1/orders/:id/status
 * Body: { status: 'draft'|'submitted'|'approved'|'cancelled'|'received', updatedBy?: number }
 */
router.post('/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status ?? '').trim();
    if (!Number.isFinite(id) || !status) {
      return res.status(400).json({ error: 'Invalid id/status' });
    }

    const allowed = new Set(['draft', 'submitted', 'approved', 'cancelled', 'received']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: 'Unsupported status' });
    }

    const updated = await prisma.purchase_orders.update({ where: { id }, data: { status } });
    return res.json({ order: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M3: Receive purchase order into inventory
 * POST /api/v1/orders/:id/receive
 * Body: {
 *   referenceId?: string,
 *   supplierInvoice?: string,
 *   note?: string,
 *   reason?: string,
 *   items?: Array<{ variantId: number, receivedQty: number, unitCost?: number, lotCode?: string, expiryDate?: string }>
 * }
 */
router.post('/:id/receive', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);

    const createdByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const createdBy = Number.isFinite(createdByFromToken) ? createdByFromToken : null;

    const referenceId = req.body?.referenceId ? String(req.body.referenceId) : null;
    const supplierInvoice = req.body?.supplierInvoice ? String(req.body.supplierInvoice) : null;
    const note = req.body?.note ? String(req.body.note) : null;
    const reason = req.body?.reason ? String(req.body.reason) : 'Receive purchase order';
    const bodyItems = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : null;

    if (bodyItems !== null && bodyItems.length === 0) {
      return res.status(400).json({ error: 'items must be non-empty when provided' });
    }

    const result = await prisma.$transaction(async (tx) => {
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

      // Idempotency: if referenceId is provided and already used as receipt_number, return existing receipt.
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

      const itemsToReceive: Array<{
        variantId: number;
        receivedQty: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        lotCode: string | null;
        expiryDate: Date | null;
      }> =
        bodyItems === null
          ? po.purchase_items
              .map((it) => ({
                variantId: it.variant_id ?? NaN,
                receivedQty: it.quantity,
                unitCost: it.unit_cost,
                lotCode: null,
                expiryDate: null,
              }))
              .filter((it) => Number.isFinite(it.variantId) && it.receivedQty.gt(0))
          : bodyItems
              .map((it: any) => {
                const variantId = Number(it?.variantId);
                const receivedQty = toDecimal(it?.receivedQty);
                const unitCost = it?.unitCost !== undefined && it?.unitCost !== null ? toDecimal(it?.unitCost) : null;
                const lotCode = it?.lotCode !== undefined && it?.lotCode !== null && String(it.lotCode).trim() !== '' ? String(it.lotCode) : null;
                const expiryDateRaw = it?.expiryDate !== undefined && it?.expiryDate !== null && String(it.expiryDate).trim() !== '' ? new Date(String(it.expiryDate)) : null;
                const expiryDate = expiryDateRaw && Number.isNaN(expiryDateRaw.getTime()) ? null : expiryDateRaw;
                return {
                  variantId,
                  receivedQty,
                  unitCost: unitCost ?? new Prisma.Decimal(0),
                  lotCode,
                  expiryDate,
                };
              })
              .filter((it) => Number.isFinite(it.variantId) && it.receivedQty.gt(0));

      if (itemsToReceive.length === 0) {
        throw new Error('No receivable items');
      }

      // Validate that all provided items belong to this PO
      const poVariantIds = new Set(po.purchase_items.map((i) => i.variant_id).filter((x): x is number => typeof x === 'number'));
      for (const it of itemsToReceive) {
        if (!poVariantIds.has(it.variantId)) {
          throw new Error('One or more items do not belong to this purchase order');
        }
      }

      // Validate remaining quantity and compute purchase_item_id mapping
      const purchaseItemByVariantId = new Map<number, typeof po.purchase_items[number]>();
      for (const item of po.purchase_items) {
        if (typeof item.variant_id === 'number') {
          purchaseItemByVariantId.set(item.variant_id, item);
        }
      }

      for (const it of itemsToReceive) {
        const poItem = purchaseItemByVariantId.get(it.variantId);
        if (!poItem) throw new Error('One or more items do not belong to this purchase order');
        const alreadyReceived = poItem.received_quantity ?? new Prisma.Decimal(0);
        const remaining = poItem.quantity.sub(alreadyReceived);
        if (remaining.lte(0)) {
          throw new Error(`Variant ${it.variantId} already fully received`);
        }
        if (it.receivedQty.gt(remaining)) {
          throw new Error(`Received quantity exceeds remaining for variant ${it.variantId}`);
        }
      }

      // Create GRN receipt
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

      // Optionally update unit cost before receiving
      if (bodyItems !== null) {
        for (const it of itemsToReceive) {
          // Only update cost if the caller provided it (we treat 0 as valid, so check original body)
          const original = (bodyItems as any[]).find((x) => Number(x?.variantId) === it.variantId);
          if (original && original.unitCost !== undefined && original.unitCost !== null) {
            await tx.purchase_items.updateMany({
              where: { purchase_order_id: po.id, variant_id: it.variantId },
              data: { unit_cost: it.unitCost },
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

        // Update PO item received quantity
        await tx.purchase_items.update({
          where: { id: poItem.id },
          data: {
            received_quantity: { increment: item.receivedQty },
          },
        });

        // Create receipt item
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

        // Create stock lot
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

      // Recompute order totals after any unit-cost updates
      const refreshed = await tx.purchase_orders.findUnique({
        where: { id: po.id },
        include: { purchase_items: true, suppliers: true, stores: true, users: true },
      });
      if (!refreshed) throw new Error('Order not found');

      const totalAmount = refreshed.purchase_items.reduce((sum, it) => sum.add(it.quantity.mul(it.unit_cost)), new Prisma.Decimal(0));
      const isFullyReceived = refreshed.purchase_items.every((it) => {
        const receivedQty = it.received_quantity ?? new Prisma.Decimal(0);
        return receivedQty.gte(it.quantity);
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
    });

    const storeIdToInvalidate = Number((result as any)?.order?.store_id ?? req.activeStoreId);
    await invalidateCatalogCache(storeIdToInvalidate);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
