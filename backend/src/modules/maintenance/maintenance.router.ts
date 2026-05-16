import { Router, Request, Response } from 'express';
import { MaintenanceService } from './maintenance.service';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/status', authorizeRoles(['admin', 'manager', 'store_manager']), async (_req: Request, res: Response) => {
  try {
    const status = await MaintenanceService.getOperationalStatus();
    const statusCode = status.status === 'healthy' ? 200 : status.status === 'degraded' ? 503 : 500;
    res.status(statusCode).json(status);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch maintenance status', details: (error as Error).message });
  }
});

// Chỉ Admin mới được quyền backup/cleanup/drill
router.post('/backup', authorizeRoles(['admin']), async (_req: Request, res: Response) => {
  try {
    const result = await MaintenanceService.performBackup();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Backup failed', details: (error as Error).message });
  }
});

router.post('/cleanup', authorizeRoles(['admin']), async (_req: Request, res: Response) => {
  try {
    const result = await MaintenanceService.performCleanup();
    res.json({ message: 'System cleanup completed', stats: result });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed', details: (error as Error).message });
  }
});

router.post('/disaster-recovery/drill', authorizeRoles(['admin']), async (_req: Request, res: Response) => {
  try {
    const result = await MaintenanceService.runDisasterRecoveryDrill();
    res.status(result.passed ? 200 : 503).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Disaster recovery drill failed', details: (error as Error).message });
  }
});

export default router;