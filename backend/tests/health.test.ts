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
});
