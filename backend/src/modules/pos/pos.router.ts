import { Request, Router } from 'express';
import prisma from '../../db/prisma';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { requireActiveStore } from '../../middlewares/storeScope.middleware';
import { AuditLogsService } from '../audit_logs/audit_logs.service';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveStore);

const posOperationalRoles = ['ADMIN', 'STORE_MANAGER', 'CASHIER', 'admin', 'manager', 'store_manager', 'cashier'];
const posRefundRoles = ['ADMIN', 'STORE_MANAGER', 'admin', 'manager', 'store_manager'];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorUserId = (req: Request): number | undefined => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch {
    // Audit logging is best-effort for this phase.
  }
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const decimalToNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(value as any);
  return Number.isFinite(n) ? n : 0;
};

const getEffectivePriceByVariantId = async (storeId: number, variantIds: number[]) => {
  if (!variantIds.length) return new Map<number, unknown>();
  const now = new Date();
  const rows = await prisma.variant_prices.findMany({
    where: {
      store_id: storeId,
      variant_id: { in: variantIds },
      start_at: { lte: now },
      OR: [{ end_at: null }, { end_at: { gt: now } }],
    },
    orderBy: { start_at: 'desc' },
    distinct: ['variant_id'],
  });
  return new Map<number, unknown>(rows.map((r) => [r.variant_id, r.price]));
};

const getOpenShift = async (storeId: number) => {
  return prisma.pos_shifts.findFirst({
    where: { store_id: storeId, status: 'open' },
    orderBy: { opened_at: 'desc' },
    include: { opened_user: true, closed_user: true },
  });
};

const computeShiftSummary = async (storeId: number, openedAt: Date, closedAt?: Date | null) => {
  const end = closedAt ?? new Date();

  const [salesAgg, cashSalesAgg, cashInAgg, cashOutAgg] = await Promise.all([
    prisma.invoices.aggregate({
      where: {
        store_id: storeId,
        payment_method: { not: null },
        created_at: { gte: openedAt, lte: end },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.invoices.aggregate({
      where: {
        store_id: storeId,
        payment_method: 'cash',
        created_at: { gte: openedAt, lte: end },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.cash_movements.aggregate({
      where: {
        store_id: storeId,
        created_at: { gte: openedAt, lte: end },
        type: 'cash_in',
      },
      _sum: { amount: true },
    }),
    prisma.cash_movements.aggregate({
      where: {
        store_id: storeId,
        created_at: { gte: openedAt, lte: end },
        type: 'cash_out',
      },
      _sum: { amount: true },
    }),
  ]);

  const totalSales = decimalToNumber(salesAgg._sum.total);
  const transactionsCount = Number(salesAgg._count?._all ?? 0);
  const cashSales = decimalToNumber(cashSalesAgg._sum.total);
  const cashTransactionsCount = Number(cashSalesAgg._count?._all ?? 0);
  const cashIn = decimalToNumber(cashInAgg._sum.amount);
  const cashOut = decimalToNumber(cashOutAgg._sum.amount);

  return {
    totalSales,
    transactionsCount,
    cashSales,
    cashTransactionsCount,
    cashIn,
    cashOut,
  };
};

// UC-C5: Shift open (persisted in pos_shifts)
router.post('/shifts/open', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const openedByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const openedBy = Number.isFinite(openedByFromToken)
      ? openedByFromToken
      : toNumber(req.body?.openedBy ?? req.body?.cashierId);
    const openingCash = toNumber(req.body?.openingCash) ?? 0;
    const note = req.body?.note ? String(req.body.note) : null;

    if (!Number.isFinite(storeId) || !openedBy) {
      return res.status(400).json({ error: 'openedBy is required' });
    }
    if (openingCash < 0) {
      return res.status(400).json({ error: 'openingCash must be >= 0' });
    }

    const existing = await getOpenShift(storeId);
    if (existing) {
      const summary = await computeShiftSummary(storeId, existing.opened_at);
      const expectedCash = decimalToNumber(existing.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;
      return res.status(409).json({
        error: 'Shift already open',
        shift: {
          storeId,
          id: existing.id,
          openedBy: existing.opened_by,
          openedAt: existing.opened_at,
          openingCash: decimalToNumber(existing.opening_cash),
          note: existing.note ?? null,
          status: 'open',
          summary: { ...summary, expectedCash },
        },
      });
    }

    const created = await prisma.pos_shifts.create({
      data: {
        store_id: storeId,
        status: 'open',
        opened_by: Math.trunc(openedBy),
        opened_at: new Date(),
        opening_cash: openingCash,
        note,
      },
    });

    if (openingCash > 0) {
      await prisma.cash_movements.create({
        data: {
          store_id: storeId,
          shift_id: created.id,
          type: 'cash_in',
          amount: openingCash,
          reason: 'Opening cash',
          created_by: Math.trunc(openedBy),
        },
      });
    }

    const summary = await computeShiftSummary(storeId, created.opened_at);
    const expectedCash = decimalToNumber(created.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;

    return res.status(201).json({
      shift: {
        storeId,
        id: created.id,
        openedBy: created.opened_by,
        openedAt: created.opened_at,
        openingCash: decimalToNumber(created.opening_cash),
        note: created.note ?? null,
        status: 'open',
        summary: { ...summary, expectedCash },
      },
    });
  } catch (err) {
    next(err);
  }
});

// UC-C5: Shift close (close current open shift for store)
router.post('/shifts/close', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const closedByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const closedBy = Number.isFinite(closedByFromToken)
      ? closedByFromToken
      : toNumber(req.body?.closedBy ?? req.body?.cashierId);
    const closingCash = toNumber(req.body?.closingCash);
    const note = req.body?.note ? String(req.body.note) : null;

    if (!Number.isFinite(storeId) || !closedBy || closingCash === null) {
      return res.status(400).json({ error: 'closedBy, closingCash are required' });
    }
    if (closingCash < 0) {
      return res.status(400).json({ error: 'closingCash must be >= 0' });
    }

    const open = await getOpenShift(storeId);
    if (!open) {
      return res.status(404).json({ error: 'No open shift found' });
    }

    const closedAt = new Date();
    const updated = await prisma.pos_shifts.update({
      where: { id: open.id },
      data: {
        status: 'closed',
        closed_by: Math.trunc(closedBy),
        closed_at: closedAt,
        closing_cash: closingCash,
        note,
      },
    });

    const summary = await computeShiftSummary(storeId, open.opened_at, closedAt);
    const expectedCash = decimalToNumber(open.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;
    const difference = (closingCash ?? 0) - expectedCash;

    const noteText = note ?? '';
    const shiftResponse = {
      shift: {
        storeId,
        id: updated.id,
        openedBy: updated.opened_by,
        openedAt: updated.opened_at,
        openingCash: decimalToNumber(updated.opening_cash),
        closedBy: updated.closed_by,
        closedAt: updated.closed_at,
        closingCash: decimalToNumber(updated.closing_cash),
        note: updated.note ?? null,
        status: 'closed',
        summary: { ...summary, expectedCash, difference },
      },
    };

    await writeAuditLog({
      action: 'SHIFT_CLOSED',
      objectType: 'pos_shift',
      objectId: updated?.id !== undefined && updated?.id !== null ? String(updated.id) : undefined,
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId,
        before: {
          id: open.id,
          status: open.status,
          openedBy: open.opened_by,
          openedAt: open.opened_at,
          openingCash: decimalToNumber(open.opening_cash),
        },
        after: {
          id: updated.id,
          status: updated.status,
          closedBy: updated.closed_by,
          closedAt: updated.closed_at,
          closingCash: decimalToNumber(updated.closing_cash),
        },
        metadata: {
          ...summary,
          expectedCash,
          difference,
          notePresent: noteText.length > 0,
          notePreview: noteText ? noteText.slice(0, 80) : undefined,
        },
      },
    });

    return res.status(201).json(shiftResponse);
  } catch (err) {
    next(err);
  }
});

// UC-C5: Get current open shift
router.get('/shifts/current', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);

    const open = await getOpenShift(storeId);
    if (!open) {
      return res.json({ shift: null });
    }

    const summary = await computeShiftSummary(storeId, open.opened_at);
    const expectedCash = decimalToNumber(open.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;

    return res.json({
      shift: {
        storeId,
        id: open.id,
        openedBy: open.opened_by,
        openedAt: open.opened_at,
        openingCash: decimalToNumber(open.opening_cash),
        note: open.note ?? null,
        status: 'open',
        summary: { ...summary, expectedCash },
      },
    });
  } catch (err) {
    next(err);
  }
});

// UC-C5: Cash movements during shift
// POST /api/v1/pos/cash-movements
// Body: { type: 'cash_in'|'cash_out', amount: number, reason?: string }
router.post('/cash-movements', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const createdByFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const createdBy = Number.isFinite(createdByFromToken) ? createdByFromToken : null;

    const type = req.body?.type ? String(req.body.type) : '';
    const amount = toNumber(req.body?.amount);
    const reason = req.body?.reason ? String(req.body.reason) : null;

    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'Invalid store' });
    }

    const allowed = new Set(['cash_in', 'cash_out']);
    if (!allowed.has(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    if (amount === null || amount <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }

    const open = await getOpenShift(storeId);
    if (!open) {
      return res.status(409).json({ error: 'No open shift. Please open shift first.' });
    }

    const movement = await prisma.cash_movements.create({
      data: {
        store_id: storeId,
        shift_id: open.id,
        type,
        amount,
        reason,
        created_by: createdBy,
      },
    });

    const summary = await computeShiftSummary(storeId, open.opened_at);
    const expectedCash = decimalToNumber(open.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;

    const reasonText = reason ?? '';
    const movementRecord = asRecord(movement);
    await writeAuditLog({
      action: 'CASH_MOVEMENT_CREATED',
      objectType: 'cash_movement',
      objectId: movementRecord.id !== undefined && movementRecord.id !== null ? String(movementRecord.id) : undefined,
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId,
        after: {
          id: movementRecord.id !== undefined && movementRecord.id !== null ? String(movementRecord.id) : undefined,
          shiftId: movementRecord.shift_id ?? movementRecord.shiftId,
          type: movementRecord.type,
          amount: movementRecord.amount,
          createdBy: movementRecord.created_by ?? movementRecord.createdBy,
          createdAt: movementRecord.created_at ?? movementRecord.createdAt,
        },
        metadata: {
          ...summary,
          expectedCash,
          reasonPresent: reasonText.length > 0,
          reasonPreview: reasonText ? reasonText.slice(0, 80) : undefined,
        },
      },
    });

    return res.status(201).json({ movement, shiftId: open.id, summary: { ...summary, expectedCash } });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/pos/shifts/:id/cash-movements
router.get('/shifts/:id/cash-movements', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const shiftId = Number(req.params.id);
    if (!Number.isFinite(storeId) || !Number.isFinite(shiftId)) {
      return res.status(400).json({ error: 'Invalid store/shift id' });
    }

    const shift = await prisma.pos_shifts.findUnique({ where: { id: shiftId } });
    if (!shift || shift.store_id !== storeId) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const items = await prisma.cash_movements.findMany({
      where: { store_id: storeId, shift_id: shiftId },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    return res.json({ items });
  } catch (err) {
    next(err);
  }
});

// UC-C6: Inventory lookup for POS
// GET /api/v1/pos/inventory/lookup?storeId=1&barcode=...   OR   ?storeId=1&variantId=10
router.get('/inventory/lookup', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const storeId = Number(req.activeStoreId);
    const barcode = String(req.query.barcode ?? '').trim();
    const variantId = req.query.variantId ? Number(req.query.variantId) : NaN;

    if (!barcode && !Number.isFinite(variantId)) {
      return res.status(400).json({ error: 'Provide barcode or variantId' });
    }

    const variant = barcode
      ? await prisma.product_variants.findFirst({ where: { barcode }, include: { products: true } })
      : await prisma.product_variants.findUnique({ where: { id: variantId }, include: { products: true } });

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

// UC-C4: Receipt payload
router.get('/invoices/:id/receipt', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isFinite(invoiceId)) {
      return res.status(400).json({ error: 'Invalid invoice id' });
    }

    const invoice = await prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: {
        invoice_items: {
          include: {
            product_variants: {
              include: { products: true },
            },
          },
        },
        stores: true,
        users: true,
        customers: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const activeStoreId = Number(req.activeStoreId);
    const invoiceStoreId = invoice.store_id !== undefined && invoice.store_id !== null ? Number(invoice.store_id) : NaN;
    if (!Number.isFinite(activeStoreId) || !Number.isFinite(invoiceStoreId) || invoiceStoreId !== activeStoreId) {
      return res.status(403).json({ error: 'Forbidden: invoice does not belong to active store' });
    }

    return res.json({
      invoice,
      receipt: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        createdAt: invoice.created_at,
        store: invoice.stores,
        cashier: invoice.users,
        customer: invoice.customers,
        items: invoice.invoice_items.map((it) => ({
          id: it.id,
          variantId: it.variant_id,
          name: it.product_variants?.name ?? it.product_variants?.products?.name ?? null,
          barcode: it.product_variants?.barcode ?? null,
          quantity: it.quantity,
          unitPrice: it.unit_price,
          lineTotal: it.line_total,
        })),
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        discount: invoice.discount,
        total: invoice.total,
        paymentMethod: invoice.payment_method,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-C1: POS Checkout
 * Body:
 * {
 *   storeId: number,
 *   cashierId: number,
 *   customerId?: number,
 *   paymentMethod: string,
 *   items: [{ variantId: number, quantity: number }],
 *   discount?: number,
 *   tax?: number
 * }
 */
router.post('/checkout', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const { customerId, paymentMethod, items, discount, tax, cashierId: cashierIdBody } = req.body ?? {};
    const storeId = Number(req.activeStoreId);
    const cashierIdFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const cashierId = Number.isFinite(cashierIdFromToken)
      ? cashierIdFromToken
      : cashierIdBody !== undefined && cashierIdBody !== null
        ? Number(cashierIdBody)
        : null;

    if (!Number.isFinite(storeId) || !cashierId || !paymentMethod || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedItems: Array<{ variantId: number; quantity: number }> = items
      .map((it: any) => ({ variantId: Number(it?.variantId), quantity: Number(it?.quantity) }))
      .filter((it) => Number.isFinite(it.variantId) && Number.isFinite(it.quantity) && it.quantity > 0);

    if (parsedItems.length !== items.length) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    const openShift = await getOpenShift(storeId);
    if (!openShift) {
      return res.status(409).json({ error: 'No open shift. Please open shift before checkout.' });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const variants = await tx.product_variants.findMany({
        where: { id: { in: parsedItems.map((i) => i.variantId) } },
      });

      if (variants.length !== parsedItems.length) {
        throw new Error('One or more variants not found');
      }

      const inventoryRows = await tx.inventories.findMany({
        where: {
          store_id: storeId,
          variant_id: { in: parsedItems.map((i) => i.variantId) },
        },
      });

      // ensure inventory exists and has enough
      for (const item of parsedItems) {
        const inv = inventoryRows.find((r) => r.variant_id === item.variantId);
        if (!inv || inv.quantity === null) {
          throw new Error(`Inventory not found for variant ${item.variantId}`);
        }
        const available = Number(inv.quantity) - Number(inv.reserved ?? 0);
        if (available < item.quantity) {
          throw new Error(`Insufficient stock for variant ${item.variantId}`);
        }
      }

      const variantIds = parsedItems.map((i) => i.variantId);
      const storePriceByVariantId = await getEffectivePriceByVariantId(storeId, variantIds);

      const unitPriceByVariantId = new Map<number, unknown>();
      for (const v of variants) {
        unitPriceByVariantId.set(v.id, storePriceByVariantId.get(v.id) ?? v.price);
      }

      const subtotal = parsedItems.reduce((sum, item) => {
        const unitPrice = unitPriceByVariantId.get(item.variantId);
        return sum + Number(unitPrice ?? 0) * item.quantity;
      }, 0);

      const discountNum = discount !== undefined && discount !== null ? Number(discount) : 0;
      const taxNum = tax !== undefined && tax !== null ? Number(tax) : 0;
      const total = subtotal + taxNum - discountNum;

      const createdInvoice = await tx.invoices.create({
        data: {
          store_id: storeId,
          customer_id: customerId ? Number(customerId) : null,
          created_by: Number(cashierId),
          payment_method: String(paymentMethod),
          subtotal,
          discount: discountNum,
          tax: taxNum,
          total,
        },
      });

      for (const item of parsedItems) {
        const variant = variants.find((v) => v.id === item.variantId)!;
        const inv = inventoryRows.find((r) => r.variant_id === item.variantId)!;
        const unitPrice = unitPriceByVariantId.get(item.variantId) ?? variant.price;

        await tx.invoice_items.create({
          data: {
            invoice_id: createdInvoice.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: unitPrice as any,
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
            reason: 'POS checkout',
            created_by: Number(cashierId),
          },
        });
      }

      return tx.invoices.findUnique({
        where: { id: createdInvoice.id },
        include: { invoice_items: true },
      });
    });

    return res.status(201).json({ invoice });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-C2: Hold cart
 * For now we implement as a lightweight held invoice by setting payment_method = null and invoice_number = null.
 * This does NOT require DB schema changes.
 */
router.post('/hold', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const { customerId, items, cashierId: cashierIdBody } = req.body ?? {};
    const storeId = Number(req.activeStoreId);
    const cashierIdFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const cashierId = Number.isFinite(cashierIdFromToken)
      ? cashierIdFromToken
      : cashierIdBody !== undefined && cashierIdBody !== null
        ? Number(cashierIdBody)
        : null;

    if (!Number.isFinite(storeId) || !cashierId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedItems: Array<{ variantId: number; quantity: number }> = items
      .map((it: any) => ({ variantId: Number(it?.variantId), quantity: Number(it?.quantity) }))
      .filter((it) => Number.isFinite(it.variantId) && Number.isFinite(it.quantity) && it.quantity > 0);

    if (parsedItems.length !== items.length) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    const held = await prisma.$transaction(async (tx) => {
      const variants = await tx.product_variants.findMany({
        where: { id: { in: parsedItems.map((i) => i.variantId) } },
      });

      if (variants.length !== parsedItems.length) {
        throw new Error('One or more variants not found');
      }

      const inventoryRows = await tx.inventories.findMany({
        where: {
          store_id: storeId,
          variant_id: { in: parsedItems.map((i) => i.variantId) },
        },
      });

      // reserve stock
      for (const item of parsedItems) {
        const inv = inventoryRows.find((r) => r.variant_id === item.variantId);
        if (!inv || inv.quantity === null) {
          throw new Error(`Inventory not found for variant ${item.variantId}`);
        }
        const available = Number(inv.quantity) - Number(inv.reserved ?? 0);
        if (available < item.quantity) {
          throw new Error(`Insufficient stock for variant ${item.variantId}`);
        }
      }

      const variantIds = parsedItems.map((i) => i.variantId);
      const storePriceByVariantId = await getEffectivePriceByVariantId(storeId, variantIds);
      const unitPriceByVariantId = new Map<number, unknown>();
      for (const v of variants) {
        unitPriceByVariantId.set(v.id, storePriceByVariantId.get(v.id) ?? v.price);
      }

      const subtotal = parsedItems.reduce((sum, item) => {
        const unitPrice = unitPriceByVariantId.get(item.variantId);
        return sum + Number(unitPrice ?? 0) * item.quantity;
      }, 0);

      const createdInvoice = await tx.invoices.create({
        data: {
          store_id: storeId,
          customer_id: customerId ? Number(customerId) : null,
          created_by: Number(cashierId),
          payment_method: null,
          subtotal,
          discount: 0,
          tax: 0,
          total: subtotal,
        },
      });

      for (const item of parsedItems) {
        const variant = variants.find((v) => v.id === item.variantId)!;
        const inv = inventoryRows.find((r) => r.variant_id === item.variantId)!;
        const unitPrice = unitPriceByVariantId.get(item.variantId) ?? variant.price;

        await tx.invoice_items.create({
          data: {
            invoice_id: createdInvoice.id,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit_price: unitPrice as any,
            unit_cost: inv.last_cost,
          },
        });

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            reserved: { increment: item.quantity },
            last_update: new Date(),
          },
        });
      }

      return tx.invoices.findUnique({
        where: { id: createdInvoice.id },
        include: { invoice_items: true },
      });
    });

    return res.status(201).json({ invoice: held });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-C2: Resume held cart
 * Converts reserved quantities into a real checkout (decrement quantity, release reserved).
 */
router.post('/resume/:id/checkout', authorizeRoles(posOperationalRoles), async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id);
    const { paymentMethod } = req.body ?? {};
    const activeStoreId = Number(req.activeStoreId);

    if (!Number.isFinite(invoiceId) || !paymentMethod) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoices.findUnique({
        where: { id: invoiceId },
        include: { invoice_items: true },
      });

      if (!invoice) {
        return null;
      }

      if (Number(invoice.store_id) !== activeStoreId) {
        return { __forbiddenActiveStore: true };
      }

      if (invoice.payment_method) {
        throw new Error('Invoice is already paid/checked out');
      }

      const storeId = invoice.store_id;
      const cashierId = invoice.created_by;

      if (!storeId || !cashierId) {
        throw new Error('Held invoice missing store/cashier');
      }

      const variantIds = invoice.invoice_items.map((it) => it.variant_id).filter((v): v is number => typeof v === 'number');
      const inventoryRows = await tx.inventories.findMany({
        where: { store_id: storeId, variant_id: { in: variantIds } },
      });

      for (const item of invoice.invoice_items) {
        if (!item.variant_id) continue;
        const inv = inventoryRows.find((r) => r.variant_id === item.variant_id);
        if (!inv || inv.quantity === null) {
          throw new Error(`Inventory not found for variant ${item.variant_id}`);
        }
        const qty = Number(item.quantity);

        // Final availability check includes reserved
        const available = Number(inv.quantity) - (Number(inv.reserved ?? 0) - qty);
        if (available < qty) {
          throw new Error(`Insufficient stock for variant ${item.variant_id}`);
        }
      }

      for (const item of invoice.invoice_items) {
        if (!item.variant_id) continue;
        const inv = inventoryRows.find((r) => r.variant_id === item.variant_id)!;
        const qty = Number(item.quantity);

        await tx.inventories.update({
          where: { id: inv.id },
          data: {
            reserved: { decrement: qty },
            quantity: { decrement: qty },
            last_update: new Date(),
          },
        });

        await tx.stock_movements.create({
          data: {
            store_id: storeId,
            variant_id: item.variant_id,
            change: -qty,
            movement_type: 'sale',
            reference_id: String(invoice.id),
            reason: 'POS resume checkout',
            created_by: cashierId,
          },
        });
      }

      await tx.invoices.update({
        where: { id: invoiceId },
        data: { payment_method: String(paymentMethod) },
      });

      return tx.invoices.findUnique({
        where: { id: invoiceId },
        include: { invoice_items: true },
      });
    });

    if (!result) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if ('__forbiddenActiveStore' in result) {
      return res.status(403).json({ error: 'Forbidden: invoice does not belong to active store' });
    }

    return res.json({ invoice: result });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-C3: Partial refund ("refund nhỏ")
 * Body: { storeId, cashierId, items: [{ invoiceItemId, quantity }], reason? }
 */
router.post('/refund', authorizeRoles(posRefundRoles), async (req, res, next) => {
  try {
    type RefundErrorResult = { __error: true; status: number; body: { error: string } };
    type RefundAuditDetails = { invoiceId: number; itemIds: number[]; variantIds: number[]; quantities: number[]; itemCount: number };
    const isRefundErrorResult = (value: unknown): value is RefundErrorResult =>
      Boolean(value && typeof value === 'object' && '__error' in value);

    const { items, reason, cashierId: cashierIdBody } = req.body ?? {};
    const storeId = Number(req.activeStoreId);
    const cashierIdFromToken = req.user && typeof req.user === 'object' ? Number((req.user as any).userId) : null;
    const cashierId = Number.isFinite(cashierIdFromToken)
      ? cashierIdFromToken
      : cashierIdBody !== undefined && cashierIdBody !== null
        ? Number(cashierIdBody)
        : null;

    if (!Number.isFinite(storeId) || !cashierId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const parsedItems: Array<{ invoiceItemId: number; quantity: number }> = items
      .map((it: any) => ({ invoiceItemId: Number(it?.invoiceItemId), quantity: Number(it?.quantity) }))
      .filter((it) => Number.isFinite(it.invoiceItemId) && Number.isFinite(it.quantity) && it.quantity > 0);

    if (parsedItems.length !== items.length) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    let refundAuditDetails: RefundAuditDetails | null = null;
    const refundResult = await prisma.$transaction(async (tx) => {
      const invoiceItems = await tx.invoice_items.findMany({
        where: { id: { in: parsedItems.map((i) => i.invoiceItemId) } },
      });

      if (invoiceItems.length !== parsedItems.length) {
        return { __error: true, status: 404, body: { error: 'One or more invoice items not found' } };
      }

      // Ensure all belong to same invoice
      const invoiceId = invoiceItems[0].invoice_id;
      if (!invoiceId || invoiceItems.some((it) => it.invoice_id !== invoiceId)) {
        return { __error: true, status: 400, body: { error: 'Refund items must belong to the same invoice' } };
      }

      const invoice = await tx.invoices.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        return { __error: true, status: 404, body: { error: 'Invoice not found' } };
      }

      if (Number(invoice.store_id) !== storeId) {
        return { __error: true, status: 403, body: { error: 'Invoice does not belong to this store' } };
      }

      // Apply refund: increase inventory, add stock movement. We do not yet persist a separate refund table.
      let totalRefund = 0;

      for (const reqItem of parsedItems) {
        const invItem = invoiceItems.find((it) => it.id === reqItem.invoiceItemId)!;
        if (!invItem.variant_id) {
          return { __error: true, status: 409, body: { error: `Invoice item ${invItem.id} missing variant_id` } };
        }

        const soldQty = Number(invItem.quantity);
        const refundQty = reqItem.quantity;
        if (refundQty > soldQty) {
          return { __error: true, status: 409, body: { error: `Refund quantity exceeds sold quantity for invoice item ${invItem.id}` } };
        }

        const unitPrice = Number(invItem.unit_price);
        totalRefund += unitPrice * refundQty;

        const inventory = await tx.inventories.findFirst({
          where: { store_id: storeId, variant_id: invItem.variant_id },
        });

        if (!inventory) {
          return { __error: true, status: 409, body: { error: `Inventory not found for variant ${invItem.variant_id}` } };
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
            store_id: storeId,
            variant_id: invItem.variant_id,
            change: refundQty,
            movement_type: 'refund',
            reference_id: String(invoiceId),
            reason: reason ? String(reason) : 'POS partial refund',
            created_by: Number(cashierId),
          },
        });
      }

      refundAuditDetails = {
        invoiceId,
        itemIds: parsedItems.map((item) => item.invoiceItemId),
        variantIds: invoiceItems.map((item) => item.variant_id).filter((variantId): variantId is number => typeof variantId === 'number'),
        quantities: parsedItems.map((item) => item.quantity),
        itemCount: parsedItems.length,
      };

      return {
        invoiceId,
        totalRefund,
      };
    });

    if (isRefundErrorResult(refundResult)) {
      return res.status(refundResult.status).json(refundResult.body);
    }

    const reasonText = reason ? String(reason) : '';
    const auditDetails = refundAuditDetails as RefundAuditDetails | null;
    await writeAuditLog({
      action: 'POS_REFUND_CREATED',
      objectType: 'invoice',
      objectId: auditDetails?.invoiceId !== undefined ? String(auditDetails.invoiceId) : String(refundResult.invoiceId),
      userId: getActorUserId(req),
      payload: {
        result: 'success',
        source: getAuditSource(req),
        storeId,
        invoiceId: auditDetails?.invoiceId ?? refundResult.invoiceId,
        effectiveCashierId: cashierId,
        refund: {
          totalRefund: refundResult.totalRefund,
          itemCount: auditDetails?.itemCount ?? parsedItems.length,
        },
        metadata: {
          itemIds: auditDetails?.itemIds ?? parsedItems.map((item) => item.invoiceItemId),
          variantIds: auditDetails?.variantIds ?? [],
          quantities: auditDetails?.quantities ?? parsedItems.map((item) => item.quantity),
          reasonPresent: reasonText.length > 0,
          reasonPreview: reasonText ? reasonText.slice(0, 80) : undefined,
        },
      },
    });

    return res.status(201).json({ refund: refundResult });
  } catch (err) {
    next(err);
  }
});

export default router;
