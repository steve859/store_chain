import type { Request, RequestHandler } from 'express';
import { cacheGetJson, cacheSetJson } from '../lib/cache/redis';

type CacheOptions = {
  key: (req: Request) => string | null;
  ttlSeconds: number;
};

export const cacheJsonResponse = (opts: CacheOptions): RequestHandler => {
  return async (req, res, next) => {
    const key = opts.key(req);
    if (!key) return next();

    const cached = await cacheGetJson<unknown>(key);
    if (cached !== null) {
      return res.json(cached);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Only cache successful responses.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        void cacheSetJson(key, body, opts.ttlSeconds);
      }
      return originalJson(body);
    };

    return next();
  };
};
