import { SettingItem, SettingsRepository } from './settings.repository';

export const SettingsService = {
  getAllSettings: async () => {
    const settings = await SettingsRepository.findAll();
    return settings.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  },

  getSettingsByGroup: async (group: string) => {
    const settings = await SettingsRepository.findAll();
    return settings
      .filter((s) => (s.group ?? 'GENERAL').toUpperCase() === group.toUpperCase())
      .sort((a, b) => a.key.localeCompare(b.key));
  },

  getSettingValue: async (key: string) => {
    const setting = await SettingsRepository.findByKey(key);
    if (setting) {
      if (setting.type === 'number') return Number(setting.value);
      if (setting.type === 'boolean') return setting.value === 'true';
      if (setting.type === 'json') return JSON.parse(setting.value);
      return setting.value;
    }
    return null;
  },

  updateSettings: async (settings: SettingItem[]) => {
    return SettingsRepository.upsertMany(settings);
  },

  initDefaultSettings: async () => {
    const defaults = [
      { key: 'COMPANY_NAME', value: 'My Store Chain', type: 'string', group: 'GENERAL', description: 'Tên hiển thị của hệ thống' },
      { key: 'CURRENCY', value: 'VND', type: 'string', group: 'FINANCE', description: 'Đơn vị tiền tệ' },
      { key: 'DEFAULT_TAX', value: '8', type: 'number', group: 'FINANCE', description: 'Thuế mặc định (%)' },
      { key: 'ALLOW_NEGATIVE_STOCK', value: 'false', type: 'boolean', group: 'INVENTORY', description: 'Cho phép bán âm kho' },
    ];

    await SettingsService.updateSettings(defaults);
  },
};
