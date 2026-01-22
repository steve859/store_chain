import { Router } from 'express';
import { Prisma } from '../../generated/prisma';
import prisma from '../../db/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticateToken);

// Legacy UUID-based sales module (skus/inventory_levels/pos_sales).
// The main app has migrated to numeric store_id + invoices; keep this for admin-only access.
router.use((req, res, next) => {
  const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
  const isAdmin = role.toLowerCase() === 'admin';
  if (!isAdmin) {
    return res.status(410).json({
      error: 'Legacy sales module is deprecated. Use /pos and /invoices endpoints instead.',
    });
  }
  next();
});

const toLike = (q: string) => `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const toNumberOptional = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
};

/**
 * POS catalog from current schema (skus + products + inventory_levels)
 * GET /api/v1/sales/catalog?take=50&skip=0&q=milk&barcode=...&storeId=<uuid>
 */
router.get('/catalog', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const barcode = String(req.query.barcode ?? '').trim();
    const storeId = String(req.query.storeId ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const conditions: Prisma.Sql[] = [];

    if (storeId) {
      if (!isUuid(storeId)) {
        return res.status(400).json({ error: 'Invalid storeId' });
      }
      conditions.push(Prisma.sql`il.store_id = ${storeId}::uuid`);
    }

    if (barcode) {
      conditions.push(Prisma.sql`sk.barcode = ${barcode}`);
    }

    if (q) {
      const like = toLike(q);
      conditions.push(
        Prisma.sql`(
          p.name ILIKE ${like}
          OR sk.sku_code ILIKE ${like}
          OR COALESCE(sk.barcode, '') ILIKE ${like}
        )`,
      );
    }

    const whereSql =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const items = await prisma.$queryRaw<
      Array<{
        sku_id: string;
        sku_code: string;
        barcode: string | null;
        unit: string;
        price: string;
        product_id: string;
        product_name: string;
        stock: number;
      }>
    >(Prisma.sql`
      SELECT
        sk.id::text as sku_id,
        sk.sku_code,
        sk.barcode,
        sk.unit,
        sk.price::text as price,
        p.id::text as product_id,
        p.name as product_name,
        COALESCE(SUM(il.quantity - il.reserved), 0)::int as stock
      FROM skus sk
      JOIN products p ON p.id = sk.product_id
      LEFT JOIN inventory_levels il ON il.sku_id = sk.id
      ${whereSql}
      GROUP BY sk.id, p.id
      ORDER BY p.name ASC
      LIMIT ${take} OFFSET ${skip}
    `);

    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint as count
      FROM skus sk
      JOIN products p ON p.id = sk.product_id
      LEFT JOIN inventory_levels il ON il.sku_id = sk.id
      ${whereSql}
    `);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * POS checkout into pos_sales + pos_line_items
 * POST /api/v1/sales/checkout
 * Body:
 * {
 *   storeId?: string (uuid),
 *   cashierId?: string (uuid),
 *   paymentMethod: string,
 *   paidAmount?: number,
 *   totalAmount?: number,
 *   items: [{ skuId: string (uuid), quantity: number, price?: number }]
 * }
 */
router.post('/checkout', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const storeId = body.storeId ? String(body.storeId).trim() : '';
    const cashierId = body.cashierId ? String(body.cashierId).trim() : '';
    const paymentMethod = String(body.paymentMethod ?? '').trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!paymentMethod) {
      return res.status(400).json({ error: 'paymentMethod is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items is required' });
    }
    if (storeId && !isUuid(storeId)) {
      return res.status(400).json({ error: 'Invalid storeId' });
    }
    if (cashierId && !isUuid(cashierId)) {
      return res.status(400).json({ error: 'Invalid cashierId' });
    }

    const parsedItems = items
      .map((it: any) => ({
        skuId: String(it?.skuId ?? '').trim(),
        quantity: Number(it?.quantity),
        price: toNumberOptional(it?.price),
      }))
      .filter((it) => it.skuId && isUuid(it.skuId) && Number.isFinite(it.quantity) && it.quantity > 0);

    if (parsedItems.length !== items.length) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    const paidAmount = toNumberOptional(body.paidAmount);
    const totalAmountOverride = toNumberOptional(body.totalAmount);

    const created = await prisma.$transaction(async (tx) => {
      // Ensure all SKUs exist, and backfill missing prices from DB
      const skuRows = await tx.$queryRaw<
        Array<{ id: string; price: string }>
      >(Prisma.sql`
        SELECT id::text as id, price::text as price
        FROM skus
        WHERE id IN (${Prisma.join(parsedItems.map((i) => Prisma.sql`${i.skuId}::uuid`), ', ')})
      `);

      if (skuRows.length !== parsedItems.length) {
        throw new Error('One or more SKUs not found');
      }

      const skuPriceMap = new Map(skuRows.map((r) => [r.id, Number.parseFloat(r.price)]));
      const normalizedItems = parsedItems.map((it) => {
        const fallback = skuPriceMap.get(it.skuId);
        const price = it.price !== null ? it.price : fallback;
        if (price === undefined || price === null || !Number.isFinite(price) || price < 0) {
          throw new Error(`Invalid price for sku ${it.skuId}`);
        }
        return { ...it, price };
      });

      const computedTotal = normalizedItems.reduce((sum, it) => sum + it.quantity * it.price, 0);
      const totalAmount = totalAmountOverride !== null ? totalAmountOverride : computedTotal;

      const salesRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO pos_sales (store_id, cashier_id, total_amount, paid_amount, payment_method)
        VALUES (
          ${storeId ? Prisma.sql`${storeId}::uuid` : Prisma.sql`NULL`},
          ${cashierId ? Prisma.sql`${cashierId}::uuid` : Prisma.sql`NULL`},
          ${totalAmount},
          ${paidAmount === null ? Prisma.sql`NULL` : Prisma.sql`${paidAmount}`},
          ${paymentMethod}
        )
        RETURNING id::text as id
      `);

      const saleId = salesRows[0]?.id;
      if (!saleId) {
        throw new Error('Failed to create sale');
      }

      for (const it of normalizedItems) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO pos_line_items (sale_id, sku_id, quantity, price)
          VALUES (${saleId}::uuid, ${it.skuId}::uuid, ${it.quantity}, ${it.price})
        `);

        // Optionally decrement store stock if storeId provided
        if (storeId) {
          const updated = await tx.$executeRaw(Prisma.sql`
            UPDATE inventory_levels
            SET quantity = quantity - ${it.quantity}, updated_at = CURRENT_TIMESTAMP
            WHERE store_id = ${storeId}::uuid
              AND sku_id = ${it.skuId}::uuid
              AND quantity - reserved >= ${it.quantity}
          `);
          if (updated === 0) {
            throw new Error('Insufficient stock or inventory row missing');
          }
        }
      }

      return { id: saleId, totalAmount };
    });

    return res.status(201).json({ sale: created });
  } catch (err) {
    next(err);
  }
});

/**
 * Sales orders (POS)
 * GET /api/v1/sales?take=50&skip=0&q=...&storeCode=SHP-001
 */
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const storeCode = String(req.query.storeCode ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const conditions: Prisma.Sql[] = [];

    if (storeCode) {
      conditions.push(Prisma.sql`st.code = ${storeCode}`);
    }

    if (q) {
      const like = toLike(q);
      conditions.push(
        Prisma.sql`(
          s.id::text ILIKE ${like}
          OR COALESCE(st.code, '') ILIKE ${like}
          OR COALESCE(st.name, '') ILIKE ${like}
          OR COALESCE(u.name, '') ILIKE ${like}
          OR COALESCE(s.payment_method, '') ILIKE ${like}
        )`,
      );
    }

    const whereSql =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const items = await prisma.$queryRaw<
      Array<{
        id: string;
        total_amount: string;
        paid_amount: string | null;
        payment_method: string;
        created_at: string;
        store_code: string | null;
        store_name: string | null;
        cashier_name: string | null;
        items_count: number;
        status: string;
      }>
    >(Prisma.sql`
      SELECT
        s.id::text as id,
        s.total_amount::text as total_amount,
        COALESCE(s.paid_amount, NULL)::text as paid_amount,
        s.payment_method,
        s.created_at::timestamptz::text as created_at,
        st.code as store_code,
        st.name as store_name,
        u.name as cashier_name,
        COALESCE((SELECT SUM(li.quantity)::int FROM pos_line_items li WHERE li.sale_id = s.id), 0) as items_count,
        CASE
          WHEN s.paid_amount IS NULL THEN 'pending'
          WHEN s.paid_amount >= s.total_amount THEN 'completed'
          ELSE 'pending'
        END as status
      FROM pos_sales s
      LEFT JOIN stores st ON st.id = s.store_id
      LEFT JOIN users u ON u.id = s.cashier_id
      ${whereSql}
      ORDER BY s.created_at DESC
      LIMIT ${take} OFFSET ${skip}
    `);

    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint as count
      FROM pos_sales s
      LEFT JOIN stores st ON st.id = s.store_id
      LEFT JOIN users u ON u.id = s.cashier_id
      ${whereSql}
    `);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * Sales order details
 * GET /api/v1/sales/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id ?? '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Invalid sale id' });
    }

    const sales = await prisma.$queryRaw<
      Array<{
        id: string;
        total_amount: string;
        paid_amount: string | null;
        payment_method: string;
        created_at: string;
        store_code: string | null;
        store_name: string | null;
        cashier_name: string | null;
        status: string;
      }>
    >(Prisma.sql`
      SELECT
        s.id::text as id,
        s.total_amount::text as total_amount,
        COALESCE(s.paid_amount, NULL)::text as paid_amount,
        s.payment_method,
        s.created_at::timestamptz::text as created_at,
        st.code as store_code,
        st.name as store_name,
        u.name as cashier_name,
        CASE
          WHEN s.paid_amount IS NULL THEN 'pending'
          WHEN s.paid_amount >= s.total_amount THEN 'completed'
          ELSE 'pending'
        END as status
      FROM pos_sales s
      LEFT JOIN stores st ON st.id = s.store_id
      LEFT JOIN users u ON u.id = s.cashier_id
      WHERE s.id::text = ${id}
      LIMIT 1
    `);

    if (sales.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = sales[0];

    const lineItems = await prisma.$queryRaw<
      Array<{
        id: string;
        quantity: number;
        price: string;
        sku_code: string;
        barcode: string | null;
        unit: string;
        product_name: string;
      }>
    >(Prisma.sql`
      SELECT
        li.id::text as id,
        li.quantity,
        li.price::text as price,
        sk.sku_code,
        sk.barcode,
        sk.unit,
        p.name as product_name
      FROM pos_line_items li
      JOIN skus sk ON sk.id = li.sku_id
      JOIN products p ON p.id = sk.product_id
      WHERE li.sale_id::text = ${id}
      ORDER BY p.name ASC
    `);

    return res.json({ order, items: lineItems });
  } catch (err) {
    next(err);
  }
});

export default router;
