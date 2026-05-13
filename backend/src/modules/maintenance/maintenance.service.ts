import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import prisma from '../../db/prisma';
import { getRedis } from '../../lib/cache/redis';
import { logger } from '../../lib/monitoring/logger';
import { AuditLogsService } from '../audit_logs/audit_logs.service';

type HealthState = 'healthy' | 'degraded' | 'critical';

interface ComponentStatus {
  status: HealthState;
  message: string;
  responseTimeMs: number;
  checkedAt: string;
}

interface BackupResult {
  message: string;
  file: string;
}

const BACKUP_DIR = path.join(__dirname, '../../../backups');

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
    const role = await prisma.$queryRaw<Array<{ in_recovery: boolean }>>`SELECT pg_is_in_recovery() AS in_recovery`;
    const inRecovery = Boolean(role[0]?.in_recovery);

    if (inRecovery) {
      const lag = await prisma.$queryRaw<Array<{ lag_seconds: number | null }>>`
        SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))::int AS lag_seconds
      `;
      const lagSeconds = lag[0]?.lag_seconds ?? 0;
      return {
        status: lagSeconds > 5 ? 'degraded' : 'healthy',
        message: `Replica node lag: ${lagSeconds}s`,
        responseTimeMs: Date.now() - start,
        checkedAt: nowIso(),
      };
    }

    const replicas = await prisma.$queryRaw<Array<{ replicas: number }>>`
      SELECT COUNT(*)::int AS replicas FROM pg_stat_replication
    `;
    const replicaCount = replicas[0]?.replicas ?? 0;
    return {
      status: replicaCount > 0 ? 'healthy' : 'degraded',
      message: replicaCount > 0 ? `Primary node with ${replicaCount} replica(s)` : 'Primary node with no connected replicas',
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

function getBackupSummary() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return {
      totalBackups: 0,
      lastBackupAt: null as string | null,
      backupsInLast24h: 0,
      status: 'critical' as HealthState,
      message: 'Backup directory not found',
    };
  }

  const files = fs.readdirSync(BACKUP_DIR).filter((file) => file.startsWith('backup-') && file.endsWith('.sql'));
  const fileStats = files
    .map((file) => {
      const fullPath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(fullPath);
      return { file, mtime: stats.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const lastBackup = fileStats[0]?.mtime ?? null;
  const threshold = Date.now() - 24 * 60 * 60 * 1000;
  const backupsInLast24h = fileStats.filter((item) => item.mtime.getTime() >= threshold).length;

  const status: HealthState = !lastBackup
    ? 'critical'
    : lastBackup.getTime() < threshold
      ? 'degraded'
      : 'healthy';

  const message =
    status === 'healthy'
      ? 'Recent backup available'
      : status === 'degraded'
        ? 'Latest backup is older than 24h'
        : 'No backups available';

  return {
    totalBackups: files.length,
    lastBackupAt: lastBackup ? lastBackup.toISOString() : null,
    backupsInLast24h,
    status,
    message,
  };
}

export const MaintenanceService = {
  performBackup: async (): Promise<BackupResult> => {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `backup-${timestamp}.sql`;
      const filePath = path.join(BACKUP_DIR, fileName);

      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        reject(new Error('DATABASE_URL is missing'));
        return;
      }

      logger.info({ message: 'Starting backup job', fileName });
      const processBackup = spawn('pg_dump', [dbUrl, '-f', filePath]);

      processBackup.on('error', (error) => {
        reject(new Error(`Failed to execute pg_dump: ${error.message}`));
      });

      processBackup.on('exit', async (code) => {
        if (code === 0) {
          const completedAt = nowIso();
          process.env.LAST_BACKUP_TIME = completedAt;
          await AuditLogsService.createLog({
            action: 'BACKUP',
            objectType: 'SYSTEM',
            payload: { file: fileName, status: 'SUCCESS', completedAt },
          });
          logger.info({ message: 'Backup completed', fileName });
          resolve({ message: 'Backup created', file: fileName });
          return;
        }

        reject(new Error(`Backup process exited with code ${code}`));
      });
    });
  },

  performCleanup: async () => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const deletedLogs = await prisma.audit_logs.deleteMany({
      where: {
        created_at: {
          lt: oneYearAgo,
        },
      },
    });

    const result = {
      deletedLogs: deletedLogs.count,
      deletedSuppliers: 0,
    };

    await AuditLogsService.createLog({
      action: 'CLEANUP',
      objectType: 'SYSTEM',
      payload: result,
    });

    logger.info({ message: 'Cleanup completed', ...result });
    return result;
  },

  getOperationalStatus: async () => {
    const [database, redis, replication] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkReplication(),
    ]);

    const backup = getBackupSummary();
    const backupStatus: ComponentStatus = {
      status: backup.status,
      message: backup.message,
      responseTimeMs: 0,
      checkedAt: nowIso(),
    };

    const statuses = [database.status, redis.status, replication.status, backup.status];
    const overall: HealthState = statuses.includes('critical')
      ? 'critical'
      : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy';

    return {
      status: overall,
      timestamp: nowIso(),
      components: {
        database,
        redis,
        replication,
        backups: backupStatus,
      },
      backups: backup,
    };
  },

  runDisasterRecoveryDrill: async () => {
    const status = await MaintenanceService.getOperationalStatus();
    const pass = status.components.database.status !== 'critical' && status.backups.totalBackups > 0;

    const result = {
      passed: pass,
      timestamp: nowIso(),
      checks: {
        databaseReachable: status.components.database.status !== 'critical',
        redisReachable: status.components.redis.status !== 'critical',
        backupAvailable: status.backups.totalBackups > 0,
        recentBackup: status.backups.status !== 'critical',
      },
      details: status,
    };

    await AuditLogsService.createLog({
      action: 'DISASTER_RECOVERY_DRILL',
      objectType: 'SYSTEM',
      payload: result,
    });

    return result;
  },
};