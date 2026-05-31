import { Request, Response, NextFunction } from 'express';
import { getRedis, cacheSetJson } from '../lib/cache/redis';
import { logger } from '../lib/monitoring/logger';

const PRICE_CACHE_TTL = parseInt(process.env.PRICING_RESPONSE_CACHE_TTL || '120', 10); // 2 minutes default
const PRICE_CACHE_PREFIX = 'price_recommend';

/**
 * Generate cache key for pricing recommendation
 */
function makePriceCacheKey(storeId: number, variantId?: number, demandLevel?: number): string {
  const parts = [PRICE_CACHE_PREFIX, storeId];
  if (variantId) parts.push(String(variantId));
  if (demandLevel !== undefined) parts.push(String(demandLevel));
  return parts.join(':');
}

/**
 * Middleware to cache pricing recommendation responses
 * Applied to GET /api/v1/pricing/recommend endpoint
 */
export const pricingCacheMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const client = getRedis();

  // Only cache GET requests with variant ID
  if (req.method !== 'GET') {
    next();
    return;
  }

  try {
    const storeId = req.app.locals.storeId || (req.headers['x-store-id'] as string);
    const variantId = req.query.variantId ? Number(req.query.variantId) : undefined;
    const demandLevel = req.query.demandLevel ? Number(req.query.demandLevel) : undefined;

    if (!storeId || !client) {
      next();
      return;
    }

    const cacheKey = makePriceCacheKey(Number(storeId), variantId, demandLevel);

    // Try to get from cache
    const cached = await client.get(cacheKey);
    if (cached) {
      logger.info({
        message: 'Price recommendation cache hit',
        storeId,
        variantId,
      });

      res.set('X-Cache', 'HIT');
      res.json(JSON.parse(cached));
      return;
    }

    // Cache miss: intercept response and cache it
    res.set('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      // Cache the response
      if (res.statusCode === 200 && body) {
        (async () => {
          try {
            await cacheSetJson(cacheKey, body, PRICE_CACHE_TTL);
            logger.info({
              message: 'Price recommendation cached',
              storeId,
              variantId,
              ttl: PRICE_CACHE_TTL,
            });
          } catch (error) {
            logger.error({
              message: 'Error caching price recommendation',
              storeId,
              variantId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      }

      return originalJson(body);
    };

    next();
  } catch (error) {
    logger.error({
      message: 'Error in pricing cache middleware',
      error: error instanceof Error ? error.message : String(error),
    });
    next();
  }
};

/**
 * Invalidate pricing cache for a store/variant
 * Called after price updates or rule changes
 */
export async function invalidatePriceCache(
  storeId: number,
  variantId?: number
): Promise<void> {
  const client = getRedis();

  try {
    if (!client) return;

    if (variantId) {
      // Invalidate specific variant prices
      const pattern = `${PRICE_CACHE_PREFIX}:${storeId}:${variantId}*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } else {
      // Invalidate all prices for store
      const pattern = `${PRICE_CACHE_PREFIX}:${storeId}*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }

    logger.info({
      message: 'Price cache invalidated',
      storeId,
      variantId,
    });
  } catch (error) {
    logger.error({
      message: 'Error invalidating price cache',
      storeId,
      variantId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Non-blocking: cache miss is recoverable
  }
}

/**
 * Get cache stats for monitoring
 */
export async function getPriceCacheStats(): Promise<{
  cacheHits: number;
  cacheMisses: number;
  cachedPrices: number;
}> {
  const client = getRedis();

  try {
    if (!client) {
      return { cacheHits: 0, cacheMisses: 0, cachedPrices: 0 };
    }

    const pattern = `${PRICE_CACHE_PREFIX}:*`;
    const keys = await client.keys(pattern);

    return {
      cacheHits: 0, // Would need tracking in separate key
      cacheMisses: 0, // Would need tracking in separate key
      cachedPrices: keys.length,
    };
  } catch (error) {
    logger.error({
      message: 'Error getting price cache stats',
      error: error instanceof Error ? error.message : String(error),
    });
    return { cacheHits: 0, cacheMisses: 0, cachedPrices: 0 };
  }
}
