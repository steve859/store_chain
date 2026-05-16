import cron from 'node-cron';
import { MaintenanceService } from '../../modules/maintenance/maintenance.service';
import { logger } from '../../lib/monitoring/logger';

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
};