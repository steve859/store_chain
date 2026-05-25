import { Prisma } from '@prisma/client';
import { ReturnsRepository } from './returns.repository';

type ActorContext = {
  userId: number | null;
  role: string;
  auditSource: {
    ip: string | undefined;
    userAgent: string | null;
  };
};

type RouteErrorResult = { __error: true; status: number; body: { error: string } };

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

const generateReturnNumber = (): string => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RTN-${Date.now()}-${rand}`;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const isErrorResult = (value: unknown): value is RouteErrorResult =>
  Boolean(value && typeof value === 'object' && '__error' in value);

const mapReturnedQuantities = (returnedAgg: Awaited<ReturnType<typeof ReturnsRepository.groupReturnedItems>>) => {
  const returnedByInvoiceItemId = new Map<number, Prisma.Decimal>();
  for (const row of returnedAgg) {
    const key = row.invoice_item_id;
    if (typeof key === 'number') {
      returnedByInvoiceItemId.set(key, row._sum.quantity ?? new Prisma.Decimal(0));
    }
  }

  return returnedByInvoiceItemId;
};

export const ReturnsService = {
  listInvoices: async ({
    storeId,
    from,
    to,
    take,
    skip,
  }: {
    storeId: number;
    from: Date | null;
    to: Date | null;
    take: number;
    skip: number;
  }) => {
    const where: Prisma.invoicesWhereInput = {
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

    const [items, total] = await ReturnsRepository.listInvoices({ where, take, skip });
    return { items, total, take, skip };
  },

  getInvoiceForReturn: async ({ storeId, invoiceId }: { storeId: number; invoiceId: number }) => {
    const invoice = await ReturnsRepository.findInvoiceForReturn(invoiceId);
    if (!invoice) {
      return { status: 'not_found' as const };
    }
    if (Number(invoice.store_id) !== Number(storeId)) {
      return { status: 'forbidden' as const, body: { error: 'Invoice does not belong to this store' } };
    }

    const invoiceItemIds = invoice.invoice_items.map((item) => item.id);
    const returnedByInvoiceItemId = mapReturnedQuantities(await ReturnsRepository.groupReturnedItems(invoiceItemIds));
    const items = invoice.invoice_items.map((item) => {
      const returned = returnedByInvoiceItemId.get(item.id) ?? new Prisma.Decimal(0);
      const sold = item.quantity ?? new Prisma.Decimal(0);
      const remaining = sold.sub(returned);
      return {
        invoiceItemId: item.id,
        variantId: item.variant_id,
        name: item.product_variants?.products?.name ?? item.product_variants?.name ?? null,
        sku: item.product_variants?.products?.sku ?? item.product_variants?.variant_code ?? null,
        unitPrice: item.unit_price,
        soldQty: sold,
        returnedQty: returned,
        remainingQty: remaining,
      };
    });

    return { status: 'ok' as const, invoice, items };
  },

  createReturn: async ({
    storeId,
    body,
    actor,
  }: {
    storeId: number;
    body: Record<string, unknown>;
    actor: ActorContext;
  }) => {
    const invoiceId = Number(body.invoiceId);
    const refundMethod = body.refundMethod ? String(body.refundMethod) : null;
    const restock = body.restock !== undefined ? Boolean(body.restock) : true;
    const reason = body.reason ? String(body.reason) : null;
    const note = body.note ? String(body.note) : null;
    const bodyItems = Array.isArray(body.items) ? body.items : null;

    if (!Number.isFinite(storeId) || !Number.isFinite(invoiceId) || !bodyItems || bodyItems.length === 0) {
      return { status: 'bad_request' as const, body: { error: 'invoiceId and non-empty items are required' } };
    }

    let parsedItems: Array<{ invoiceItemId: number; quantity: Prisma.Decimal; reason: string | null }>;
    try {
      parsedItems = bodyItems
        .map((item) => {
          const record = asRecord(item);
          return {
            invoiceItemId: Number(record.invoiceItemId),
            quantity: toDecimal(record.quantity),
            reason: record.reason ? String(record.reason) : null,
          };
        })
        .filter((item) => Number.isFinite(item.invoiceItemId) && item.quantity.gt(0));
    } catch {
      return { status: 'bad_request' as const, body: { error: 'Invalid items payload' } };
    }

    if (parsedItems.length !== bodyItems.length) {
      return { status: 'bad_request' as const, body: { error: 'Invalid items payload' } };
    }

    const result = await ReturnsRepository.createStandardReturn({
      storeId,
      createdBy: actor.userId,
      role: actor.role,
      invoiceId,
      refundMethod,
      restock,
      reason,
      note,
      parsedItems,
      returnNumber: generateReturnNumber(),
      auditSource: actor.auditSource,
    });

    if (isErrorResult(result)) {
      return { status: 'error' as const, result };
    }

    return { status: 'created' as const, result };
  },

  listReturns: async ({ storeId, take, skip, q }: { storeId: number; take: number; skip: number; q: string }) => {
    const where: Prisma.returnsWhereInput = {
      store_id: storeId,
      ...(q
        ? {
            OR: [
              { return_number: { contains: q, mode: 'insensitive' } },
              { invoices: { is: { invoice_number: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await ReturnsRepository.listReturns({ where, take, skip });
    return { items, total, take, skip };
  },

  getReturnDetail: async ({ storeId, id }: { storeId: number; id: number }) => {
    const item = await ReturnsRepository.findReturnDetail(id);
    if (!item || Number(item.store_id) !== Number(storeId)) {
      return { status: 'not_found' as const };
    }

    return { status: 'ok' as const, item };
  },

  createManagerRefund: async ({
    storeId,
    body,
    actor,
  }: {
    storeId: number;
    body: Record<string, unknown>;
    actor: ActorContext;
  }) => {
    const { createdBy, items, reason } = body;
    const createdByEffective = Number.isFinite(actor.userId)
      ? actor.userId
      : createdBy !== undefined && createdBy !== null
        ? Number(createdBy)
        : null;

    if (!createdByEffective || !Array.isArray(items) || items.length === 0) {
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

    const refundResult = await ReturnsRepository.createManagerRefund({
      storeId,
      createdByEffective,
      items: parsedItems,
      reason,
      auditSource: actor.auditSource,
    });

    if (isErrorResult(refundResult)) {
      return { status: 'error' as const, result: refundResult };
    }

    return { status: 'created' as const, refund: refundResult };
  },
};
