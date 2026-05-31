import { Prisma } from '@prisma/client';
import { invalidateCatalogCache } from '../../lib/cache/catalog';
import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { ProductsRepository } from './products.repository';

type AuditSource = {
  ip: string | undefined;
  userAgent: string | null;
};

type ProductListParams = {
  q: string;
  take: number;
  skip: number;
};

type CatalogParams = ProductListParams & {
  barcode: string;
  storeId: number;
};

type VariantPriceHistoryParams = {
  storeId: number;
  variantId: number | null;
  take: number;
  skip: number;
};

type VariantPriceAuditParams = {
  userId: number | undefined;
  source: AuditSource;
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

const safeVariantPriceSnapshot = (price: unknown) => {
  if (!price) return null;
  const row = asRecord(price);
  return {
    id: row.id !== undefined && row.id !== null ? String(row.id) : undefined,
    storeId: row.store_id ?? row.storeId,
    variantId: row.variant_id ?? row.variantId,
    price: row.price,
    startAt: row.start_at ?? row.startAt,
    endAt: row.end_at ?? row.endAt ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
  };
};

export const toDecimal = (value: unknown): Prisma.Decimal => {
  if (value === null || value === undefined || value === '') {
    throw new Error('Invalid decimal value');
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new Error('Invalid decimal value');
  }
  return new Prisma.Decimal(num);
};

export const toDecimalOptional = (value: unknown): Prisma.Decimal | null => {
  if (value === null || value === undefined || value === '') return null;
  return toDecimal(value);
};

export const parseDateOptional = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
};

const buildProductWhere = (q: string): Prisma.productsWhereInput =>
  q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

const buildCatalogWhere = ({ q, barcode }: Pick<CatalogParams, 'q' | 'barcode'>): Prisma.product_variantsWhereInput => ({
  is_active: true,
  ...(barcode ? { barcode } : {}),
  ...(q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { variant_code: { contains: q, mode: 'insensitive' } },
          { barcode: { contains: q, mode: 'insensitive' } },
          { products: { is: { name: { contains: q, mode: 'insensitive' } } } },
          { products: { is: { sku: { contains: q, mode: 'insensitive' } } } },
        ],
      }
    : {}),
});

const buildProductCreateData = (body: Record<string, unknown>): Prisma.productsCreateInput => ({
  sku: body.sku !== undefined && body.sku !== null && String(body.sku).trim() !== '' ? String(body.sku) : null,
  name: body.name !== undefined && body.name !== null ? String(body.name).trim() : '',
  brand: body.brand !== undefined && body.brand !== null && String(body.brand).trim() !== '' ? String(body.brand) : null,
  category: body.category !== undefined && body.category !== null && String(body.category).trim() !== '' ? String(body.category) : null,
  description: body.description !== undefined && body.description !== null && String(body.description).trim() !== '' ? String(body.description) : null,
  unit: body.unit !== undefined && body.unit !== null ? String(body.unit).trim() : '',
  is_active: body.isActive !== undefined ? Boolean(body.isActive) : true,
});

const buildVariantCreateData = (productId: number, body: Record<string, unknown>): Prisma.product_variantsUncheckedCreateInput => ({
  product_id: productId,
  variant_code: body.variantCode !== undefined && body.variantCode !== null && String(body.variantCode).trim() !== '' ? String(body.variantCode) : null,
  name: body.name !== undefined && body.name !== null && String(body.name).trim() !== '' ? String(body.name) : null,
  barcode: body.barcode !== undefined && body.barcode !== null && String(body.barcode).trim() !== '' ? String(body.barcode) : null,
  price: body.price !== undefined ? toDecimal(body.price) : new Prisma.Decimal(0),
  cost_price: body.costPrice !== undefined ? toDecimalOptional(body.costPrice) ?? new Prisma.Decimal(0) : new Prisma.Decimal(0),
  min_stock: toDecimalOptional(body.minStock),
  is_active: body.isActive !== undefined ? Boolean(body.isActive) : true,
});

const buildProductUpdateData = (body: Record<string, unknown>): Prisma.productsUpdateInput => {
  const data: Prisma.productsUpdateInput = {};
  if (body.sku !== undefined) data.sku = body.sku === null || String(body.sku).trim() === '' ? null : String(body.sku);
  if (body.name !== undefined) data.name = String(body.name);
  if (body.brand !== undefined) data.brand = body.brand === null || String(body.brand).trim() === '' ? null : String(body.brand);
  if (body.category !== undefined) data.category = body.category === null || String(body.category).trim() === '' ? null : String(body.category);
  if (body.description !== undefined) data.description = body.description === null || String(body.description).trim() === '' ? null : String(body.description);
  if (body.unit !== undefined) data.unit = String(body.unit);
  if (body.isActive !== undefined) data.is_active = Boolean(body.isActive);
  return data;
};

const buildVariantUpdateData = (body: Record<string, unknown>): Prisma.product_variantsUpdateInput => {
  const data: Prisma.product_variantsUpdateInput = {};
  if (body.variantCode !== undefined) data.variant_code = body.variantCode === null || String(body.variantCode).trim() === '' ? null : String(body.variantCode);
  if (body.name !== undefined) data.name = body.name === null || String(body.name).trim() === '' ? null : String(body.name);
  if (body.barcode !== undefined) data.barcode = body.barcode === null || String(body.barcode).trim() === '' ? null : String(body.barcode);
  if (body.price !== undefined) data.price = toDecimal(body.price);
  if (body.costPrice !== undefined) data.cost_price = toDecimalOptional(body.costPrice) ?? new Prisma.Decimal(0);
  if (body.minStock !== undefined) data.min_stock = toDecimalOptional(body.minStock);
  if (body.isActive !== undefined) data.is_active = Boolean(body.isActive);
  return data;
};

export const ProductsService = {
  listProducts: async ({ q, take, skip }: ProductListParams) => {
    const where = buildProductWhere(q);
    const [items, total] = await Promise.all([
      ProductsRepository.findProducts({ where, take, skip }),
      ProductsRepository.countProducts(where),
    ]);

    return { items, total, take, skip };
  },

  getCatalog: async ({ q, barcode, take, skip, storeId }: CatalogParams) => {
    const where = buildCatalogWhere({ q, barcode });
    const [variants, total] = await Promise.all([
      ProductsRepository.findCatalogVariants({ where, storeId, take, skip }),
      ProductsRepository.countCatalogVariants(where),
    ]);

    const now = new Date();
    const variantIds = variants.map((variant) => variant.id);
    const priceRows = await ProductsRepository.findActiveVariantPrices(storeId, variantIds, now);
    const priceByVariantId = new Map<number, unknown>(priceRows.map((price) => [price.variant_id, price.price]));

    const items = variants.map((variant) => {
      const override = priceByVariantId.get(variant.id);
      const effectivePrice = override ?? variant.price;
      return {
        variant: { ...variant, price: effectivePrice },
        product: variant.products,
        inventory: variant.inventories[0] ?? null,
      };
    });

    return { items, total, take, skip };
  },

  getVariantPrices: async ({ storeId, variantId, take, skip }: VariantPriceHistoryParams) => {
    if (!Number.isFinite(storeId) || !variantId || !Number.isFinite(variantId)) {
      return { status: 'invalid' as const };
    }

    const [items, total] = await Promise.all([
      ProductsRepository.findVariantPrices({ storeId, variantId, take, skip }),
      ProductsRepository.countVariantPrices(storeId, variantId),
    ]);

    return { status: 'ok' as const, data: { items, total, take, skip } };
  },

  setVariantPrice: async (
    { storeId, variantId, price, startAt, userId }: { storeId: number; variantId: number; price: Prisma.Decimal; startAt: Date; userId: number | null },
    audit: VariantPriceAuditParams,
  ) => {
    if (!Number.isFinite(storeId) || !Number.isFinite(variantId)) {
      return { status: 'invalid' as const };
    }

    const { created, closedPriorWindow } = await ProductsRepository.setVariantPrice(storeId, variantId, price, startAt, userId);

    await invalidateCatalogCache(storeId);
    await writeAuditLog({
      action: 'VARIANT_PRICE_SET',
      objectType: 'variant_price',
      objectId: created?.id !== undefined && created?.id !== null ? String(created.id) : undefined,
      userId: audit.userId,
      payload: {
        result: 'success',
        source: audit.source,
        storeId,
        after: safeVariantPriceSnapshot(created),
        metadata: {
          variantId,
          price,
          startAt,
          closedPriorWindow,
        },
      },
    });

    return { status: 'ok' as const, price: created };
  },

  closeVariantPrice: async (
    { storeId, variantId, endAt, userId }: { storeId: number; variantId: number; endAt: Date; userId: number | null },
    audit: VariantPriceAuditParams,
  ) => {
    if (!Number.isFinite(storeId) || !Number.isFinite(variantId)) {
      return { status: 'invalid' as const };
    }

    const { beforeClose, closed } = await ProductsRepository.closeVariantPrice(storeId, variantId, endAt, userId);

    await invalidateCatalogCache(storeId);
    await writeAuditLog({
      action: 'VARIANT_PRICE_CLOSED',
      objectType: 'variant_price',
      objectId: closed?.id !== undefined && closed?.id !== null ? String(closed.id) : undefined,
      userId: audit.userId,
      payload: {
        result: 'success',
        source: audit.source,
        storeId,
        before: safeVariantPriceSnapshot(beforeClose),
        after: safeVariantPriceSnapshot(closed),
        metadata: {
          variantId,
          endAt,
        },
      },
    });

    return { status: 'ok' as const, price: closed };
  },

  getProductById: (productId: number) => ProductsRepository.findProductById(productId),

  createProduct: (body: Record<string, unknown>) => {
    const productData = buildProductCreateData(body);
    const variants = Array.isArray(body.variants) ? (body.variants as unknown[]).map((variant) => buildVariantCreateData(0, asRecord(variant))) : [];
    return ProductsRepository.createProductWithVariants(productData, variants);
  },

  updateProduct: (productId: number, body: Record<string, unknown>) => ProductsRepository.updateProduct(productId, buildProductUpdateData(body)),

  createVariant: (productId: number, body: Record<string, unknown>) => ProductsRepository.createVariant(buildVariantCreateData(productId, body)),

  updateVariant: (variantId: number, body: Record<string, unknown>) => ProductsRepository.updateVariant(variantId, buildVariantUpdateData(body)),
};
