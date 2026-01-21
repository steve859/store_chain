import { Router, Request, Response } from 'express';
import { MaintenanceService } from './maintenance.service';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

router.use(authenticateToken);

// Chỉ Admin mới được quyền backup/cleanup
router.post('/backup', authorizeRoles(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await MaintenanceService.performBackup();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Backup failed', details: (error as Error).message });
  }
});

router.post('/cleanup', authorizeRoles(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const result = await MaintenanceService.performCleanup();
    res.json({ message: 'System cleanup completed', stats: result });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

export default router;