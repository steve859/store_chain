/**
 * ASR-A2: POS Offline Sync Service (Backend)
 *
 * Provides endpoints for:
 * 1. Batch sync of offline transactions (with idempotency)
 * 2. Sync status check
 * 3. Catalog snapshot for offline cache
 *
 * Each offline transaction carries a client-generated `idempotencyKey`
 * to prevent duplicate processing when connectivity is intermittent.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import prisma from '../../db/prisma';
import { logger } from '../../lib/monitoring/logger';

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface OfflineTransaction {
  idempotencyKey: string; // client-generated UUID
  storeId: number;
  cashierId: number;
  customerId?: number;
  paymentMethod: string;
  items: Array<{ variantId: number; quantity: number }>;
  discount?: number;
  tax?: number;
  totalAmount: number;
  paidAmount: number;
  createdAt: string; // ISO timestamp from client
}

interface SyncResult {
  idempotencyKey: string;
  status: 'created' | 'duplicate' | 'failed';
  invoiceId?: number;
  error?: string;
}

// ─── Idempotency Store ───────────────────────────────────────────────────────
// Uses a DB table-less approach: we store idempotency keys as special audit_log entries.
// In production, consider a dedicated `idempotency_keys` table.

async function checkIdempotencyKey(key: string): Promise<number | null> {
  const existing = await prisma.audit_logs.findFirst({
    where: {
      action: 'offline_sync_completed',
      object_type: 'idempotency_key',
      object_id: key,
    },
    select: { payload: true },
  });
  if (existing && existing.payload && typeof existing.payload === 'object') {
    return (existing.payload as any).invoiceId ?? null;
  }
  return null;
}

async function saveIdempotencyKey(key: string, invoiceId: number, userId: number): Promise<void> {
  await prisma.audit_logs.create({
    data: {
      action: 'offline_sync_completed',
      object_type: 'idempotency_key',
      object_id: key,
      user_id: userId,
      payload: { invoiceId, syncedAt: new Date().toISOString() },
    },
  });
}

// ─── Helper: Process single offline transaction ──────────────────────────────

async function processOfflineTransaction(txn: OfflineTransaction): Promise<SyncResult> {
  const { idempotencyKey, storeId, cashierId, customerId, paymentMethod, items, discount, tax } = txn;

  try {
    // 1. Idempotency check
    const existingInvoiceId = await checkIdempotencyKey(idempotencyKey);
    if (existingInvoiceId !== null) {
      logger.info({ message: 'Duplicate offline transaction skipped', idempotencyKey, invoiceId: existingInvoiceId });
      return { idempotencyKey, status: 'duplicate', invoiceId: existingInvoiceId };
    }

    // 2. Process in DB transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const parsedItems = items
        .map((it) => ({ variantId: Number(it.variantId), quantity: Number(it.quantity) }))
        .filter((it) => Number.isFinite(it.variantId) && Number.isFinite(it.quantity) && it.quantity > 0);

      if (parsedItems.length === 0) {
        throw new Error('No valid items');
      }

      // Fetch variants
      const variants = await tx.product_variants.findMany({
        where: { id: { in: parsedItems.map((i) => i.variantId) } },
      });
      if (variants.length !== parsedItems.length) {
        throw new Error('One or more variants not found');
      }

      // Check inventory
      const inventoryRows = await tx.inventories.findMany({
        where: {
          store_id: storeId,
          variant_id: { in: parsedItems.map((i) => i.variantId) },
        },
      });

      for (const item of parsedItems) {
        const inv = inventoryRows.find((r) => r.variant_id === item.variantId);
        if (!inv || inv.quantity === null) {
          throw new Error(`Inventory not found for variant ${item.variantId}`);
        }
        const available = Number(inv.quantity) - Number(inv.reserved ?? 0);
        if (available < item.quantity) {
          throw new Error(`Insufficient stock for variant ${item.variantId}. Available: ${available}, Requested: ${item.quantity}`);
        }
      }

      // Calculate totals
      const subtotal = parsedItems.reduce((sum, item) => {
        const variant = variants.find((v) => v.id === item.variantId)!;
        return sum + Number(variant.price ?? 0) * item.quantity;
      }, 0);

      const discountNum = discount ?? 0;
      const taxNum = tax ?? 0;
      const total = subtotal + taxNum - discountNum;

      // Create invoice with offline timestamp
      const createdInvoice = await tx.invoices.create({
        data: {
          store_id: storeId,
          customer_id: customerId ?? null,
          created_by: cashierId,
          payment_method: paymentMethod,
          subtotal,
          discount: discountNum,
          tax: taxNum,
          total,
          created_at: new Date(txn.createdAt), // preserve original timestamp
        },
      });

      // Create items + update inventory + stock movements
      for (const item of parsedItems) {
        const variant = variants.find((v) => v.id === item.variantId)!;
        const inv = inventoryRows.find((r) => r.variant_id === item.variantId)!;

        await tx.invoice_items.create({
          data: {
            invoice_id: createdInvoice.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: variant.price,
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
            reason: `POS offline sync (key: ${idempotencyKey.substring(0, 8)}...)`,
            created_by: cashierId,
          },
        });
      }

      return createdInvoice;
    });

    // 3. Save idempotency key
    await saveIdempotencyKey(idempotencyKey, invoice.id, cashierId);

    logger.info({
      message: 'Offline transaction synced successfully',
      idempotencyKey,
      invoiceId: invoice.id,
      storeId,
    });

    return { idempotencyKey, status: 'created', invoiceId: invoice.id };
  } catch (error: any) {
    logger.error({
      message: 'Failed to sync offline transaction',
      idempotencyKey,
      storeId,
      errorMessage: error.message,
    });
    return { idempotencyKey, status: 'failed', error: error.message };
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/pos/offline/sync
 * Batch sync offline transactions from POS client
 * Body: { transactions: OfflineTransaction[] }
 * Returns: { results: SyncResult[], summary: { created, duplicate, failed } }
 */
router.post('/sync', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transactions } = req.body ?? {};

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'transactions array is required' });
    }

    if (transactions.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 transactions per batch' });
    }

    // Validate all transactions have idempotency keys
    for (const txn of transactions) {
      if (!txn.idempotencyKey || typeof txn.idempotencyKey !== 'string') {
        return res.status(400).json({ error: 'Each transaction must have an idempotencyKey' });
      }
    }

    logger.info({
      message: 'Processing offline sync batch',
      count: transactions.length,
      storeId: transactions[0]?.storeId,
    });

    // Process sequentially to respect inventory constraints
    const results: SyncResult[] = [];
    for (const txn of transactions) {
      const result = await processOfflineTransaction(txn);
      results.push(result);
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };

    logger.info({
      message: 'Offline sync batch completed',
      summary,
    });

    return res.json({ results, summary });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pos/offline/catalog
 * Returns a snapshot of the product catalog for offline caching
 * Includes: products, variants, prices, inventory for the active store
 */
router.get('/catalog', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = Number((req as any).activeStoreId);
    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'Invalid store' });
    }

    // Get all variants with their products and current store inventory
    const variants = await prisma.product_variants.findMany({
      where: {
        products: { is_active: true },
      },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            sku: true,
            category: true,
            unit: true,
            is_active: true,
          },
        },
      },
    });

    const inventories = await prisma.inventories.findMany({
      where: {
        store_id: storeId,
        variant_id: { in: variants.map((v) => v.id) },
      },
      select: {
        variant_id: true,
        quantity: true,
        reserved: true,
      },
    });

    const inventoryMap = new Map(inventories.map((inv) => [inv.variant_id, inv]));

    const catalog = variants.map((v) => {
      const inv = inventoryMap.get(v.id);
      return {
        variantId: v.id,
        variantCode: v.variant_code,
        barcode: v.barcode,
        name: [v.products?.name, v.name].filter(Boolean).join(' - '),
        price: Number(v.price ?? 0),
        stock: Number(inv?.quantity ?? 0) - Number(inv?.reserved ?? 0),
        category: v.products?.category ?? 'Khác',
        unit: v.products?.unit,
        sku: v.products?.sku,
      };
    });

    return res.json({
      storeId,
      catalog,
      generatedAt: new Date().toISOString(),
      count: catalog.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pos/offline/check-keys
 * Check status of idempotency keys (which have been synced already)
 * Body: { keys: string[] }
 */
router.post('/check-keys', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { keys } = req.body ?? {};
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'keys array is required' });
    }

    const existing = await prisma.audit_logs.findMany({
      where: {
        action: 'offline_sync_completed',
        object_type: 'idempotency_key',
        object_id: { in: keys },
      },
      select: { object_id: true, payload: true },
    });

    const syncedKeys: Record<string, { invoiceId: number; syncedAt: string }> = {};
    for (const entry of existing) {
      if (entry.object_id && entry.payload && typeof entry.payload === 'object') {
        syncedKeys[entry.object_id] = entry.payload as any;
      }
    }

    return res.json({ syncedKeys, checkedCount: keys.length, syncedCount: existing.length });
  } catch (err) {
    next(err);
  }
});

export default router;
