import cron from 'node-cron';
import { MaintenanceService } from '../../modules/maintenance/maintenance.service';

export const startScheduler = () => {
  console.log('🔄 Scheduler Service started...');

  // 1. Lịch Backup Database: Chạy vào 2:00 sáng mỗi ngày
  // Cấu trúc cron: "phút giờ ngày tháng thứ"
  cron.schedule('0 2 * * *', async () => {
    console.log('⏰ Running daily backup...');
    try {
      await MaintenanceService.performBackup();
    } catch (error) {
      console.error('Auto backup failed');
    }
  });

  // 2. Lịch Dọn dẹp: Chạy vào 3:00 sáng Chủ Nhật hàng tuần
  cron.schedule('0 3 * * 0', async () => {
    console.log('⏰ Running weekly cleanup...');
    try {
      await MaintenanceService.performCleanup();
    } catch (error) {
      console.error('Auto cleanup failed');
    }
  });
};