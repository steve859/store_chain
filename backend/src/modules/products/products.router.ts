import { Router } from 'express';
import prisma from '../../db/prisma';
import { Prisma } from '../../generated/prisma';

const router = Router();

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

const toDecimalOptional = (value: unknown): Prisma.Decimal | null => {
  if (value === null || value === undefined || value === '') return null;
  return toDecimal(value);
};

/**
 * UC-M1: Product list
 * GET /api/v1/products?take=50&skip=0&q=milk
 */
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    const where: Prisma.productsWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.products.findMany({
        where,
        include: { product_variants: true },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.products.count({ where }),
    ]);

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M1: Store catalog view (variants + product + store inventory)
 * GET /api/v1/products/catalog?storeId=1&q=milk&barcode=...&take=50&skip=0
 */
router.get('/catalog', async (req, res, next) => {
  try {
    const storeId = req.query.storeId ? Number(req.query.storeId) : NaN;
    const q = String(req.query.q ?? '').trim();
    const barcode = String(req.query.barcode ?? '').trim();
    const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
    const skip = req.query.skip ? Number(req.query.skip) : 0;

    if (!Number.isFinite(storeId)) {
      return res.status(400).json({ error: 'storeId query param is required' });
    }

    const where: Prisma.product_variantsWhereInput = {
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
    };

    const [variants, total] = await Promise.all([
      prisma.product_variants.findMany({
        where,
        include: {
          products: true,
          inventories: { where: { store_id: storeId } },
        },
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      prisma.product_variants.count({ where }),
    ]);

    const items = variants.map((variant) => ({
      variant,
      product: variant.products,
      inventory: variant.inventories[0] ?? null,
    }));

    return res.json({ items, total, take, skip });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M1: Product details (includes variants)
 * GET /api/v1/products/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const product = await prisma.products.findUnique({
      where: { id: productId },
      include: { product_variants: true },
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ product });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M1: Create product (optionally with variants)
 * POST /api/v1/products
 * Body:
 * {
 *   sku?: string,
 *   name: string,
 *   brand?: string,
 *   category?: string,
 *   description?: string,
 *   unit: string,
 *   isActive?: boolean,
 *   variants?: Array<{ variantCode?: string, name?: string, barcode?: string, price?: number, costPrice?: number, minStock?: number, isActive?: boolean }>
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sku = body.sku !== undefined && body.sku !== null && String(body.sku).trim() !== '' ? String(body.sku) : null;
    const name = body.name !== undefined && body.name !== null ? String(body.name).trim() : '';
    const unit = body.unit !== undefined && body.unit !== null ? String(body.unit).trim() : '';
    const brand = body.brand !== undefined && body.brand !== null && String(body.brand).trim() !== '' ? String(body.brand) : null;
    const category = body.category !== undefined && body.category !== null && String(body.category).trim() !== '' ? String(body.category) : null;
    const description =
      body.description !== undefined && body.description !== null && String(body.description).trim() !== '' ? String(body.description) : null;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;

    if (!name || !unit) {
      return res.status(400).json({ error: 'name and unit are required' });
    }

    const variants = Array.isArray(body.variants) ? (body.variants as unknown[]) : [];

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.products.create({
        data: {
          sku,
          name,
          brand,
          category,
          description,
          unit,
          is_active: isActive,
        },
      });

      for (const item of variants) {
        const v = (item ?? {}) as Record<string, unknown>;
        await tx.product_variants.create({
          data: {
            product_id: product.id,
            variant_code:
              v.variantCode !== undefined && v.variantCode !== null && String(v.variantCode).trim() !== '' ? String(v.variantCode) : null,
            name: v.name !== undefined && v.name !== null && String(v.name).trim() !== '' ? String(v.name) : null,
            barcode: v.barcode !== undefined && v.barcode !== null && String(v.barcode).trim() !== '' ? String(v.barcode) : null,
            price: v.price !== undefined ? toDecimal(v.price) : new Prisma.Decimal(0),
            cost_price: v.costPrice !== undefined ? toDecimalOptional(v.costPrice) ?? new Prisma.Decimal(0) : new Prisma.Decimal(0),
            min_stock: toDecimalOptional(v.minStock),
            is_active: v.isActive !== undefined ? Boolean(v.isActive) : true,
          },
        });
      }

      return tx.products.findUnique({ where: { id: product.id }, include: { product_variants: true } });
    });

    return res.status(201).json({ product: created });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M1: Update product
 * PUT /api/v1/products/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.productsUpdateInput = {};
    if (body.sku !== undefined) data.sku = body.sku === null || String(body.sku).trim() === '' ? null : String(body.sku);
    if (body.name !== undefined) data.name = String(body.name);
    if (body.brand !== undefined) data.brand = body.brand === null || String(body.brand).trim() === '' ? null : String(body.brand);
    if (body.category !== undefined) data.category = body.category === null || String(body.category).trim() === '' ? null : String(body.category);
    if (body.description !== undefined)
      data.description = body.description === null || String(body.description).trim() === '' ? null : String(body.description);
    if (body.unit !== undefined) data.unit = String(body.unit);
    if (body.isActive !== undefined) data.is_active = Boolean(body.isActive);

    const updated = await prisma.products.update({
      where: { id: productId },
      data,
    });

    return res.json({ product: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M1: Create variant under a product
 * POST /api/v1/products/:id/variants
 */
router.post('/:id/variants', async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const price = body.price !== undefined ? toDecimal(body.price) : new Prisma.Decimal(0);
    const costPrice = body.costPrice !== undefined ? toDecimalOptional(body.costPrice) ?? new Prisma.Decimal(0) : new Prisma.Decimal(0);

    const created = await prisma.product_variants.create({
      data: {
        product_id: productId,
        variant_code: body.variantCode !== undefined && body.variantCode !== null && String(body.variantCode).trim() !== '' ? String(body.variantCode) : null,
        name: body.name !== undefined && body.name !== null && String(body.name).trim() !== '' ? String(body.name) : null,
        barcode: body.barcode !== undefined && body.barcode !== null && String(body.barcode).trim() !== '' ? String(body.barcode) : null,
        price,
        cost_price: costPrice,
        min_stock: toDecimalOptional(body.minStock),
        is_active: body.isActive !== undefined ? Boolean(body.isActive) : true,
      },
    });

    return res.status(201).json({ variant: created });
  } catch (err) {
    next(err);
  }
});

/**
 * UC-M1: Update variant
 * PUT /api/v1/products/variants/:variantId
 */
router.put('/variants/:variantId', async (req, res, next) => {
  try {
    const variantId = Number(req.params.variantId);
    if (!Number.isFinite(variantId)) {
      return res.status(400).json({ error: 'Invalid variant id' });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.product_variantsUpdateInput = {};
    if (body.variantCode !== undefined) data.variant_code = body.variantCode === null || String(body.variantCode).trim() === '' ? null : String(body.variantCode);
    if (body.name !== undefined) data.name = body.name === null || String(body.name).trim() === '' ? null : String(body.name);
    if (body.barcode !== undefined) data.barcode = body.barcode === null || String(body.barcode).trim() === '' ? null : String(body.barcode);
    if (body.price !== undefined) data.price = toDecimal(body.price);
    if (body.costPrice !== undefined) data.cost_price = toDecimalOptional(body.costPrice) ?? new Prisma.Decimal(0);
    if (body.minStock !== undefined) data.min_stock = toDecimalOptional(body.minStock);
    if (body.isActive !== undefined) data.is_active = Boolean(body.isActive);

    const updated = await prisma.product_variants.update({ where: { id: variantId }, data });
    return res.json({ variant: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
