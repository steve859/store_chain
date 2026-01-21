// src/modules/audit-logs/audit-logs.router.ts
import { Router, Request, Response } from 'express';
import { AuditLogsService } from './audit_logs.service';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/audit-logs
 * Filter: ?action=DELETE&objectType=SUPPLIER&userId=1
 */
router.get('/', authorizeRoles(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const action = req.query.action as string;
    const objectType = req.query.objectType as string; // Sửa param cho khớp logic mới
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    
    const startDate = req.query.from ? new Date(req.query.from as string) : undefined;
    const endDate = req.query.to ? new Date(req.query.to as string) : undefined;

    const result = await AuditLogsService.getLogs({
      page,
      limit,
      action,
      objectType,
      userId,
      startDate,
      endDate
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;