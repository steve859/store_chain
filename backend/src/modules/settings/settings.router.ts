import { Router } from 'express';
import { SettingsController } from './settings.controller';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';

const router = Router();

const readSettingsRoles = ['ADMIN', 'DISTRICT_MANAGER', 'STORE_MANAGER'];
const writeSettingsRoles = ['ADMIN'];

router.use(authenticateToken);

router.get('/', authorizeRoles(readSettingsRoles), SettingsController.getAllSettings);
router.get('/:group', authorizeRoles(readSettingsRoles), SettingsController.getSettingsByGroup);
router.post('/', authorizeRoles(writeSettingsRoles), SettingsController.updateSettings);
router.post('/init-defaults', authorizeRoles(writeSettingsRoles), SettingsController.initDefaultSettings);

export default router;
