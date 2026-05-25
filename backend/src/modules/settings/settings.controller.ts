import { Request, Response } from 'express';
import { SettingsService } from './settings.service';

export const SettingsController = {
  getAllSettings: async (_req: Request, res: Response) => {
    try {
      const settings = await SettingsService.getAllSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getSettingsByGroup: async (req: Request, res: Response) => {
    try {
      const group = req.params.group.toUpperCase();
      const settings = await SettingsService.getSettingsByGroup(group);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  updateSettings: async (req: Request, res: Response) => {
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
  },

  initDefaultSettings: async (_req: Request, res: Response) => {
    try {
      await SettingsService.initDefaultSettings();
      res.json({ message: 'Default settings initialized' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },
};
