import { Router } from 'express';
import { Prisma } from '../../generated/prisma';
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

// Adjustment history (stock_movements of type 'adjustment')
// GET /api/v1/inventory/adjustments?q=milk&take=50&skip=0
router.get('/adjustments', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const storeId = isAdmin && req.query.storeId ? Number(req.query.storeId) : activeStoreId;
    const q = String(req.query.q ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const where: Prisma.stock_movementsWhereInput = {
      movement_type: 'adjustment',
      ...(Number.isFinite(storeId as number) ? { store_id: storeId } : {}),
      ...(q
        ? {
            OR: [
              { reason: { contains: q, mode: 'insensitive' } },
              { reference_id: { contains: q, mode: 'insensitive' } },
              {
                stores: {
                  is: {
                    OR: [
                      { code: { contains: q, mode: 'insensitive' } },
                      { name: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                users: {
                  is: {
                    OR: [
                      { full_name: { contains: q, mode: 'insensitive' } },
                      { username: { contains: q, mode: 'insensitive' } },
                      { email: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
              {
                product_variants: {
                  is: {
                    OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { barcode: { contains: q, mode: 'insensitive' } },
                      { variant_code: { contains: q, mode: 'insensitive' } },
                      {
                        products: {
                          is: {
                            OR: [
                              { name: { contains: q, mode: 'insensitive' } },
                              { sku: { contains: q, mode: 'insensitive' } },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
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
    ]);

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

// Basic inventory list (by store)
router.get('/', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const storeId = isAdmin && req.query.storeId ? Number(req.query.storeId) : activeStoreId;
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const where = storeId ? { store_id: storeId } : {};
    const [items, total] = await Promise.all([
      prisma.inventories.findMany({
        where,
        include: { product_variants: { include: { products: true } } },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.inventories.count({ where }),
    ]);

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

// Lookup inventory for active store + variant
router.get('/variants/:variantId', requireActiveStore, async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const variantId = Number(req.params.variantId);
    if (!Number.isFinite(storeId) || !Number.isFinite(variantId)) {
      return res.status(400).json({ error: 'Invalid variantId' });
    }

    const inventory = await prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variantId },
      include: { product_variants: { include: { products: true } }, stores: true },
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    return res.json({ inventory });
  } catch (err) {
    next(err);
  }
});

// Lookup inventory for a store + variant (legacy route)
router.get('/stores/:storeId/variants/:variantId', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const variantId = Number(req.params.variantId);
    if (!Number.isFinite(storeId) || !Number.isFinite(variantId)) {
      return res.status(400).json({ error: 'Invalid storeId/variantId' });
    }

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    if (!isAdmin && Number.isFinite(activeStoreId) && storeId !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden: store does not match active store' });
    }

    const inventory = await prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variantId },
      include: { product_variants: { include: { products: true } }, stores: true },
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    return res.json({ inventory });
  } catch (err) {
    next(err);
  }
});

// Lookup by barcode (common cashier/manager workflow)
router.get('/lookup', requireActiveStore, async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const barcode = String(req.query.barcode ?? '').trim();
    if (!Number.isFinite(storeId) || !barcode) {
      return res.status(400).json({ error: 'Invalid barcode' });
    }

    const variant = await prisma.product_variants.findFirst({
      where: { barcode },
      include: { products: true },
    });

    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    const inventory = await prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variant.id },
    });

    return res.json({ variant, inventory });
  } catch (err) {
    next(err);
  }
});

// Lookup by barcode for a store (legacy route)
router.get('/stores/:storeId/lookup', requireActiveStoreUnlessAdmin, async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const barcode = String(req.query.barcode ?? '').trim();
    if (!Number.isFinite(storeId) || !barcode) {
      return res.status(400).json({ error: 'Invalid storeId/barcode' });
    }

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    if (!isAdmin && Number.isFinite(activeStoreId) && storeId !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden: store does not match active store' });
    }

    const variant = await prisma.product_variants.findFirst({
      where: { barcode },
      include: { products: true },
    });

    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    const inventory = await prisma.inventories.findFirst({
      where: { store_id: storeId, variant_id: variant.id },
    });

    return res.json({ variant, inventory });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M2: Receistock
 * Body: 
 * {
 *   variantId: number,
 *   quantity: number,
 *   unitCost: number,
 *   createdBy?: number,
 *   lotCode?: string,
 *   expiryDate?: string (YYYY-MM-DD),
 *   referenceId?: string,
 *   reason?: string
 * }
 */
router.post('/receive', async (req, res, next) => {
  try {
    const { storeId, variantId, quantity, unitCost, createdBy, lotCode, expiryDate, referenceId, reason } = req.body ?? {};

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const storeIdNum = isAdmin && storeId !== undefined && storeId !== null && storeId !== '' ? Number(storeId) : activeStoreId;
    const variantIdNum = Number(variantId);
    const qty = toDecimal(quantity);
    const cost = toDecimal(unitCost);

    if (!Number.isFinite(storeIdNum) || !Number.isFinite(variantIdNum)) {
      return res.status(400).json({ error: 'Invalid storeId/variantId' });
    }
    if (qty.lte(0)) {
      return res.status(400).json({ error: 'Quantity must be > 0' });
    }

    const expiry = expiryDate ? new Date(String(expiryDate)) : null;
    if (expiryDate && Number.isNaN(expiry!.getTime())) {
      return res.status(400).json({ error: 'Invalid expiryDate' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.product_variants.findUnique({ where: { id: variantIdNum } });
      if (!variant) {
        throw new Error('Variant not found');
      }

      const store = await tx.stores.findUnique({ where: { id: storeIdNum } });
      if (!store) {
        throw new Error('Store not found');
      }

      const existingInventory = await tx.inventories.findFirst({
        where: { store_id: storeIdNum, variant_id: variantIdNum },
      });

      const inventory = existingInventory
        ? await tx.inventories.update({
            where: { id: existingInventory.id },
            data: {
              quantity: { increment: qty },
              last_cost: cost,
              last_update: new Date(),
            },
          })
        : await tx.inventories.create({
            data: {
              store_id: storeIdNum,
              variant_id: variantIdNum,
              quantity: qty,
              reserved: new Prisma.Decimal(0),
              last_cost: cost,
              last_update: new Date(),
            },
          });

      const lot = await tx.stock_lots.create({
        data: {
          store_id: storeIdNum,
          variant_id: variantIdNum,
          lot_code: lotCode ? String(lotCode) : null,
          quantity: qty,
          quantity_remaining: qty,
          cost,
          expiry_date: expiry,
        },
      });

      const movement = await tx.stock_movements.create({
        data: {
          store_id: storeIdNum,
          variant_id: variantIdNum,
          change: qty,
          movement_type: 'receive',
          reference_id: referenceId ? String(referenceId) : String(lot.id),
          reason: reason ? String(reason) : 'Stock receive',
          created_by: createdBy ? Number(createdBy) : null,
        },
      });

      return { inventory, lot, movement };
    });

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M2: Adjust stock
 * Body:
 * {
 *   variantId: number,
 *   delta?: number,
 *   setTo?: number,
 *   createdBy?: number,
 *   reason?: string,
 *   referenceId?: string
 * }
 */
router.post('/adjust', async (req, res, next) => {
  try {
    const { storeId, variantId, delta, setTo, createdBy, reason, referenceId, note } = req.body ?? {};

    const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
    const isAdmin = role.toLowerCase() === 'admin';
    const activeStoreId = Number(req.activeStoreId);
    const storeIdNum = isAdmin && storeId !== undefined && storeId !== null && storeId !== '' ? Number(storeId) : activeStoreId;
    const variantIdNum = Number(variantId);
    if (!Number.isFinite(storeIdNum) || !Number.isFinite(variantIdNum)) {
      return res.status(400).json({ error: 'Invalid storeId/variantId' });
    }

    const hasDelta = delta !== undefined && delta !== null && delta !== '';
    const hasSetTo = setTo !== undefined && setTo !== null && setTo !== '';
    if (hasDelta === hasSetTo) {
      return res.status(400).json({ error: 'Provide exactly one of delta or setTo' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventories.findFirst({
        where: { store_id: storeIdNum, variant_id: variantIdNum },
      });

      // Resolve delta
      const deltaDec = hasDelta ? toDecimal(delta) : toDecimal(setTo);

      // Auto-create inventory if missing (only supports positive adjustments or setTo)
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
            store_id: storeIdNum,
            variant_id: variantIdNum,
            quantity: initialQty,
            reserved: new Prisma.Decimal(0),
            last_cost: new Prisma.Decimal(0),
            last_update: new Date(),
          },
        });

        const movement = await tx.stock_movements.create({
          data: {
            store_id: storeIdNum,
            variant_id: variantIdNum,
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

        return { inventory: created, movement };
      }

      const currentQty = new Prisma.Decimal(inventory.quantity ?? 0);
      const reserved = new Prisma.Decimal(inventory.reserved ?? 0);
      const effectiveDelta = hasDelta ? deltaDec : deltaDec.minus(currentQty);

      const newQty = currentQty.plus(effectiveDelta);
      if (newQty.lt(0)) {
        throw new Error('Resulting quantity would be negative');
      }

      // Do not allow quantity to go below reserved
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
          store_id: storeIdNum,
          variant_id: variantIdNum,
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

      return { inventory: updated, movement };
    });

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
