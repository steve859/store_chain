import { Router } from 'express';
import { SettingsService } from './settings.service';

const router = Router();

// GET /api/settings
// Lấy tất cả settings
router.get('/', async (req, res) => {
  try {
    const settings = await SettingsService.getAllSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/settings/:group
// Lấy settings theo nhóm (VD: /api/settings/FINANCE)
router.get('/:group', async (req, res) => {
  try {
    const group = req.params.group.toUpperCase();
    const settings = await SettingsService.getSettingsByGroup(group);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/settings
// Cập nhật hoặc tạo mới (nhận vào một mảng)
/* Body mẫu:
[
  { "key": "COMPANY_NAME", "value": "Siêu thị ABC", "group": "GENERAL" },
  { "key": "DEFAULT_TAX", "value": "10", "group": "FINANCE" }
]
*/
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Body must be an array of settings' });
    }

    if (data.length === 0) {
      return res.json([]);
    }

    const result = await SettingsService.updateSettings(data);
    res.json({ message: 'Settings updated successfully', updatedCount: result.length });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// API đặc biệt: Reset về mặc định (Chỉ dùng cho Admin lúc setup)
router.post('/init-defaults', async (req, res) => {
  try {
    await SettingsService.initDefaultSettings();
    res.json({ message: 'Default settings initialized' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;