import request from 'supertest';
import app from '../src/app';

describe('Settings routes', () => {
  it('keeps POST /api/v1/settings response shape for bulk updates', async () => {
    const res = await request(app)
      .post('/api/v1/settings')
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

  it('keeps GET /api/v1/settings/:group response as an array', async () => {
    await request(app)
      .post('/api/v1/settings')
      .send([{ key: 'TEST_SETTING_GROUPED', value: 'enabled', group: 'TEST_GROUP' }]);

    const res = await request(app).get('/api/v1/settings/TEST_GROUP');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'TEST_SETTING_GROUPED',
          value: 'enabled',
          group: 'TEST_GROUP',
        }),
      ]),
    );
  });

  it('keeps empty bulk update response as an empty array', async () => {
    const res = await request(app).post('/api/v1/settings').send([]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('keeps invalid bulk update response shape', async () => {
    const res = await request(app).post('/api/v1/settings').send({ key: 'INVALID' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Body must be an array of settings' });
  });
});
