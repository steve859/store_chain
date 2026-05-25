import prisma from '../../db/prisma';
import { getRedis, cacheSetJson, cacheDeleteByPattern } from './redis';
import { logger } from '../monitoring/logger';

interface CachedRule {
  id: string;
  ruleName: string;
  ruleType: 'fixed' | 'percentage' | 'demand_based' | 'competitor_based' | 'time_based';
  basePrice: number;
  minPrice?: number;
  maxPrice?: number;
  adjustmentValue?: number;
  adjustmentType?: string;
  conditionType?: string;
  conditionValue?: any;
  priority: number;
  productVariantId?: number;
  categoryId?: number;
  effectiveFrom: number; // timestamp
  effectiveUntil?: number; // timestamp
}

const RULE_CACHE_TTL = parseInt(process.env.PRICING_RULE_CACHE_TTL || '300', 10); // 5 minutes default
const RULE_CACHE_PREFIX = 'pricing_rules';

/**
 * Generate cache key for store rules
 */
function makeRulesCacheKey(storeId: number): string {
  return `${RULE_CACHE_PREFIX}:{${storeId}}`;
}

/**
 * Get pricing rules from cache or database
 * Returns array of applicable rules sorted by priority (descending)
 */
export async function getRulesFromCache(storeId: number): Promise<CachedRule[]> {
  const cacheKey = makeRulesCacheKey(storeId);
  const client = getRedis();

  try {
    // Try to get from cache
    if (client) {
      const cached = await client.get(cacheKey);
      if (cached) {
        logger.info({
          message: 'Pricing rules cache hit',
          storeId,
        });
        return JSON.parse(cached);
      }
    }

    // Cache miss: fetch from DB and populate cache
    logger.info({
      message: 'Pricing rules cache miss, fetching from DB',
      storeId,
    });

    const dbRules = await prisma.pricing_rules.findMany({
      where: {
        store_id: storeId,
        is_active: true,
        effective_from: { lte: new Date() },
        OR: [{ effective_until: null }, { effective_until: { gte: new Date() } }],
      },
      orderBy: { priority: 'desc' },
    });

    const cachedRules: CachedRule[] = dbRules.map(r => ({
      id: r.id,
      ruleName: r.rule_name,
      ruleType: r.rule_type as any,
      basePrice: Number(r.base_price),
      minPrice: r.min_price ? Number(r.min_price) : undefined,
      maxPrice: r.max_price ? Number(r.max_price) : undefined,
      adjustmentValue: r.adjustment_value ? Number(r.adjustment_value) : undefined,
      adjustmentType: r.adjustment_type || undefined,
      conditionType: r.condition_type || undefined,
      conditionValue: r.condition_value ? JSON.parse(r.condition_value) : undefined,
      priority: r.priority,
      productVariantId: r.product_variant_id || undefined,
      categoryId: r.category_id || undefined,
      effectiveFrom: r.effective_from.getTime(),
      effectiveUntil: r.effective_until ? r.effective_until.getTime() : undefined,
    }));

    // Store in cache with TTL
    if (client) {
      await cacheSetJson(cacheKey, cachedRules, RULE_CACHE_TTL);
    }

    return cachedRules;
  } catch (error) {
    logger.error({
      message: 'Error fetching pricing rules',
      storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Invalidate pricing rules cache for a store
 * Called when rules are created, updated, or deleted
 */
export async function invalidateRulesCache(storeId: number): Promise<void> {
  const cacheKey = makeRulesCacheKey(storeId);
  const client = getRedis();

  try {
    if (client) {
      await client.del(cacheKey);
    }
    logger.info({
      message: 'Pricing rules cache invalidated',
      storeId,
    });
  } catch (error) {
    logger.error({
      message: 'Error invalidating pricing rules cache',
      storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Non-blocking: cache miss is recoverable
  }
}

/**
 * Invalidate pricing rules cache for all stores
 * Called on system-wide rule changes (rare)
 */
export async function invalidateAllRulesCache(): Promise<void> {
  const client = getRedis();

  try {
    if (client) {
      const pattern = `${RULE_CACHE_PREFIX}:*`;
      const keys = await client.keys(pattern);

      if (keys.length > 0) {
        await client.del(...keys);
        logger.info({
          message: 'All pricing rules caches invalidated',
          keysDeleted: keys.length,
        });
      }
    }
  } catch (error) {
    logger.error({
      message: 'Error invalidating all pricing rules caches',
      error: error instanceof Error ? error.message : String(error),
    });
    // Non-blocking: cache miss is recoverable
  }
}

/**
 * Preload rules cache for a store (used on startup or manual refresh)
 */
export async function preloadRulesCache(storeId: number): Promise<number> {
  try {
    const rules = await getRulesFromCache(storeId);
    logger.info({
      message: 'Pricing rules cache preloaded',
      storeId,
      ruleCount: rules.length,
    });
    return rules.length;
  } catch (error) {
    logger.error({
      message: 'Error preloading pricing rules cache',
      storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Get cache stats for monitoring
 */
export async function getPricingCacheStats(): Promise<{
  cacheHits: number;
  cacheMisses: number;
  cachedStores: number;
}> {
  const client = getRedis();

  try {
    if (!client) {
      return { cacheHits: 0, cacheMisses: 0, cachedStores: 0 };
    }

    const pattern = `${RULE_CACHE_PREFIX}:*`;
    const keys = await client.keys(pattern);

    return {
      cacheHits: 0, // Would need tracking in separate key
      cacheMisses: 0, // Would need tracking in separate key
      cachedStores: keys.length,
    };
  } catch (error) {
    logger.error({
      message: 'Error getting pricing cache stats',
      error: error instanceof Error ? error.message : String(error),
    });
    return { cacheHits: 0, cacheMisses: 0, cachedStores: 0 };
  }
}
