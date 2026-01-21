interface SettingItem {
  key: string;
  value: string;
  type?: string;   // <-- Thêm type
  group?: string;
  description?: string;
}

type StoredSetting = Required<Pick<SettingItem, 'key' | 'value'>> &
  Pick<SettingItem, 'type' | 'group' | 'description'>;

// NOTE: Schema hiện tại chưa có bảng system_settings, nên tạm dùng in-memory.
// Khi bổ sung bảng, có thể thay thế Map này bằng Prisma.
const settingsStore = new Map<string, StoredSetting>();

export const SettingsService = {
  // 1. Lấy toàn bộ
  getAllSettings: async () => {
    return Array.from(settingsStore.values()).sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  },

  // 2. Lấy theo nhóm
  getSettingsByGroup: async (group: string) => {
    return Array.from(settingsStore.values())
      .filter(s => (s.group ?? 'GENERAL').toUpperCase() === group.toUpperCase())
      .sort((a, b) => a.key.localeCompare(b.key));
  },

  // 3. Lấy giá trị đơn lẻ (Helper)
  getSettingValue: async (key: string) => {
    const setting = settingsStore.get(key);
    // Logic parse giá trị dựa trên type
    if (setting) {
        if (setting.type === 'number') return Number(setting.value);
        if (setting.type === 'boolean') return setting.value === 'true';
        if (setting.type === 'json') return JSON.parse(setting.value);
        return setting.value;
    }
    return null;
  },

  // 4. Update (Bulk Upsert)
  updateSettings: async (settings: SettingItem[]) => {
    const updated: StoredSetting[] = [];

    for (const item of settings) {
      const existing = settingsStore.get(item.key);
      const next: StoredSetting = {
        key: item.key,
        value: String(item.value),
        type: item.type ?? existing?.type ?? 'string',
        group: item.group ?? existing?.group ?? 'GENERAL',
        description: item.description ?? existing?.description,
      };

      settingsStore.set(item.key, next);
      updated.push(next);
    }

    return updated;
  },

  // 5. Init Default Data (Đã cập nhật type)
  initDefaultSettings: async () => {
    const defaults = [
      { key: 'COMPANY_NAME', value: 'My Store Chain', type: 'string', group: 'GENERAL', description: 'Tên hiển thị của hệ thống' },
      { key: 'CURRENCY', value: 'VND', type: 'string', group: 'FINANCE', description: 'Đơn vị tiền tệ' },
      { key: 'DEFAULT_TAX', value: '8', type: 'number', group: 'FINANCE', description: 'Thuế mặc định (%)' },
      { key: 'ALLOW_NEGATIVE_STOCK', value: 'false', type: 'boolean', group: 'INVENTORY', description: 'Cho phép bán âm kho' }
    ];

    await SettingsService.updateSettings(defaults);
  }
};