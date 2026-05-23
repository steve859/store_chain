import { Router } from 'express';
import { SettingsController } from './settings.controller';

const router = Router();

router.get('/', SettingsController.getAllSettings);
router.get('/:group', SettingsController.getSettingsByGroup);
router.post('/', SettingsController.updateSettings);
router.post('/init-defaults', SettingsController.initDefaultSettings);

export default router;
