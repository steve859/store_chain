import Redis from 'ioredis';

let redis: Redis | null = null;
let warned = false;

const getRedisUrl = (): string | null => {
  const url = process.env.REDIS_URL;
  return url && url.trim() !== '' ? url.trim() : null;
};

export const getRedis = (): Redis | null => {
  const url = getRedisUrl();
  if (!url) return null;

  if (redis) return redis;

  try {
    redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    redis.on('error', (err: unknown) => {
      if (!warned) {
        warned = true;
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn('[redis] connection error (caching will be best-effort):', msg);
      }
    });

    // Fire-and-forget connect. All operations below are guarded with try/catch anyway.
    redis.connect().catch(() => undefined);

    return redis;
  } catch (err) {
    if (!warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn('[redis] failed to initialize (caching disabled)');
    }
    redis = null;
    return null;
  }
};

export const cacheGetJson = async <T>(key: string): Promise<T | null> => {
  const client = getRedis();
  if (!client) return null;

  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const cacheSetJson = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  const client = getRedis();
  if (!client) return;

  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await client.set(key, payload);
    }
  } catch {
    // best-effort
  }
};

export const cacheDeleteByPattern = async (pattern: string): Promise<number> => {
  const client = getRedis();
  if (!client) return 0;

  try {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = nextCursor;

      if (keys.length > 0) {
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  } catch {
    return 0;
  }
};
