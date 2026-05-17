import cron from 'node-cron';
import { MaintenanceService } from '../../modules/maintenance/maintenance.service';
import { logger } from '../../lib/monitoring/logger';
import { enqueueJob, JobType } from '../../lib/queues/jobQueue';
import prisma from '../../db/prisma';

export const startScheduler = () => {
  logger.info({ message: 'Scheduler Service started' });

  // 1. Lịch Backup Database: Chạy vào 2:00 sáng mỗi ngày
  // Cấu trúc cron: "phút giờ ngày tháng thứ"
  cron.schedule('0 2 * * *', async () => {
    logger.info({ message: 'Running scheduled daily backup' });
    try {
      await MaintenanceService.performBackup();
    } catch (error) {
      logger.error({ message: 'Scheduled backup failed', error: error instanceof Error ? error.message : String(error) });
    }
  });

  // 2. Lịch Dọn dẹp: Chạy vào 3:00 sáng Chủ Nhật hàng tuần
  cron.schedule('0 3 * * 0', async () => {
    logger.info({ message: 'Running scheduled weekly cleanup' });
    try {
      await MaintenanceService.performCleanup();
    } catch (error) {
      logger.error({ message: 'Scheduled cleanup failed', error: error instanceof Error ? error.message : String(error) });
    }
  });

  // 3. Lịch kiểm tra hạ tầng: mỗi 15 phút
  cron.schedule('*/15 * * * *', async () => {
    try {
      const status = await MaintenanceService.getOperationalStatus();
      if (status.status !== 'healthy') {
        logger.warn({ message: 'Infrastructure status degraded', status: status.status, components: status.components });
      } else {
        logger.info({ message: 'Infrastructure status healthy' });
      }
    } catch (error) {
      logger.error({
        message: 'Scheduled infrastructure status check failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 4. Pricing recalculation every 15 minutes (ASR-S3)
  // Enqueue batch pricing jobs for all stores with staggered start
  cron.schedule('*/15 * * * *', async () => {
    logger.info({ message: 'Starting scheduled pricing recalculation' });
    try {
      // Get all stores
      const stores = await prisma.stores.findMany({
        where: { is_active: true },
        select: { id: true },
      });

      if (stores.length === 0) {
        logger.info({ message: 'No active stores found for pricing recalculation' });
        return;
      }

      // Enqueue per-store pricing batch jobs
      let enqueuedCount = 0;
      for (const store of stores) {
        try {
          // Stagger job start by store ID to avoid queue surge
          const delayMs = (store.id % 10) * 1000; // 0-9 second delays

          await enqueueJob(
            JobType.CALCULATE_PRICING,
            {
              storeId: store.id,
              limit: parseInt(process.env.PRICING_BATCH_SIZE || '1000', 10),
              offset: 0,
            },
            {
              priority: parseInt(process.env.PRICING_JOB_PRIORITY || '5', 10),
              delay: delayMs,
              removeOnComplete: true,
            }
          );

          enqueuedCount++;
        } catch (error) {
          logger.error({
            message: 'Failed to enqueue pricing job for store',
            storeId: store.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info({
        message: 'Pricing recalculation jobs enqueued',
        totalStores: stores.length,
        enqueuedJobs: enqueuedCount,
      });
    } catch (error) {
      logger.error({
        message: 'Scheduled pricing recalculation failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};