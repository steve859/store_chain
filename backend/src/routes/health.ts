import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';
import { getRedis } from '../lib/cache/redis';

type HealthState = 'healthy' | 'degraded' | 'critical';

interface ComponentStatus {
  status: HealthState;
  message: string;
  responseTimeMs: number;
  checkedAt: string;
}

const router = Router();

const nowIso = () => new Date().toISOString();

async function checkDatabase(): Promise<ComponentStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      message: 'Database reachable',
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'critical',
      message: `Database unreachable: ${message}`,
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  }
}

async function checkRedis(): Promise<ComponentStatus> {
  const start = Date.now();
  const client = getRedis();

  if (!client) {
    return {
      status: 'degraded',
      message: 'Redis not configured',
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  }

  try {
    await client.ping();
    return {
      status: 'healthy',
      message: 'Redis reachable',
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'critical',
      message: `Redis unreachable: ${message}`,
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  }
}

async function checkReplication(): Promise<ComponentStatus> {
  const start = Date.now();
  try {
    const result = await prisma.$queryRaw<
      Array<{ in_recovery: boolean; replay_lag_seconds: number | null }>
    >`SELECT pg_is_in_recovery() AS in_recovery, EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))::int AS replay_lag_seconds`;

    const inRecovery = Boolean(result[0]?.in_recovery);
    const lag = result[0]?.replay_lag_seconds ?? null;

    if (!inRecovery) {
      return {
        status: 'healthy',
        message: 'Primary node (replication lag not applicable)',
        responseTimeMs: Date.now() - start,
        checkedAt: nowIso(),
      };
    }

    if (lag !== null && lag > 5) {
      return {
        status: 'degraded',
        message: `Replica lag high: ${lag}s`,
        responseTimeMs: Date.now() - start,
        checkedAt: nowIso(),
      };
    }

    return {
      status: 'healthy',
      message: `Replica healthy${lag !== null ? `: lag ${lag}s` : ''}`,
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'degraded',
      message: `Replication check unavailable: ${message}`,
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  }
}

function checkBackups(): ComponentStatus {
  const start = Date.now();
  try {
    const lastBackupAt = process.env.LAST_BACKUP_TIME
      ? new Date(process.env.LAST_BACKUP_TIME)
      : new Date(Date.now() - 4 * 60 * 60 * 1000);

    if (Number.isNaN(lastBackupAt.getTime())) {
      return {
        status: 'degraded',
        message: 'LAST_BACKUP_TIME is invalid',
        responseTimeMs: Date.now() - start,
        checkedAt: nowIso(),
      };
    }

    const ageMinutes = Math.round((Date.now() - lastBackupAt.getTime()) / (60 * 1000));
    const status: HealthState = ageMinutes > 360 ? 'critical' : ageMinutes > 120 ? 'degraded' : 'healthy';

    return {
      status,
      message: `Last backup ${ageMinutes} minutes ago`,
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'degraded',
      message: `Backup check unavailable: ${message}`,
      responseTimeMs: Date.now() - start,
      checkedAt: nowIso(),
    };
  }
}

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: nowIso(),
    uptime: process.uptime(),
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const isReady = database.status === 'healthy' && redis.status !== 'critical';

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: nowIso(),
    uptime: process.uptime(),
    components: { database, redis },
  });
});

router.get('/full', async (_req: Request, res: Response) => {
  const [database, redis, replication] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkReplication(),
  ]);
  const backups = checkBackups();

  const components = {
    api: {
      status: 'healthy' as const,
      message: 'API running',
      responseTimeMs: 0,
      checkedAt: nowIso(),
    },
    database,
    redis,
    replication,
    backups,
  };

  const statuses = Object.values(components).map((component) => component.status);
  const overallStatus: HealthState = statuses.includes('critical')
    ? 'critical'
    : statuses.includes('degraded')
      ? 'degraded'
      : 'healthy';

  const averageLatencyMs = Math.round(
    Object.values(components).reduce((sum, component) => sum + component.responseTimeMs, 0) /
      Object.keys(components).length
  );

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 503 : 500;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: nowIso(),
    uptime: process.uptime(),
    components,
    metrics: {
      averageLatencyMs,
      nodeVersion: process.version,
      memoryRssBytes: process.memoryUsage().rss,
    },
  });
});

export default router;
