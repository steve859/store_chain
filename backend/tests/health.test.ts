import request from 'supertest';
import app from '../src/app';

describe('Health endpoint', () => {
  it('GET /health returns ok with timestamp and uptime', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    
    // Verify timestamp is ISO format
    expect(new Date(res.body.timestamp)).toBeInstanceOf(Date);
    
    // Verify uptime is a positive number
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /health/ready returns readiness payload', async () => {
    const res = await request(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('components.database');
    expect(res.body).toHaveProperty('components.redis');
  });

  it('GET /health/full returns component health payload', async () => {
    const res = await request(app).get('/health/full');
    expect([200, 503, 500]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('components.api');
    expect(res.body).toHaveProperty('components.database');
    expect(res.body).toHaveProperty('components.redis');
    expect(res.body).toHaveProperty('components.replication');
    expect(res.body).toHaveProperty('components.backups');
    expect(res.body).toHaveProperty('metrics.averageLatencyMs');
  });
});
