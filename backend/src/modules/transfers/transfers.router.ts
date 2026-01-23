import { Router } from 'express';
import { Prisma } from '@prisma/client'
import prisma from '../../db/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { requireActiveStore, requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';

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

const generateTransferNumber = (): string => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TR-${Date.now()}-${rand}`;
};

/**
 * UC-M8: List transfers
 * GET /api/v1/transfers?fromStoreId=1&toStoreId=2&status=pending&take=50&skip=0&q=tr-
 */
router.get('/', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const fromStoreId = req.query.fromStoreId ? Number(req.query.fromStoreId) : undefined;
    const toStoreId = req.query.toStoreId ? Number(req.query.toStoreId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const q = String(req.query.q ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = req.activeStoreId ?? null;

    if (!isAdmin && activeStoreId) {
      if (Number.isFinite(fromStoreId) && fromStoreId !== activeStoreId) {
        return res.status(403).json({ error: 'Forbidden: fromStoreId not allowed' });
      }
      if (Number.isFinite(toStoreId) && toStoreId !== activeStoreId) {
        return res.status(403).json({ error: 'Forbidden: toStoreId not allowed' });
      }
    }

    const where: Prisma.store_transfersWhereInput = {
      ...(Number.isFinite(fromStoreId) ? { from_store_id: fromStoreId } : {}),
      ...(Number.isFinite(toStoreId) ? { to_store_id: toStoreId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { transfer_number: { contains: q, mode: 'insensitive' } },
              { stores_store_transfers_from_store_idTostores: { is: { name: { contains: q, mode: 'insensitive' } } } },
              { stores_store_transfers_from_store_idTostores: { is: { code: { contains: q, mode: 'insensitive' } } } },
              { stores_store_transfers_to_store_idTostores: { is: { name: { contains: q, mode: 'insensitive' } } } },
              { stores_store_transfers_to_store_idTostores: { is: { code: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    if (!isAdmin && activeStoreId && !Number.isFinite(fromStoreId) && !Number.isFinite(toStoreId)) {
      where.OR = [{ from_store_id: activeStoreId }, { to_store_id: activeStoreId }];
    }

    const [items, total] = await Promise.all([
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
    ]);

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M8: Transfer details
 * GET /api/v1/transfers/:id
 */
router.get('/:id', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid transfer id' });
    }

    const transfer = await prisma.store_transfers.findUnique({
      where: { id },
      include: {
        store_transfer_items: { include: { product_variants: { include: { products: true } } } },
        stores_store_transfers_from_store_idTostores: true,
        stores_store_transfers_to_store_idTostores: true,
        users: true,
      },
    });

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    return res.json({ transfer });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M8: Create transfer (reserves stock at origin store)
 * POST /api/v1/transfers
 * Body:
 * {
 *   fromStoreId: number,
 *   toStoreId: number,
 *   createdBy?: number,
 *   transferNumber?: string,
 *   items: Array<{ variantId: number, quantity: number }>
 * }
 */
router.post('/', requireActiveStore, async (req, res, next) => {
  try {
    const { fromStoreId, toStoreId, createdBy, transferNumber, items } = req.body ?? {};
    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);

    const fromStoreIdNum = isAdmin ? Number(fromStoreId) : activeStoreId;
    const toStoreIdNum = Number(toStoreId);
    const createdByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const createdByNum = Number.isFinite(createdByFromToken)
      ? createdByFromToken
      : createdBy !== undefined && createdBy !== null
        ? Number(createdBy)
        : null;

    if (!isAdmin && Number.isFinite(fromStoreId) && Number(fromStoreId) !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden: fromStoreId must match active store' });
    }

    if (!Number.isFinite(fromStoreIdNum) || !Number.isFinite(toStoreIdNum) || fromStoreIdNum === toStoreIdNum) {
      return res.status(400).json({ error: 'Invalid fromStoreId/toStoreId' });
    }
    if (createdByNum !== null && !Number.isFinite(createdByNum)) {
      return res.status(400).json({ error: 'Invalid createdBy' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items is required' });
    }

    const parsedItems: Array<{ variantId: number; quantity: Prisma.Decimal }> = items
      .map((it: any) => ({ variantId: Number(it?.variantId), quantity: toDecimal(it?.quantity) }))
      .filter((it) => Number.isFinite(it.variantId) && it.quantity.gt(0));

    if (parsedItems.length !== items.length) {
      return res.status(400).json({ error: 'Invalid items payload' });
    }

    const created = await prisma.$transaction(async (tx) => {
      const [fromStore, toStore] = await Promise.all([
        tx.stores.findUnique({ where: { id: fromStoreIdNum } }),
        tx.stores.findUnique({ where: { id: toStoreIdNum } }),
      ]);
      if (!fromStore) throw new Error('From store not found');
      if (!toStore) throw new Error('To store not found');

      // Ensure inventories exist and reserve stock
      for (const item of parsedItems) {
        const inv = await tx.inventories.findFirst({
          where: { store_id: fromStoreIdNum, variant_id: item.variantId },
        });
        if (!inv) throw new Error(`Inventory not found for variant ${item.variantId}`);

        const available = new Prisma.Decimal(inv.quantity ?? 0).sub(new Prisma.Decimal(inv.reserved ?? 0));
        if (available.lt(item.quantity)) {
          throw new Error(`Not enough available stock for variant ${item.variantId}`);
        }
      }

      const transfer = await tx.store_transfers.create({
        data: {
          from_store_id: fromStoreIdNum,
          to_store_id: toStoreIdNum,
          created_by: createdByNum,
          transfer_number: transferNumber ? String(transferNumber) : generateTransferNumber(),
          status: 'pending',
        },
      });

      for (const item of parsedItems) {
        await tx.store_transfer_items.create({
          data: {
            transfer_id: transfer.id,
            variant_id: item.variantId,
            quantity: item.quantity,
          },
        });

        const inv = await tx.inventories.findFirst({
          where: { store_id: fromStoreIdNum, variant_id: item.variantId },
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
    });

    return res.status(201).json({ transfer: created });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M8: Dispatch transfer (moves stock out of origin: reserved->quantity decrement)
 * POST /api/v1/transfers/:id/dispatch
 * Body: { createdBy?: number, referenceId?: string, reason?: string }
 */
router.post('/:id/dispatch', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid transfer id' });
    }

    const createdBy = req.body?.createdBy !== undefined ? Number(req.body.createdBy) : null;
    const referenceId = req.body?.referenceId ? String(req.body.referenceId) : null;
    const reason = req.body?.reason ? String(req.body.reason) : 'Dispatch transfer';
    if (createdBy !== null && !Number.isFinite(createdBy)) {
      return res.status(400).json({ error: 'Invalid createdBy' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const transfer = await tx.store_transfers.findUnique({
        where: { id },
        include: { store_transfer_items: true },
      });
      if (!transfer) throw new Error('Transfer not found');
      if (!transfer.from_store_id || !transfer.to_store_id) throw new Error('Transfer missing store ids');
      if (transfer.status !== 'pending') throw new Error('Transfer is not dispatchable');

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

        await tx.stock_movements.create({
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
      }

      return tx.store_transfers.update({ where: { id: transfer.id }, data: { status: 'in_transit' } });
    });

    return res.status(201).json({ transfer: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M8: Receive transfer (moves stock into destination)
 * POST /api/v1/transfers/:id/receive
 * Body: { createdBy?: number, referenceId?: string, reason?: string, items?: Array<{ variantId: number, receivedQty: number }> }
 */
router.post('/:id/receive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid transfer id' });
    }

    const createdBy = req.body?.createdBy !== undefined ? Number(req.body.createdBy) : null;
    const referenceId = req.body?.referenceId ? String(req.body.referenceId) : null;
    const reason = req.body?.reason ? String(req.body.reason) : 'Receive transfer';
    const bodyItems = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : null;
    if (createdBy !== null && !Number.isFinite(createdBy)) {
      return res.status(400).json({ error: 'Invalid createdBy' });
    }

    if (bodyItems !== null && bodyItems.length === 0) {
      return res.status(400).json({ error: 'items must be non-empty when provided' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const transfer = await tx.store_transfers.findUnique({
        where: { id },
        include: { store_transfer_items: true },
      });
      if (!transfer) throw new Error('Transfer not found');
      if (!transfer.from_store_id || !transfer.to_store_id) throw new Error('Transfer missing store ids');
      if (transfer.status !== 'in_transit') throw new Error('Transfer is not receivable');

      const reference = referenceId ?? `TR:${transfer.id}`;

      const itemsToReceive: Array<{ variantId: number; receivedQty: Prisma.Decimal }> =
        bodyItems === null
          ? transfer.store_transfer_items
              .map((it) => ({
                variantId: it.variant_id ?? NaN,
                receivedQty: it.quantity,
              }))
              .filter((it) => Number.isFinite(it.variantId) && it.receivedQty.gt(0))
          : bodyItems
              .map((it: any) => ({ variantId: Number(it?.variantId), receivedQty: toDecimal(it?.receivedQty) }))
              .filter((it) => Number.isFinite(it.variantId) && it.receivedQty.gte(0));

      if (itemsToReceive.length === 0) {
        throw new Error('No receivable items');
      }

      const transferItemsByVariant = new Map(
        transfer.store_transfer_items
          .filter((i) => i.variant_id !== null && i.variant_id !== undefined)
          .map((i) => [i.variant_id as number, i]),
      );

      for (const it of itemsToReceive) {
        const ti = transferItemsByVariant.get(it.variantId);
        if (!ti) throw new Error('One or more items do not belong to this transfer');

        const alreadyReceived = new Prisma.Decimal((ti as any).received_quantity ?? 0);
        const remaining = ti.quantity.sub(alreadyReceived);
        if (remaining.lte(0)) {
          continue;
        }

        const requestQty = it.receivedQty;
        if (requestQty.lt(0)) throw new Error('receivedQty must be >= 0');
        if (requestQty.gt(remaining)) throw new Error(`receivedQty exceeds remaining for variant ${it.variantId}`);

        if (requestQty.eq(0)) continue;

        // Update received_quantity on transfer item
        await tx.store_transfer_items.update({
          where: { id: ti.id },
          data: { received_quantity: { increment: requestQty } },
        });

        const inv = await tx.inventories.findFirst({
          where: { store_id: transfer.to_store_id, variant_id: it.variantId },
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
              variant_id: it.variantId,
              quantity: requestQty,
              reserved: new Prisma.Decimal(0),
              last_cost: new Prisma.Decimal(0),
              last_update: new Date(),
            },
          });
        }

        await tx.stock_movements.create({
          data: {
            store_id: transfer.to_store_id,
            variant_id: it.variantId,
            change: requestQty,
            movement_type: 'transfer_in',
            reference_id: reference,
            reason,
            created_by: createdBy,
          },
        });
      }

      const refreshed = await tx.store_transfers.findUnique({
        where: { id: transfer.id },
        include: { store_transfer_items: true },
      });
      if (!refreshed) throw new Error('Transfer not found');

      const isCompleted = refreshed.store_transfer_items.every((it: any) => {
        const rq = new Prisma.Decimal(it.received_quantity ?? 0);
        return rq.gte(it.quantity);
      });

      return tx.store_transfers.update({
        where: { id: transfer.id },
        data: { status: isCompleted ? 'completed' : 'in_transit' },
      });
    });

    return res.status(201).json({ transfer: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M8: Cancel transfer (only while pending)
 * POST /api/v1/transfers/:id/cancel
 */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid transfer id' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const transfer = await tx.store_transfers.findUnique({
        where: { id },
        include: { store_transfer_items: true },
      });
      if (!transfer) throw new Error('Transfer not found');
      if (!transfer.from_store_id) throw new Error('Transfer missing from_store_id');
      if (transfer.status !== 'pending') throw new Error('Only pending transfers can be cancelled');

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

    return res.status(201).json({ transfer: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
