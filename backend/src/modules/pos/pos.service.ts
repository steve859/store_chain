import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { PosRepository } from './pos.repository';

type ActorContext = {
  userId: number | undefined;
  source: {
    ip: string | undefined;
    userAgent: string | null;
  };
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch {
    // Audit logging is best-effort for this phase.
  }
};

const safeInvoiceSnapshot = (invoice: unknown) => {
  const row = asRecord(invoice);
  return {
    id: row.id,
    store_id: row.store_id,
    created_by: row.created_by,
    payment_method: row.payment_method,
    subtotal: row.subtotal,
    discount: row.discount,
    tax: row.tax,
    total: row.total,
    created_at: row.created_at,
  };
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const decimalToNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value));
  return Number.isFinite(n) ? n : 0;
};

const getAggregateValue = (aggregate: unknown, section: string, field: string) => asRecord(asRecord(aggregate)[section])[field];

const parseCartItems = (items: unknown) =>
  Array.isArray(items)
    ? items
        .map((item) => {
          const record = asRecord(item);
          return { variantId: Number(record.variantId), quantity: Number(record.quantity) };
        })
        .filter((item) => Number.isFinite(item.variantId) && Number.isFinite(item.quantity) && item.quantity > 0)
    : [];

const isErrorResult = (value: unknown): value is { __error: true; status: number; body: { error: string } } =>
  Boolean(value && typeof value === 'object' && '__error' in value);

const isForbiddenActiveStore = (value: unknown) => '__forbiddenActiveStore' in asRecord(value);

const buildShiftResponse = async (storeId: number, shift: Record<string, unknown>, closedAt?: Date | null, differenceClosingCash?: number | null) => {
  const summary = await PosService.computeShiftSummary(storeId, shift.opened_at as Date, closedAt);
  const expectedCash = decimalToNumber(shift.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;
  const difference = differenceClosingCash !== undefined && differenceClosingCash !== null ? differenceClosingCash - expectedCash : undefined;

  return {
    storeId,
    id: shift.id,
    openedBy: shift.opened_by,
    openedAt: shift.opened_at,
    openingCash: decimalToNumber(shift.opening_cash),
    ...(shift.closed_by !== undefined ? { closedBy: shift.closed_by } : {}),
    ...(shift.closed_at !== undefined ? { closedAt: shift.closed_at } : {}),
    ...(shift.closing_cash !== undefined ? { closingCash: decimalToNumber(shift.closing_cash) } : {}),
    note: shift.note ?? null,
    status: shift.status,
    summary: difference !== undefined ? { ...summary, expectedCash, difference } : { ...summary, expectedCash },
  };
};

export const PosService = {
  toNumber,

  computeShiftSummary: async (storeId: number, openedAt: Date, closedAt?: Date | null) => {
    const end = closedAt ?? new Date();
    const [salesAgg, cashSalesAgg, cashInAgg, cashOutAgg] = await Promise.all([
      PosRepository.aggregateInvoices({
        where: {
          store_id: storeId,
          payment_method: { not: null },
          created_at: { gte: openedAt, lte: end },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      PosRepository.aggregateInvoices({
        where: {
          store_id: storeId,
          payment_method: 'cash',
          created_at: { gte: openedAt, lte: end },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      PosRepository.aggregateCashMovements({
        where: {
          store_id: storeId,
          created_at: { gte: openedAt, lte: end },
          type: 'cash_in',
        },
        _sum: { amount: true },
      }),
      PosRepository.aggregateCashMovements({
        where: {
          store_id: storeId,
          created_at: { gte: openedAt, lte: end },
          type: 'cash_out',
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalSales: decimalToNumber(getAggregateValue(salesAgg, '_sum', 'total')),
      transactionsCount: Number(getAggregateValue(salesAgg, '_count', '_all') ?? 0),
      cashSales: decimalToNumber(getAggregateValue(cashSalesAgg, '_sum', 'total')),
      cashTransactionsCount: Number(getAggregateValue(cashSalesAgg, '_count', '_all') ?? 0),
      cashIn: decimalToNumber(getAggregateValue(cashInAgg, '_sum', 'amount')),
      cashOut: decimalToNumber(getAggregateValue(cashOutAgg, '_sum', 'amount')),
    };
  },

  openShift: async ({ storeId, openedBy, openingCash, note }: { storeId: number; openedBy: number | null; openingCash: number; note: string | null }) => {
    if (!Number.isFinite(storeId) || !openedBy) {
      return { status: 'bad_request' as const, body: { error: 'openedBy is required' } };
    }
    if (openingCash < 0) {
      return { status: 'bad_request' as const, body: { error: 'openingCash must be >= 0' } };
    }

    const existing = await PosRepository.getOpenShift(storeId);
    if (existing) {
      const summary = await PosService.computeShiftSummary(storeId, existing.opened_at);
      const expectedCash = decimalToNumber(existing.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;
      return {
        status: 'conflict' as const,
        body: {
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
        },
      };
    }

    const created = await PosRepository.createShift({
      store_id: storeId,
      status: 'open',
      opened_by: Math.trunc(openedBy),
      opened_at: new Date(),
      opening_cash: openingCash,
      note,
    });

    if (openingCash > 0) {
      await PosRepository.createCashMovement({
        store_id: storeId,
        shift_id: created.id,
        type: 'cash_in',
        amount: openingCash,
        reason: 'Opening cash',
        created_by: Math.trunc(openedBy),
      });
    }

    return { status: 'created' as const, shift: await buildShiftResponse(storeId, created as Record<string, unknown>) };
  },

  closeShift: async ({
    storeId,
    closedBy,
    closingCash,
    note,
    actor,
  }: {
    storeId: number;
    closedBy: number | null;
    closingCash: number | null;
    note: string | null;
    actor: ActorContext;
  }) => {
    if (!Number.isFinite(storeId) || !closedBy || closingCash === null) {
      return { status: 'bad_request' as const, body: { error: 'closedBy, closingCash are required' } };
    }
    if (closingCash < 0) {
      return { status: 'bad_request' as const, body: { error: 'closingCash must be >= 0' } };
    }

    const open = await PosRepository.getOpenShift(storeId);
    if (!open) {
      return { status: 'not_found' as const, body: { error: 'No open shift found' } };
    }

    const closedAt = new Date();
    const updated = await PosRepository.updateShift(open.id, {
      status: 'closed',
      closed_by: Math.trunc(closedBy),
      closed_at: closedAt,
      closing_cash: closingCash,
      note,
    });

    const summary = await PosService.computeShiftSummary(storeId, open.opened_at, closedAt);
    const expectedCash = decimalToNumber(open.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;
    const difference = closingCash - expectedCash;
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
      userId: actor.userId,
      payload: {
        result: 'success',
        source: actor.source,
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

    return { status: 'created' as const, body: shiftResponse };
  },

  getCurrentShift: async (storeId: number) => {
    const open = await PosRepository.getOpenShift(storeId);
    if (!open) {
      return { shift: null };
    }

    return { shift: await buildShiftResponse(storeId, open as Record<string, unknown>) };
  },

  createCashMovement: async ({
    storeId,
    type,
    amount,
    reason,
    createdBy,
    actor,
  }: {
    storeId: number;
    type: string;
    amount: number | null;
    reason: string | null;
    createdBy: number | null;
    actor: ActorContext;
  }) => {
    if (!Number.isFinite(storeId)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid store' } };
    }
    if (!new Set(['cash_in', 'cash_out']).has(type)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid type' } };
    }
    if (amount === null || amount <= 0) {
      return { status: 'bad_request' as const, body: { error: 'amount must be > 0' } };
    }

    const open = await PosRepository.getOpenShift(storeId);
    if (!open) {
      return { status: 'conflict' as const, body: { error: 'No open shift. Please open shift first.' } };
    }

    const movement = await PosRepository.createCashMovement({
      store_id: storeId,
      shift_id: open.id,
      type,
      amount,
      reason,
      created_by: createdBy,
    });

    const summary = await PosService.computeShiftSummary(storeId, open.opened_at);
    const expectedCash = decimalToNumber(open.opening_cash) + summary.cashSales + summary.cashIn - summary.cashOut;
    const reasonText = reason ?? '';
    const movementRecord = asRecord(movement);
    await writeAuditLog({
      action: 'CASH_MOVEMENT_CREATED',
      objectType: 'cash_movement',
      objectId: movementRecord.id !== undefined && movementRecord.id !== null ? String(movementRecord.id) : undefined,
      userId: actor.userId,
      payload: {
        result: 'success',
        source: actor.source,
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

    return { status: 'created' as const, body: { movement, shiftId: open.id, summary: { ...summary, expectedCash } } };
  },

  listCashMovements: async (storeId: number, shiftId: number) => {
    if (!Number.isFinite(storeId) || !Number.isFinite(shiftId)) {
      return { status: 'bad_request' as const, body: { error: 'Invalid store/shift id' } };
    }

    const shift = await PosRepository.findShiftById(shiftId);
    if (!shift || shift.store_id !== storeId) {
      return { status: 'not_found' as const, body: { error: 'Shift not found' } };
    }

    const items = await PosRepository.findCashMovementsByShift(storeId, shiftId);
    return { status: 'ok' as const, items };
  },

  lookupInventory: async ({ storeId, barcode, variantId }: { storeId: number; barcode: string; variantId: number }) => {
    if (!barcode && !Number.isFinite(variantId)) {
      return { status: 'bad_request' as const, body: { error: 'Provide barcode or variantId' } };
    }

    const variant = barcode ? await PosRepository.findVariantByBarcode(barcode) : await PosRepository.findVariantById(variantId);
    if (!variant) {
      return { status: 'not_found' as const, body: { error: 'Variant not found' } };
    }

    const inventory = await PosRepository.findInventoryByStoreAndVariant(storeId, variant.id);
    return { status: 'ok' as const, variant, inventory };
  },

  getReceipt: async ({ invoiceId, activeStoreId }: { invoiceId: number; activeStoreId: number }) => {
    const invoice = await PosRepository.findReceiptInvoice(invoiceId);
    if (!invoice) {
      return { status: 'not_found' as const, body: { error: 'Invoice not found' } };
    }

    const invoiceStoreId = invoice.store_id !== undefined && invoice.store_id !== null ? Number(invoice.store_id) : NaN;
    if (!Number.isFinite(activeStoreId) || !Number.isFinite(invoiceStoreId) || invoiceStoreId !== activeStoreId) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: invoice does not belong to active store' } };
    }

    return {
      status: 'ok' as const,
      body: {
        invoice,
        receipt: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          createdAt: invoice.created_at,
          store: invoice.stores,
          cashier: invoice.users,
          customer: invoice.customers,
          items: invoice.invoice_items.map((item) => ({
            id: item.id,
            variantId: item.variant_id,
            name: item.product_variants?.name ?? item.product_variants?.products?.name ?? null,
            barcode: item.product_variants?.barcode ?? null,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
          })),
          subtotal: invoice.subtotal,
          tax: invoice.tax,
          discount: invoice.discount,
          total: invoice.total,
          paymentMethod: invoice.payment_method,
        },
      },
    };
  },

  checkout: async ({
    storeId,
    cashierId,
    body,
    actor,
  }: {
    storeId: number;
    cashierId: number | null;
    body: Record<string, unknown>;
    actor: ActorContext;
  }) => {
    const { customerId, paymentMethod, items, discount, tax } = body;
    if (!Number.isFinite(storeId) || !cashierId || !paymentMethod || !Array.isArray(items) || items.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'Missing required fields' } };
    }

    const parsedItems = parseCartItems(items);
    if (parsedItems.length !== items.length) {
      return { status: 'bad_request' as const, body: { error: 'Invalid items' } };
    }

    const openShift = await PosRepository.getOpenShift(storeId);
    if (!openShift) {
      return { status: 'conflict' as const, body: { error: 'No open shift. Please open shift before checkout.' } };
    }

    const invoice = await PosRepository.checkout({
      storeId,
      cashierId,
      customerId,
      paymentMethod: String(paymentMethod),
      items: parsedItems,
      discount,
      tax,
    });

    const invoiceRecord = asRecord(invoice);
    await writeAuditLog({
      action: 'POS_CHECKOUT_COMPLETED',
      objectType: 'invoice',
      objectId: invoiceRecord.id !== undefined && invoiceRecord.id !== null ? String(invoiceRecord.id) : undefined,
      userId: actor.userId,
      payload: {
        result: 'success',
        source: actor.source,
        storeId,
        invoiceId: invoiceRecord.id,
        after: safeInvoiceSnapshot(invoice),
        metadata: {
          itemCount: parsedItems.length,
          variantIds: parsedItems.map((item) => item.variantId),
          quantities: parsedItems.map((item) => item.quantity),
          stockMovementType: 'sale',
        },
      },
    });

    return { status: 'created' as const, invoice };
  },

  hold: async ({ storeId, cashierId, body }: { storeId: number; cashierId: number | null; body: Record<string, unknown> }) => {
    const { customerId, items } = body;
    if (!Number.isFinite(storeId) || !cashierId || !Array.isArray(items) || items.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'Missing required fields' } };
    }

    const parsedItems = parseCartItems(items);
    if (parsedItems.length !== items.length) {
      return { status: 'bad_request' as const, body: { error: 'Invalid items' } };
    }

    const invoice = await PosRepository.hold({ storeId, cashierId, customerId, items: parsedItems });
    return { status: 'created' as const, invoice };
  },

  resumeCheckout: async ({ invoiceId, paymentMethod, activeStoreId }: { invoiceId: number; paymentMethod: unknown; activeStoreId: number }) => {
    if (!Number.isFinite(invoiceId) || !paymentMethod) {
      return { status: 'bad_request' as const, body: { error: 'Invalid request' } };
    }

    const result = await PosRepository.resumeCheckout({ invoiceId, paymentMethod: String(paymentMethod), activeStoreId });
    if (!result) {
      return { status: 'not_found' as const, body: { error: 'Invoice not found' } };
    }

    if (isForbiddenActiveStore(result)) {
      return { status: 'forbidden' as const, body: { error: 'Forbidden: invoice does not belong to active store' } };
    }

    return { status: 'ok' as const, invoice: result };
  },

  refund: async ({
    storeId,
    cashierId,
    body,
    actor,
  }: {
    storeId: number;
    cashierId: number | null;
    body: Record<string, unknown>;
    actor: ActorContext;
  }) => {
    const { items, reason } = body;
    if (!Number.isFinite(storeId) || !cashierId || !Array.isArray(items) || items.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'Missing required fields' } };
    }

    const parsedItems = items
      .map((item) => {
        const record = asRecord(item);
        return { invoiceItemId: Number(record.invoiceItemId), quantity: Number(record.quantity) };
      })
      .filter((item) => Number.isFinite(item.invoiceItemId) && Number.isFinite(item.quantity) && item.quantity > 0);

    if (parsedItems.length !== items.length) {
      return { status: 'bad_request' as const, body: { error: 'Invalid items' } };
    }

    const result = await PosRepository.refund({ storeId, cashierId, items: parsedItems, reason });
    if (isErrorResult(result.refund)) {
      return { status: 'error' as const, result: result.refund };
    }

    const reasonText = reason ? String(reason) : '';
    const auditDetails = asRecord(result.auditDetails);
    await writeAuditLog({
      action: 'POS_REFUND_CREATED',
      objectType: 'invoice',
      objectId: auditDetails.invoiceId !== undefined ? String(auditDetails.invoiceId) : String(asRecord(result.refund).invoiceId),
      userId: actor.userId,
      payload: {
        result: 'success',
        source: actor.source,
        storeId,
        invoiceId: auditDetails.invoiceId ?? asRecord(result.refund).invoiceId,
        effectiveCashierId: cashierId,
        refund: {
          totalRefund: asRecord(result.refund).totalRefund,
          itemCount: auditDetails.itemCount ?? parsedItems.length,
        },
        metadata: {
          itemIds: Array.isArray(auditDetails.itemIds) ? auditDetails.itemIds : parsedItems.map((item) => item.invoiceItemId),
          variantIds: Array.isArray(auditDetails.variantIds) ? auditDetails.variantIds : [],
          quantities: Array.isArray(auditDetails.quantities) ? auditDetails.quantities : parsedItems.map((item) => item.quantity),
          reasonPresent: reasonText.length > 0,
          reasonPreview: reasonText ? reasonText.slice(0, 80) : undefined,
        },
      },
    });

    return { status: 'created' as const, refund: result.refund };
  },
};
