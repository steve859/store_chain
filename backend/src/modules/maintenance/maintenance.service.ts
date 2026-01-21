import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import prisma from '../../db/prisma';
import { AuditLogsService } from '../audit_logs/audit_logs.service';

export const MaintenanceService = {
  // 1. Tự động sao lưu Database
  performBackup: async () => {
    return new Promise((resolve, reject) => {
      // Tạo tên file theo thời gian: backup-2023-10-25-14-30.sql
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `backup-${timestamp}.sql`;
      const backupDir = path.join(__dirname, '../../../backups'); // Thư mục lưu file
      const filePath = path.join(backupDir, fileName);

      // Đảm bảo thư mục tồn tại
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Cấu hình lệnh pg_dump
      // Lưu ý: Cần đảm bảo biến môi trường DATABASE_URL trong .env là chính xác
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) return reject(new Error('DATABASE_URL is missing'));

      console.log('Starting backup...');

      // Gọi lệnh pg_dump từ hệ điều hành
      const processBackup = spawn('pg_dump', [dbUrl, '-f', filePath]);

      processBackup.on('exit', (code) => {
        if (code === 0) {
          console.log(`Backup successful: ${fileName}`);
          // Ghi log hệ thống
          AuditLogsService.createLog({
            action: 'BACKUP',
            objectType: 'SYSTEM',
            payload: { file: fileName, status: 'SUCCESS' }
          });
          resolve({ message: 'Backup created', file: fileName });
        } else {
          const errorMsg = `Backup process exited with code ${code}`;
          console.error(errorMsg);
          reject(new Error(errorMsg));
        }
      });
    });
  },

  // 2. Dọn dẹp dữ liệu rác (Cleanup)
  performCleanup: async () => {
    try {
      // A. Xóa Audit Logs cũ hơn 1 năm (Để giảm tải DB)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const deletedLogs = await prisma.audit_logs.deleteMany({
        where: {
          created_at: {
            lt: oneYearAgo
          }
        }
      });

      // B. Suppliers: schema hiện tại không có soft-delete, nên không cleanup theo deletedAt.
      const deletedSuppliers = { count: 0 };

      // Ghi log kết quả dọn dẹp
      const result = {
        deletedLogs: deletedLogs.count,
        deletedSuppliers: deletedSuppliers.count
      };

      await AuditLogsService.createLog({
        action: 'CLEANUP',
        objectType: 'SYSTEM',
        payload: result
      });

      return result;

    } catch (error) {
      console.error('Cleanup failed:', error);
      throw error;
    }
  }
};