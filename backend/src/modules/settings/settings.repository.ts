export interface SettingItem {
  key: string;
  value: string;
  type?: string;
  group?: string;
  description?: string;
}

export type StoredSetting = Required<Pick<SettingItem, 'key' | 'value'>> &
  Pick<SettingItem, 'type' | 'group' | 'description'>;

// Preserve the current in-memory behavior behind a repository boundary.
const settingsStore = new Map<string, StoredSetting>();

export const SettingsRepository = {
  findAll: async (): Promise<StoredSetting[]> => {
    return Array.from(settingsStore.values());
  },

  findByKey: async (key: string): Promise<StoredSetting | undefined> => {
    return settingsStore.get(key);
  },

  upsertMany: async (settings: SettingItem[]): Promise<StoredSetting[]> => {
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
};
