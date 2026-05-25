import type { Prisma } from '@prisma/client';
import { InvoicesRepository } from './invoices.repository';

type InvoiceListParams = {
  q: string;
  take: number;
  skip: number;
  isAdmin: boolean;
  queryStoreId: number;
  activeStoreId: number;
};

type InvoiceDetailParams = {
  invoiceId: number;
  isAdmin: boolean;
  activeStoreId: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const resolveListStoreId = ({ isAdmin, queryStoreId, activeStoreId }: Pick<InvoiceListParams, 'isAdmin' | 'queryStoreId' | 'activeStoreId'>) => {
  if (isAdmin) {
    if (Number.isFinite(queryStoreId)) return queryStoreId;
    if (Number.isFinite(activeStoreId)) return activeStoreId;
    return undefined;
  }

  return Number.isFinite(activeStoreId) ? activeStoreId : undefined;
};

const buildInvoiceWhere = ({ q, isAdmin, queryStoreId, activeStoreId }: InvoiceListParams): Prisma.invoicesWhereInput => {
  const storeId = resolveListStoreId({ isAdmin, queryStoreId, activeStoreId });
  const qAsId = Number(q);
  const searchOr: Prisma.invoicesWhereInput[] = [
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
  ];

  return {
    ...(storeId !== undefined ? { store_id: storeId } : {}),
    ...(q ? { OR: searchOr } : {}),
  };
};

const getCashierName = (invoice: Record<string, unknown>) => {
  const user = asRecord(invoice.users);
  return user.full_name || user.username || user.email || null;
};

const mapInvoiceListItem = (invoice: unknown) => {
  const inv = asRecord(invoice);
  const store = asRecord(inv.stores);
  const count = asRecord(inv._count);

  return {
    id: inv.id,
    cashier_name: getCashierName(inv),
    store_name: store.name || null,
    store_code: store.code || null,
    items_count: count.invoice_items ?? 0,
    total_amount: inv.total,
    paid_amount: null,
    payment_method: inv.payment_method,
    created_at: inv.created_at,
    status: 'completed',
  };
};

const mapInvoiceOrder = (invoice: unknown) => {
  const inv = asRecord(invoice);
  const store = asRecord(inv.stores);
  const invoiceItems = Array.isArray(inv.invoice_items) ? inv.invoice_items : [];

  return {
    id: inv.id,
    cashier_name: getCashierName(inv),
    store_name: store.name || null,
    store_code: store.code || null,
    items_count: invoiceItems.length,
    total_amount: inv.total,
    paid_amount: null,
    payment_method: inv.payment_method,
    created_at: inv.created_at,
    status: 'completed',
  };
};

const mapInvoiceItems = (invoice: unknown) => {
  const inv = asRecord(invoice);
  const invoiceItems = Array.isArray(inv.invoice_items) ? inv.invoice_items : [];

  return invoiceItems.map((item) => {
    const it = asRecord(item);
    const variant = asRecord(it.product_variants);
    const product = asRecord(variant.products);
    return {
      id: it.id,
      product_name: product.name || variant.name || '(KhÃ´ng rÃµ)',
      sku_code: product.sku || variant.variant_code || variant.barcode || '',
      unit: product.unit || '',
      quantity: it.quantity,
      price: it.unit_price,
    };
  });
};

export const InvoicesService = {
  listInvoices: async (params: InvoiceListParams) => {
    const where = buildInvoiceWhere(params);
    const [rows, total] = await Promise.all([
      InvoicesRepository.findMany({ where, take: params.take, skip: params.skip }),
      InvoicesRepository.count(where),
    ]);

    return {
      items: rows.map(mapInvoiceListItem),
      total,
      take: params.take,
      skip: params.skip,
    };
  },

  getInvoiceDetail: async ({ invoiceId, isAdmin, activeStoreId }: InvoiceDetailParams) => {
    const invoice = await InvoicesRepository.findDetailById(invoiceId);
    if (!invoice) {
      return { status: 'not_found' as const };
    }

    const invoiceRecord = asRecord(invoice);
    const invoiceStoreId = invoiceRecord.store_id !== undefined && invoiceRecord.store_id !== null ? Number(invoiceRecord.store_id) : NaN;
    if (!isAdmin && (!Number.isFinite(activeStoreId) || !Number.isFinite(invoiceStoreId) || invoiceStoreId !== activeStoreId)) {
      return { status: 'forbidden' as const };
    }

    return {
      status: 'ok' as const,
      data: {
        order: mapInvoiceOrder(invoice),
        items: mapInvoiceItems(invoice),
      },
    };
  },
};
