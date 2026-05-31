import Redis, { Cluster } from 'ioredis';

type RedisClient = Redis | Cluster;

let redis: RedisClient | null = null;
let warned = false;

const getRedisUrl = (): string | null => {
  const url = process.env.REDIS_URL;
  return url && url.trim() !== '' ? url.trim() : null;
};

export const getRedis = (): RedisClient | null => {
  const clusterNodesRaw = process.env.REDIS_CLUSTER_NODES;
  const clusterNodes = clusterNodesRaw
    ? clusterNodesRaw
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
    : [];

  const url = getRedisUrl();
  if (!url && clusterNodes.length === 0) return null;

  if (redis) return redis;

  try {
    if (clusterNodes.length > 0) {
      const nodes = clusterNodes.map((node) => {
        const [host, portRaw] = node.split(':');
        return {
          host,
          port: Number(portRaw ?? 6379),
        };
      });

      redis = new Cluster(nodes, {
        scaleReads: 'slave',
        redisOptions: {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          offlineQueue: false,
        },
      });
    } else if (url) {
      redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
    } else {
      return null;
    }

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

const scanAndDeleteNode = async (node: Redis, pattern: string): Promise<number> => {
  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await node.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = nextCursor;

    if (keys.length > 0) {
      const pipeline = node.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      const results = await pipeline.exec();
      const deletedOnBatch = results?.reduce((sum, row) => {
        const value = Array.isArray(row) ? row[1] : 0;
        const num = typeof value === 'number' ? value : 0;
        return sum + num;
      }, 0) ?? 0;
      deleted += deletedOnBatch;
    }
  } while (cursor !== '0');

  return deleted;
};

export const cacheDeleteByPattern = async (pattern: string): Promise<number> => {
  const client = getRedis();
  if (!client) return 0;

  try {
    if (client instanceof Cluster) {
      const masters = client.nodes('master');
      const deletedByNode = await Promise.all(masters.map((node) => scanAndDeleteNode(node, pattern)));
      return deletedByNode.reduce((sum, current) => sum + current, 0);
    }

    return scanAndDeleteNode(client, pattern);
  } catch {
    return 0;
  }
};
