import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

export const ProductsRepository = {
  findProducts: ({ where, take, skip }: { where: Prisma.productsWhereInput; take: number; skip: number }) =>
    prisma.products.findMany({
      where,
      include: { product_variants: true },
      orderBy: { id: 'desc' },
      take,
      skip,
    }),

  countProducts: (where: Prisma.productsWhereInput) => prisma.products.count({ where }),

  findCatalogVariants: ({ where, storeId, take, skip }: { where: Prisma.product_variantsWhereInput; storeId: number; take: number; skip: number }) =>
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

  countCatalogVariants: (where: Prisma.product_variantsWhereInput) => prisma.product_variants.count({ where }),

  findActiveVariantPrices: (storeId: number, variantIds: number[], now: Date) =>
    prisma.variant_prices.findMany({
      where: {
        store_id: storeId,
        variant_id: { in: variantIds },
        start_at: { lte: now },
        OR: [{ end_at: null }, { end_at: { gt: now } }],
      },
      orderBy: { start_at: 'desc' },
      distinct: ['variant_id'],
    }),

  findVariantPrices: ({ storeId, variantId, take, skip }: { storeId: number; variantId: number; take: number; skip: number }) =>
    prisma.variant_prices.findMany({
      where: { store_id: storeId, variant_id: variantId },
      include: { users: true },
      orderBy: { start_at: 'desc' },
      take,
      skip,
    }),

  countVariantPrices: (storeId: number, variantId: number) => prisma.variant_prices.count({ where: { store_id: storeId, variant_id: variantId } }),

  setVariantPrice: (
    storeId: number,
    variantId: number,
    price: Prisma.Decimal,
    startAt: Date,
    userId: number | null,
  ) =>
    prisma.$transaction(async (tx) => {
      const variant = await tx.product_variants.findUnique({ where: { id: variantId } });
      if (!variant) throw new Error('Variant not found');

      const future = await tx.variant_prices.findFirst({
        where: {
          store_id: storeId,
          variant_id: variantId,
          start_at: { gte: startAt },
          OR: [{ end_at: null }, { end_at: { gt: startAt } }],
        },
        orderBy: { start_at: 'asc' },
      });
      if (future) {
        throw new Error('Conflicting future price exists. Close or delete it first.');
      }

      const closed = await tx.variant_prices.updateMany({
        where: {
          store_id: storeId,
          variant_id: variantId,
          end_at: null,
          start_at: { lt: startAt },
        },
        data: { end_at: startAt },
      });

      const created = await tx.variant_prices.create({
        data: {
          store_id: storeId,
          variant_id: variantId,
          price,
          start_at: startAt,
          end_at: null,
          created_by: Number.isFinite(userId) ? userId : null,
        },
      });

      return { created, closedPriorWindow: Number(closed.count ?? 0) > 0 };
    }),

  closeVariantPrice: (storeId: number, variantId: number, endAt: Date, userId: number | null) =>
    prisma.$transaction(async (tx) => {
      const current = await tx.variant_prices.findFirst({
        where: {
          store_id: storeId,
          variant_id: variantId,
          end_at: null,
          start_at: { lte: endAt },
        },
        orderBy: { start_at: 'desc' },
      });

      if (!current) {
        throw new Error('No active price window to close');
      }
      if (current.start_at >= endAt) {
        throw new Error('endAt must be after startAt');
      }

      const closed = await tx.variant_prices.update({
        where: { id: current.id },
        data: { end_at: endAt, created_by: Number.isFinite(userId) ? userId : current.created_by },
      });

      return { beforeClose: current, closed };
    }),

  findProductById: (productId: number) =>
    prisma.products.findUnique({
      where: { id: productId },
      include: { product_variants: true },
    }),

  createProductWithVariants: (productData: Prisma.productsCreateInput, variants: Prisma.product_variantsUncheckedCreateInput[]) =>
    prisma.$transaction(async (tx) => {
      const product = await tx.products.create({ data: productData });

      for (const variant of variants) {
        await tx.product_variants.create({
          data: {
            ...variant,
            product_id: product.id,
          },
        });
      }

      return tx.products.findUnique({ where: { id: product.id }, include: { product_variants: true } });
    }),

  updateProduct: (productId: number, data: Prisma.productsUpdateInput) =>
    prisma.products.update({
      where: { id: productId },
      data,
    }),

  createVariant: (data: Prisma.product_variantsUncheckedCreateInput) => prisma.product_variants.create({ data }),

  updateVariant: (variantId: number, data: Prisma.product_variantsUpdateInput) => prisma.product_variants.update({ where: { id: variantId }, data }),
};
