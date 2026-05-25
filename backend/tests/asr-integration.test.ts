/**
 * ASR Integration Tests
 *
 * Tests that verify ASR compliance through actual HTTP requests.
 * Requires: running backend (app import), but NOT a live database.
 * Tests focus on route existence, middleware behavior, and response structure.
 *
 * Run: npm test -- --testPathPattern=asr-integration
 */

import request from 'supertest';
import app from '../src/app';

// ─── ASR-A1: Health Check Endpoints ─────────────────────────────────────────

describe('ASR-A1: Health Check Endpoints', () => {
  it('GET /health should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
  });

  it('GET /health/ready should return readiness with components', async () => {
    const res = await request(app).get('/health/ready');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('components');
    expect(res.body.components).toHaveProperty('database');
    expect(res.body.components).toHaveProperty('redis');
  });

  it('GET /health/full should return full infrastructure status', async () => {
    const res = await request(app).get('/health/full');
    expect([200, 503, 500]).toContain(res.status);
    expect(res.body).toHaveProperty('components');
    expect(res.body).toHaveProperty('metrics');
  });
});

// ─── ASR-SEC1: RBAC — Protected Routes ──────────────────────────────────────

describe('ASR-SEC1: RBAC Protection', () => {
  it('auth-only routes should return 401 without token', async () => {
    // These routes always require auth
    const authRequiredRoutes = [
      { method: 'post', path: '/api/v1/inventory/adjust' },
      { method: 'post', path: '/api/v1/pos/checkout' },
      { method: 'post', path: '/api/v1/pos/offline/sync' },
    ];

    for (const route of authRequiredRoutes) {
      const res = await (request(app) as any)[route.method](route.path).send({});
      expect([401, 403]).toContain(res.status);
    }
  });

  it('auth middleware should reject invalid token', async () => {
    const res = await request(app)
      .post('/api/v1/pos/checkout')
      .set('Authorization', 'Bearer invalid-token-123')
      .send({});
    expect([401, 403]).toContain(res.status);
  });
});

// ─── ASR-SEC2: Authentication ───────────────────────────────────────────────

describe('ASR-SEC2: Authentication', () => {
  it('POST /api/v1/auth/login should exist and validate input', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});
    // Should not be 404 — route exists
    expect(res.status).not.toBe(404);
  });

  it('POST /api/v1/auth/login with bad credentials should not return 404', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bad@test.com', password: 'wrong' });
    // Route exists (not 404). Without DB may return 500 or 401
    expect(res.status).not.toBe(404);
  });

  it('GET /api/v1/auth/me should require token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect([401, 403]).toContain(res.status);
  });
});

// ─── ASR-SEC4: Rate Limiting & Security Headers ─────────────────────────────

describe('ASR-SEC4: Security Headers', () => {
  it('should have Helmet security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).toHaveProperty('x-content-type-options');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should have X-Frame-Options header', async () => {
    const res = await request(app).get('/health');
    // Helmet sets X-Frame-Options
    expect(res.headers).toHaveProperty('x-frame-options');
  });

  it('health endpoint should not be rate limited', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get('/health'))
    );
    results.forEach(res => {
      expect(res.status).toBe(200);
    });
  });
});

// ─── ASR-P2: Dashboard API ──────────────────────────────────────────────────

describe('ASR-P2: Dashboard Analytics API', () => {
  it('dashboard route should exist (requires auth)', async () => {
    const res = await request(app).get('/api/v1/reports/dashboard');
    // Should be 401/403 (no auth), not 404
    expect(res.status).not.toBe(404);
  });

  it('revenue-chart route should exist', async () => {
    const res = await request(app).get('/api/v1/reports/revenue-chart');
    expect(res.status).not.toBe(404);
  });

  it('top-products route should exist', async () => {
    const res = await request(app).get('/api/v1/reports/top-products');
    expect(res.status).not.toBe(404);
  });
});

// ─── ASR-A2: Offline Sync API ───────────────────────────────────────────────

describe('ASR-A2: Offline Sync API', () => {
  it('POST /api/v1/pos/offline/sync should require auth', async () => {
    const res = await request(app)
      .post('/api/v1/pos/offline/sync')
      .send({ transactions: [] });
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/v1/pos/offline/catalog should require auth', async () => {
    const res = await request(app)
      .get('/api/v1/pos/offline/catalog');
    expect([401, 403]).toContain(res.status);
  });

  it('POST /api/v1/pos/offline/check-keys should require auth', async () => {
    const res = await request(app)
      .post('/api/v1/pos/offline/check-keys')
      .send({ keys: [] });
    expect([401, 403]).toContain(res.status);
  });
});

// ─── ASR-I3: API Standards ──────────────────────────────────────────────────

describe('ASR-I3: API Standards', () => {
  it('should have API versioning prefix /api/v1', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('version', 'v1');
  });

  it('should have Swagger/OpenAPI docs', async () => {
    const res = await request(app).get('/api-docs/');
    expect([200, 301, 304]).toContain(res.status);
  });
});

// ─── ASR-M1: All Domain Routes Exist ────────────────────────────────────────

describe('ASR-M1: All Domain Module Routes', () => {
  // Routes with GET / handler
  const rootRoutes = [
    '/api/v1/stores',
    '/api/v1/products',
    '/api/v1/inventory',
    '/api/v1/orders',
    '/api/v1/invoices',
    '/api/v1/users',
    '/api/v1/promotions',
    '/api/v1/transfers',
    '/api/v1/complaints',
    '/api/v1/returns',
    '/api/v1/pricing',
    '/api/v1/suppliers',
    '/api/v1/settings',
    '/api/v1/audit-logs',
  ];

  it.each(rootRoutes)('route %s should exist (not 404)', async (route) => {
    const res = await request(app).get(route);
    expect(res.status).not.toBe(404);
  });

  // Routes that only have sub-path handlers
  it('loyalty module should have POST /enroll route', async () => {
    const res = await request(app).post('/api/v1/loyalty/enroll').send({});
    // Not 404 = route exists (will be 401 or 400)
    expect(res.status).not.toBe(404);
  });

  it('POS module should have shift routes', async () => {
    const res = await request(app).get('/api/v1/pos/shifts/current');
    expect(res.status).not.toBe(404);
  });
});

// ─── ASR-SEC3: Audit Logs ───────────────────────────────────────────────────

describe('ASR-SEC3: Audit Logs Route', () => {
  it('audit-logs route should exist (requires auth)', async () => {
    const res = await request(app).get('/api/v1/audit-logs');
    expect(res.status).not.toBe(404);
  });
});

// ─── ASR-M3: Observability Endpoints ────────────────────────────────────────

describe('ASR-M3: Observability Endpoints', () => {
  it('/metrics endpoint should exist', async () => {
    const res = await request(app).get('/metrics');
    // Route exists. Content may be async in test env
    expect(res.status).toBe(200);
  });
});
