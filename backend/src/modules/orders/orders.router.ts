import { Router } from 'express';
import { Prisma } from '../../generated/prisma';
import prisma from '../../db/prisma';

const router = Router();

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

/**
 * UC-M3: Purchase order list
 * GET /api/v1/orders?storeId=1&status=draft&take=50&skip=0&q=po-2026
 */
router.get('/', async (req, res, next) => {
  try {
    const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
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
router.delete('/:id', async (req, res, next) => {
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
router.get('/:id', async (req, res, next) => {
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
router.post('/', async (req, res, next) => {
  try {
    const { storeId, supplierId, createdBy, orderNumber, items } = req.body ?? {};
    const storeIdNum = Number(storeId);
    const supplierIdNum = supplierId !== undefined && supplierId !== null ? Number(supplierId) : null;
    const createdByNum = createdBy !== undefined && createdBy !== null ? Number(createdBy) : null;

    if (!Number.isFinite(storeIdNum) || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid storeId/items' });
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
 *   createdBy?: number,
 *   referenceId?: string,
 *   reason?: string,
 *   items?: Array<{ variantId: number, receivedQty: number, unitCost?: number }>
 * }
 */
router.post('/:id/receive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const createdBy = req.body?.createdBy !== undefined ? Number(req.body.createdBy) : null;
    const referenceId = req.body?.referenceId ? String(req.body.referenceId) : null;
    const reason = req.body?.reason ? String(req.body.reason) : 'Receive purchase order';
    const bodyItems = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : null;
    if (createdBy !== null && !Number.isFinite(createdBy)) {
      return res.status(400).json({ error: 'Invalid createdBy' });
    }

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
      if (!po.status || !['approved', 'submitted', 'draft'].includes(po.status)) {
        throw new Error('Order is not receivable in current status');
      }

      const reference = referenceId ?? `PO:${po.id}`;

      const itemsToReceive: Array<{ variantId: number; receivedQty: Prisma.Decimal; unitCost: Prisma.Decimal }> =
        bodyItems === null
          ? po.purchase_items
              .map((it) => ({
                variantId: it.variant_id ?? NaN,
                receivedQty: it.quantity,
                unitCost: it.unit_cost,
              }))
              .filter((it) => Number.isFinite(it.variantId) && it.receivedQty.gt(0))
          : bodyItems
              .map((it: any) => {
                const variantId = Number(it?.variantId);
                const receivedQty = toDecimal(it?.receivedQty);
                const unitCost = it?.unitCost !== undefined && it?.unitCost !== null ? toDecimal(it?.unitCost) : null;
                return {
                  variantId,
                  receivedQty,
                  unitCost: unitCost ?? new Prisma.Decimal(0),
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

      for (const item of itemsToReceive) {
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

        await tx.stock_movements.create({
          data: {
            store_id: po.store_id,
            variant_id: item.variantId,
            change: item.receivedQty,
            movement_type: 'receive',
            reference_id: reference,
            reason,
            created_by: createdBy,
          },
        });
      }

      // Recompute order totals after any unit-cost updates
      const refreshed = await tx.purchase_orders.findUnique({
        where: { id: po.id },
        include: { purchase_items: true },
      });
      if (!refreshed) throw new Error('Order not found');

      const totalAmount = refreshed.purchase_items.reduce(
        (sum, it) => sum.add(it.quantity.mul(it.unit_cost)),
        new Prisma.Decimal(0),
      );

      await tx.purchase_orders.update({ where: { id: po.id }, data: { total_amount: totalAmount } });

      const isFullReceive = bodyItems === null
        ? true
        : itemsToReceive.every((it) => {
            const poItem = refreshed.purchase_items.find((x) => x.variant_id === it.variantId);
            return poItem ? it.receivedQty.eq(poItem.quantity) : false;
          });

      const updated = await tx.purchase_orders.update({
        where: { id: po.id },
        data: { status: isFullReceive ? 'received' : 'submitted' },
      });

      return updated;
    });

    return res.status(201).json({ order: result });
  } catch (err) {
    next(err);
  }
});

export default router;
