import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../src/modules/settings/settings.service', () => ({
  SettingsService: {
    getAllSettings: jest.fn(),
    getSettingsByGroup: jest.fn(),
    updateSettings: jest.fn(),
    initDefaultSettings: jest.fn(),
  },
}));

import app from '../src/app';
import { SettingsService } from '../src/modules/settings/settings.service';

const settingsServiceMock = SettingsService as jest.Mocked<typeof SettingsService>;

const signToken = (overrides?: Record<string, unknown>) => {
  const payload = {
    userId: 1,
    email: 'settings-test@example.com',
    role: 'ADMIN',
    storeIds: [1],
    primaryStoreId: 1,
    ...overrides,
  };

  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: '1h' });
};

describe('Settings routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication for settings reads', async () => {
    const res = await request(app).get('/api/v1/settings');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Access token required' });
    expect(settingsServiceMock.getAllSettings).not.toHaveBeenCalled();
  });

  it('allows STORE_MANAGER to reach the existing read handler path', async () => {
    settingsServiceMock.getSettingsByGroup.mockResolvedValueOnce([
      { key: 'DEFAULT_TAX', value: '8', type: 'number', group: 'FINANCE' },
    ]);

    const res = await request(app)
      .get('/api/v1/settings/finance')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`);

    expect(res.status).toBe(200);
    expect(settingsServiceMock.getSettingsByGroup).toHaveBeenCalledWith('FINANCE');
    expect(res.body).toEqual([
      { key: 'DEFAULT_TAX', value: '8', type: 'number', group: 'FINANCE' },
    ]);
  });

  it('allows DISTRICT_MANAGER to reach the all-settings read handler path', async () => {
    settingsServiceMock.getAllSettings.mockResolvedValueOnce([
      { key: 'COMPANY_NAME', value: 'My Store Chain', type: 'string', group: 'GENERAL' },
    ]);

    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${signToken({ role: 'DISTRICT_MANAGER' })}`);

    expect(res.status).toBe(200);
    expect(settingsServiceMock.getAllSettings).toHaveBeenCalled();
    expect(res.body).toEqual([
      { key: 'COMPANY_NAME', value: 'My Store Chain', type: 'string', group: 'GENERAL' },
    ]);
  });

  it('rejects wrong role for settings writes', async () => {
    const res = await request(app)
      .post('/api/v1/settings')
      .set('Authorization', `Bearer ${signToken({ role: 'STORE_MANAGER' })}`)
      .send([{ key: 'DEFAULT_TAX', value: '10', type: 'number', group: 'FINANCE' }]);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(settingsServiceMock.updateSettings).not.toHaveBeenCalled();
  });

  it('keeps POST /api/v1/settings response shape for admin bulk updates', async () => {
    settingsServiceMock.updateSettings.mockResolvedValueOnce([
      { key: 'TEST_SETTING_ALPHA', value: 'one', group: 'TEST' },
      { key: 'TEST_SETTING_BETA', value: '2', type: 'number', group: 'TEST' },
    ]);

    const res = await request(app)
      .post('/api/v1/settings')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send([
        { key: 'TEST_SETTING_ALPHA', value: 'one', group: 'TEST' },
        { key: 'TEST_SETTING_BETA', value: '2', type: 'number', group: 'TEST' },
      ]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'Settings updated successfully',
      updatedCount: 2,
    });
  });

  it('keeps empty bulk update response as an empty array for admin', async () => {
    const res = await request(app)
      .post('/api/v1/settings')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`)
      .send([]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(settingsServiceMock.updateSettings).not.toHaveBeenCalled();
  });

  it('rejects wrong role for init-defaults', async () => {
    const res = await request(app)
      .post('/api/v1/settings/init-defaults')
      .set('Authorization', `Bearer ${signToken({ role: 'DISTRICT_MANAGER' })}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Forbidden');
    expect(settingsServiceMock.initDefaultSettings).not.toHaveBeenCalled();
  });

  it('allows ADMIN to reach init-defaults handler path', async () => {
    settingsServiceMock.initDefaultSettings.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/v1/settings/init-defaults')
      .set('Authorization', `Bearer ${signToken({ role: 'ADMIN' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Default settings initialized' });
    expect(settingsServiceMock.initDefaultSettings).toHaveBeenCalled();
  });
});
