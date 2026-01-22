import { Router } from 'express';
import prisma from '../../db/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { requireActiveStoreUnlessAdmin } from '../../middlewares/storeScope.middleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStoreUnlessAdmin);

const isAdminRequest = (req: any) => {
  const role = req.user && typeof req.user === 'object' ? String(req.user.role ?? '') : '';
  return role.toLowerCase() === 'admin';
};

// List POS invoices (used by Orders page)
// GET /api/v1/invoices?take=20&skip=0&q=...
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const isAdmin = isAdminRequest(req);
    const queryStoreId = req.query.storeId ? Number(req.query.storeId) : NaN;
    const activeStoreId = req.activeStoreId !== undefined ? Number(req.activeStoreId) : NaN;
    const storeId = isAdmin
      ? (Number.isFinite(queryStoreId) ? queryStoreId : Number.isFinite(activeStoreId) ? activeStoreId : undefined)
      : Number.isFinite(activeStoreId)
        ? activeStoreId
        : undefined;

    const qAsId = Number(q);

    const where: any = {
      ...(storeId !== undefined ? { store_id: storeId } : {}),
      ...(q
        ? {
            OR: [
              ...(Number.isFinite(qAsId) ? [{ id: qAsId }] : []),
              { invoice_number: { contains: q, mode: 'insensitive' } },
              { payment_method: { contains: q, mode: 'insensitive' } },
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
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.invoices.findMany({
        where,
        include: {
          stores: true,
          users: { select: { id: true, username: true, full_name: true, email: true } },
          _count: { select: { invoice_items: true } },
        },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.invoices.count({ where }),
    ]);

    const items = rows.map((inv) => ({
      id: inv.id,
      cashier_name: inv.users?.full_name || inv.users?.username || inv.users?.email || null,
      store_name: inv.stores?.name || null,
      store_code: inv.stores?.code || null,
      items_count: (inv as any)._count?.invoice_items ?? 0,
      total_amount: inv.total,
      paid_amount: null,
      payment_method: inv.payment_method,
      created_at: inv.created_at,
      status: 'completed',
    }));

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

// Invoice details (used by Orders detail modal)
// GET /api/v1/invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isFinite(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice id' });
    }

    const invoice = await prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: {
        stores: true,
        users: { select: { id: true, username: true, full_name: true, email: true } },
        invoice_items: {
          include: {
            product_variants: {
              include: {
                products: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const isAdmin = isAdminRequest(req);
    const activeStoreId = req.activeStoreId !== undefined ? Number(req.activeStoreId) : NaN;
    if (!isAdmin && Number.isFinite(activeStoreId) && Number(invoice.store_id) !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const order = {
      id: invoice.id,
      cashier_name: invoice.users?.full_name || invoice.users?.username || invoice.users?.email || null,
      store_name: invoice.stores?.name || null,
      store_code: invoice.stores?.code || null,
      items_count: invoice.invoice_items?.length ?? 0,
      total_amount: invoice.total,
      paid_amount: null,
      payment_method: invoice.payment_method,
      created_at: invoice.created_at,
      status: 'completed',
    };

    const items = (invoice.invoice_items ?? []).map((it) => {
      const variant = (it as any).product_variants;
      const product = variant?.products;
      return {
        id: it.id,
        product_name: product?.name || variant?.name || '(Không rõ)',
        sku_code: product?.sku || variant?.variant_code || variant?.barcode || '',
        unit: product?.unit || '',
        quantity: it.quantity,
        price: it.unit_price,
      };
    });

    return res.json({ order, items });
  } catch (err) {
    next(err);
  }
});

export default router;
