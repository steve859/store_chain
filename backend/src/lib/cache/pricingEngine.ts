/**
 * In-Memory Pricing Engine
 * Provides L1 cache for fast variant lookups (<1ms)
 * Syncs from database and Redis as fallback
 */

import prisma from '../../db/prisma';
import { getRedis, cacheSetJson, cacheGetJson } from './redis';
import { logger } from '../monitoring/logger';

// Cache structure: Map<storeId, Map<variantId, VariantPricingData>>
interface VariantPricingData {
  variantId: number;
  storeId: number;
  currentPrice: number;
  costPrice: number;
  lastUpdatedAt: number; // timestamp
  variantCode?: string;
  productId?: number;
}

interface EngineStats {
  storeId: number;
  variantCount: number;
  loadedAt: number;
  expiresAt: number;
  memoryBytes: number;
}

// Global in-memory store index
const engineCache = new Map<number, Map<number, VariantPricingData>>();
const engineStats = new Map<number, EngineStats>();

const ENGINE_TTL = parseInt(process.env.PRICING_ENGINE_TTL || '900', 10); // 15 minutes default
const ENGINE_PREFIX = 'pricing_engine';
const PRELOAD_BATCH_SIZE = parseInt(process.env.PRICING_ENGINE_PRELOAD_BATCH_SIZE || '100', 10);
const MEMORY_LIMIT_MB = parseInt(process.env.PRICING_ENGINE_MEMORY_LIMIT_MB || '200', 10);

/**
 * Get variant pricing data from in-memory cache
 * Returns immediately without I/O - <1ms latency
 */
export function getPricingDataInMemory(
  storeId: number,
  variantId: number
): VariantPricingData | undefined {
  const storeCache = engineCache.get(storeId);
  if (!storeCache) {
    return undefined;
  }

  const variant = storeCache.get(variantId);
  if (variant) {
    // Check if cache entry has expired
    const now = Date.now();
    const expiresAt = variant.lastUpdatedAt + ENGINE_TTL * 1000;
    if (now < expiresAt) {
      return variant;
    }
    // Expired entry, remove it
    storeCache.delete(variantId);
  }

  return undefined;
}

/**
 * Check if store index is loaded and fresh
 */
export function isEngineCacheValid(storeId: number): boolean {
  const stats = engineStats.get(storeId);
  if (!stats) return false;

  const now = Date.now();
  return now < stats.expiresAt;
}

/**
 * Get cache statistics for monitoring
 */
export function getEngineStats(storeId: number): EngineStats | undefined {
  return engineStats.get(storeId);
}

/**
 * Preload variant pricing data from database into memory
 * Called on startup and after pricing batch completion
 */
export async function preloadVariantIndex(storeId: number): Promise<EngineStats> {
  try {
    logger.info({
      message: 'Starting pricing engine preload',
      storeId,
    });

    const startTime = Date.now();
    const storeCache = new Map<number, VariantPricingData>();
    let totalLoaded = 0;
    let offset = 0;

    // Batch load variants to avoid memory spike
    while (true) {
      const variants = await prisma.product_variants.findMany({
        where: { is_active: true },
        select: {
          id: true,
          price: true,
          cost_price: true,
          variant_code: true,
          product_id: true,
        },
        skip: offset,
        take: PRELOAD_BATCH_SIZE,
      });

      if (variants.length === 0) break;

      for (const v of variants) {
        const pricingData: VariantPricingData = {
          variantId: v.id,
          storeId,
          currentPrice: Number(v.price),
          costPrice: v.cost_price ? Number(v.cost_price) : 0,
          lastUpdatedAt: Date.now(),
          variantCode: v.variant_code || undefined,
          productId: v.product_id || undefined,
        };
        storeCache.set(v.id, pricingData);
        totalLoaded++;
      }

      offset += PRELOAD_BATCH_SIZE;

      // Safety check: prevent loading more than memory limit
      const memoryEstimate = storeCache.size * 0.5; // ~0.5KB per variant JSON
      if (memoryEstimate > MEMORY_LIMIT_MB) {
        logger.warn({
          message: 'Pricing engine memory limit approaching',
          storeId,
          variantCount: totalLoaded,
          estimatedMemoryMB: memoryEstimate,
        });
        break;
      }
    }

    // Replace store cache atomically
    engineCache.set(storeId, storeCache);

    // Update stats
    const loadedAt = Date.now();
    const stats: EngineStats = {
      storeId,
      variantCount: totalLoaded,
      loadedAt,
      expiresAt: loadedAt + ENGINE_TTL * 1000,
      memoryBytes: storeCache.size * 500, // Estimate 500 bytes per variant
    };
    engineStats.set(storeId, stats);

    const duration = Date.now() - startTime;
    logger.info({
      message: 'Pricing engine preload completed',
      storeId,
      variantCount: totalLoaded,
      durationMs: duration,
      memoryMB: (stats.memoryBytes / 1024 / 1024).toFixed(2),
    });

    return stats;
  } catch (error: any) {
    logger.error({
      message: 'Pricing engine preload failed',
      storeId,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Update a single variant in the in-memory cache
 */
export function updateVariantInMemory(data: VariantPricingData): void {
  const storeCache = engineCache.get(data.storeId);
  if (storeCache) {
    storeCache.set(data.variantId, {
      ...data,
      lastUpdatedAt: Date.now(),
    });
  }
}

/**
 * Invalidate entire store pricing cache
 * Called when pricing rules change
 */
export async function invalidatePricingCache(storeId: number): Promise<void> {
  try {
    // Clear in-memory cache
    engineCache.delete(storeId);
    engineStats.delete(storeId);

    // Also clear Redis variant preload cache if exists
    const client = getRedis();
    if (client) {
      const cacheKey = `${ENGINE_PREFIX}:variants:${storeId}`;
      await client.del(cacheKey);
    }

    logger.info({
      message: 'Pricing cache invalidated',
      storeId,
    });
  } catch (error: any) {
    logger.error({
      message: 'Error invalidating pricing cache',
      storeId,
      errorMessage: error.message,
    });
  }
}

/**
 * Invalidate specific variants
 * Called on demand metric updates
 */
export function invalidateVariantsInMemory(
  storeId: number,
  variantIds: number[]
): void {
  const storeCache = engineCache.get(storeId);
  if (storeCache) {
    for (const variantId of variantIds) {
      storeCache.delete(variantId);
    }
    logger.debug({
      message: 'Variants invalidated from memory cache',
      storeId,
      variantCount: variantIds.length,
    });
  }
}

/**
 * Get all engine statistics for monitoring
 */
export function getAllEngineStats(): EngineStats[] {
  return Array.from(engineStats.values());
}

/**
 * Warm up cache on application startup
 * Loads all active stores' pricing data
 */
export async function warmupEngineCache(): Promise<void> {
  try {
    logger.info({ message: 'Warming up pricing engine cache' });

    // Get all active stores
    const stores = await prisma.stores.findMany({
      where: { is_active: true },
      select: { id: true },
    });

    const results = await Promise.allSettled(
      stores.map(store => preloadVariantIndex(store.id))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info({
      message: 'Engine cache warmup completed',
      storesLoaded: successful,
      storesFailed: failed,
    });
  } catch (error: any) {
    logger.error({
      message: 'Engine cache warmup failed',
      errorMessage: error.message,
    });
  }
}

/**
 * Export service object for pricing service
 */
export const pricingEngine = {
  getPricingDataInMemory,
  isEngineCacheValid,
  getEngineStats,
  preloadVariantIndex,
  updateVariantInMemory,
  invalidatePricingCache,
  invalidateVariantsInMemory,
  getAllEngineStats,
  warmupEngineCache,
};
