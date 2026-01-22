import { cacheDeleteByPattern } from './redis';

const KEY_PREFIX = 'cache:v1:products:catalog';

export const makeCatalogCacheKey = (storeId: number, originalUrl: string): string => {
  const urlToken = Buffer.from(originalUrl, 'utf8').toString('base64url');
  return `${KEY_PREFIX}:store:${storeId}:u:${urlToken}`;
};

export const makeCatalogCachePatternForStore = (storeId: number): string => {
  return `${KEY_PREFIX}:store:${storeId}:*`;
};

export const invalidateCatalogCache = async (storeId: number): Promise<void> => {
  if (!Number.isFinite(storeId)) return;
  await cacheDeleteByPattern(makeCatalogCachePatternForStore(storeId));
};
