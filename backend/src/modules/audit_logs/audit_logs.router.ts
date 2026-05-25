import { Router } from 'express';
import { AuditLogsController } from './audit_logs.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/', authorizeRoles(['ADMIN']), AuditLogsController.getLogs);

export default router;
