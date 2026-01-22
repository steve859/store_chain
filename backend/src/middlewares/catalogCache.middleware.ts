import type { Request, RequestHandler } from 'express';
import { cacheJsonResponse } from './cache.middleware';
import { makeCatalogCacheKey } from '../lib/cache/catalog';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const cacheCatalogResponse = (): RequestHandler => {
  const ttlFromEnv = process.env.CATALOG_CACHE_TTL_SECONDS ? Number(process.env.CATALOG_CACHE_TTL_SECONDS) : NaN;
  const ttlSeconds = Number.isFinite(ttlFromEnv) ? clamp(ttlFromEnv, 30, 60) : 45;

  return cacheJsonResponse({
    ttlSeconds,
    key: (req: Request) => {
      const storeId = Number(req.activeStoreId);
      if (!Number.isFinite(storeId)) return null;
      return makeCatalogCacheKey(storeId, String(req.originalUrl ?? req.url ?? ''));
    },
  });
};
