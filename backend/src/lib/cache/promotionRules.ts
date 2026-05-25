/**
 * Promotion Rules Cache Engine
 * In-memory cache for promotional rules with fast evaluation (<10ms)
 * Similar to pricing rules but optimized for promotion matching
 */

import prisma from '../../db/prisma';
import { getRedis, cacheSetJson } from './redis';
import { logger } from '../monitoring/logger';

interface CachedPromotion {
  id: string;
  promotionName: string;
  promoType: 'fixed_discount' | 'percentage_discount' | 'bogo' | 'tiered_discount' | 'free_shipping';
  discountValue: number;
  discountType?: 'percentage' | 'fixed_amount';
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  applicableVariants?: number[];
  applicableCategories?: number[];
  startDate: number; // timestamp
  endDate?: number; // timestamp
  priority: number;
  isActive: boolean;
}

const PROMO_CACHE_TTL = parseInt(process.env.PROMOTION_CACHE_TTL || '600', 10); // 10 minutes default
const PROMO_CACHE_PREFIX = 'promotions';

/**
 * Generate cache key for store promotions
 */
function makePromoCacheKey(storeId: number): string {
  return `${PROMO_CACHE_PREFIX}:{${storeId}}`;
}

/**
 * In-memory promotion index
 */
const promoCaches = new Map<number, Map<string, CachedPromotion>>();

/**
 * Get promotions from cache or database
 * Returns applicable active promotions sorted by priority
 */
export async function getPromotionsFromCache(storeId: number): Promise<CachedPromotion[]> {
  const cacheKey = makePromoCacheKey(storeId);
  const client = getRedis();

  try {
    // Try in-memory cache first (L1)
    let promos = promoCaches.get(storeId);
    if (promos) {
      const promoArray = Array.from(promos.values());
      logger.debug({
        message: 'Promotions L1 cache hit',
        storeId,
        promoCount: promoArray.length,
      });
      return promoArray;
    }

    // Try Redis cache (L2)
    if (client) {
      const cached = await client.get(cacheKey);
      if (cached) {
        const promoList = JSON.parse(cached) as CachedPromotion[];
        // Store in L1 for next request
        const promoMap = new Map(promoList.map(p => [p.id, p]));
        promoCaches.set(storeId, promoMap);

        logger.info({
          message: 'Promotions L2 cache hit',
          storeId,
          promoCount: promoList.length,
        });
        return promoList;
      }
    }

    // Cache miss: fetch from DB and populate caches
    logger.info({
      message: 'Promotions cache miss, fetching from DB',
      storeId,
    });

    // Fetch from promotions table (assuming schema exists)
    const dbPromos = await prisma.$queryRaw<
      Array<{
        id: string;
        promotion_name: string;
        promo_type: string;
        discount_value: number;
        discount_type?: string;
        min_purchase_amount?: number;
        max_discount_amount?: number;
        applicable_variants?: string;
        applicable_categories?: string;
        start_date: Date;
        end_date?: Date;
        priority: number;
        is_active: boolean;
      }>
    >`
      SELECT 
        id, promotion_name, promo_type, discount_value, discount_type,
        min_purchase_amount, max_discount_amount, applicable_variants,
        applicable_categories, start_date, end_date, priority, is_active
      FROM promotions
      WHERE store_id = ${storeId}
        AND is_active = true
        AND start_date <= NOW()
        AND (end_date IS NULL OR end_date >= NOW())
      ORDER BY priority DESC
    `;

    const cachedPromos: CachedPromotion[] = dbPromos.map(p => ({
      id: p.id,
      promotionName: p.promotion_name,
      promoType: p.promo_type as any,
      discountValue: Number(p.discount_value),
      discountType: p.discount_type as any,
      minPurchaseAmount: p.min_purchase_amount ? Number(p.min_purchase_amount) : undefined,
      maxDiscountAmount: p.max_discount_amount ? Number(p.max_discount_amount) : undefined,
      applicableVariants: p.applicable_variants
        ? JSON.parse(p.applicable_variants)
        : undefined,
      applicableCategories: p.applicable_categories
        ? JSON.parse(p.applicable_categories)
        : undefined,
      startDate: p.start_date.getTime(),
      endDate: p.end_date?.getTime(),
      priority: p.priority,
      isActive: p.is_active,
    }));

    // Store in L1 cache
    const promoMap = new Map(cachedPromos.map(p => [p.id, p]));
    promoCaches.set(storeId, promoMap);

    // Store in L2 cache (Redis)
    if (client) {
      await cacheSetJson(cacheKey, cachedPromos, PROMO_CACHE_TTL);
    }

    logger.info({
      message: 'Promotions loaded from DB and cached',
      storeId,
      promoCount: cachedPromos.length,
    });

    return cachedPromos;
  } catch (error: any) {
    logger.error({
      message: 'Promotions cache error',
      storeId,
      errorMessage: error.message,
    });
    // Return empty array on error (fail open)
    return [];
  }
}

/**
 * Invalidate promotion cache
 * Called when promotions are created/updated
 */
export async function invalidatePromotionCache(storeId: number): Promise<void> {
  try {
    // Clear L1 cache
    promoCaches.delete(storeId);

    // Clear L2 cache (Redis)
    const client = getRedis();
    if (client) {
      const cacheKey = makePromoCacheKey(storeId);
      await client.del(cacheKey);
    }

    logger.info({
      message: 'Promotion cache invalidated',
      storeId,
    });
  } catch (error: any) {
    logger.error({
      message: 'Error invalidating promotion cache',
      storeId,
      errorMessage: error.message,
    });
  }
}

/**
 * Evaluate applicable promotions for a cart
 * Returns matching promotions sorted by value (highest discount first)
 * <10ms evaluation time (in-memory)
 */
export async function evaluatePromotions(
  storeId: number,
  cartTotal: number,
  variantIds: number[],
  categoryIds: number[]
): Promise<CachedPromotion[]> {
  const promos = await getPromotionsFromCache(storeId);
  const applicable: CachedPromotion[] = [];

  for (const promo of promos) {
    // Check minimum purchase requirement
    if (promo.minPurchaseAmount && cartTotal < promo.minPurchaseAmount) {
      continue;
    }

    // Check variant applicability
    if (promo.applicableVariants && promo.applicableVariants.length > 0) {
      const hasApplicableVariant = variantIds.some(id =>
        promo.applicableVariants?.includes(id)
      );
      if (!hasApplicableVariant) {
        continue;
      }
    }

    // Check category applicability
    if (promo.applicableCategories && promo.applicableCategories.length > 0) {
      const hasApplicableCategory = categoryIds.some(id =>
        promo.applicableCategories?.includes(id)
      );
      if (!hasApplicableCategory) {
        continue;
      }
    }

    applicable.push(promo);
  }

  // Sort by discount value (descending)
  applicable.sort((a, b) => {
    const discountA = a.discountValue;
    const discountB = b.discountValue;
    return discountB - discountA;
  });

  return applicable;
}

/**
 * Calculate promotion discount amount
 */
export function calculatePromoDiscount(
  promo: CachedPromotion,
  cartTotal: number
): number {
  switch (promo.promoType) {
    case 'fixed_discount':
      return Math.min(promo.discountValue, promo.maxDiscountAmount || Infinity);

    case 'percentage_discount':
      const percentDiscount = (cartTotal * promo.discountValue) / 100;
      return Math.min(percentDiscount, promo.maxDiscountAmount || Infinity);

    case 'bogo':
      // Buy one get one - discount is discountValue amount off
      return promo.discountValue;

    case 'tiered_discount':
      // Tiered discounts based on purchase amount
      return promo.discountValue;

    case 'free_shipping':
      // Fixed shipping discount
      return promo.discountValue;

    default:
      return 0;
  }
}

/**
 * Get promotion cache statistics for monitoring
 */
export function getPromotionCacheStats() {
  const stats: Record<number, { promoCount: number }> = {};
  promoCaches.forEach((promoMap, storeId) => {
    stats[storeId] = { promoCount: promoMap.size };
  });
  return stats;
}

/**
 * Warmup promotion cache on startup
 */
export async function warmupPromotionCache(): Promise<void> {
  try {
    logger.info({ message: 'Warming up promotion cache' });

    // Get all active stores
    const stores = await prisma.stores.findMany({
      where: { is_active: true },
      select: { id: true },
    });

    const results = await Promise.allSettled(
      stores.map(store => getPromotionsFromCache(store.id))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    logger.info({
      message: 'Promotion cache warmup completed',
      storesLoaded: successful,
      totalStores: stores.length,
    });
  } catch (error: any) {
    logger.error({
      message: 'Promotion cache warmup failed',
      errorMessage: error.message,
    });
  }
}
