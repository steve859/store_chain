import * as promClient from 'prom-client';

/**
 * Prometheus Metrics
 * Exposes via GET /metrics for scraping by monitoring systems
 * Tracks: API latency, errors, cache, database, business metrics
 */

// Collect default metrics
promClient.collectDefaultMetrics();

// API Request metrics
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5], // 50ms, 100ms, 200ms, 500ms, 1s, 2s, 5s
});

export const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpErrorsTotal = new promClient.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP errors',
  labelNames: ['method', 'route', 'error_type'],
});

// Database metrics
export const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query latency in seconds',
  labelNames: ['query_type', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1],
});

export const dbQueryErrors = new promClient.Counter({
  name: 'db_query_errors_total',
  help: 'Total database query errors',
  labelNames: ['query_type', 'table', 'error_type'],
});

// Cache metrics
export const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_key', 'store_id'],
});

export const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_key', 'store_id'],
});

export const cacheSize = new promClient.Gauge({
  name: 'cache_size_bytes',
  help: 'Cache size in bytes',
  labelNames: ['cache_type'],
});

// Job queue metrics
export const jobsQueued = new promClient.Counter({
  name: 'jobs_queued_total',
  help: 'Total jobs queued',
  labelNames: ['job_type'],
});

export const jobsCompleted = new promClient.Counter({
  name: 'jobs_completed_total',
  help: 'Total jobs completed',
  labelNames: ['job_type'],
});

export const jobsFailed = new promClient.Counter({
  name: 'jobs_failed_total',
  help: 'Total jobs failed',
  labelNames: ['job_type'],
});

export const jobDuration = new promClient.Histogram({
  name: 'job_duration_seconds',
  help: 'Job execution duration in seconds',
  labelNames: ['job_type'],
  buckets: [1, 5, 10, 30, 60, 300],
});

// Business metrics
export const ordersCreated = new promClient.Counter({
  name: 'orders_created_total',
  help: 'Total orders created',
  labelNames: ['store_id'],
});

export const revenueTotal = new promClient.Gauge({
  name: 'revenue_total_cents',
  help: 'Total revenue in cents',
  labelNames: ['store_id', 'currency'],
});

export const inventoryValue = new promClient.Gauge({
  name: 'inventory_value_cents',
  help: 'Total inventory value in cents',
  labelNames: ['store_id'],
});

export const activeConcurrentUsers = new promClient.Gauge({
  name: 'active_concurrent_users',
  help: 'Number of active concurrent users',
  labelNames: ['store_id'],
});

// System metrics
export const systemUptime = new promClient.Gauge({
  name: 'system_uptime_seconds',
  help: 'System uptime in seconds',
});

export const errorRate = new promClient.Gauge({
  name: 'error_rate_percent',
  help: 'Error rate as percentage',
});

/**
 * Export metrics endpoint for Prometheus scraping
 */
export function metricsEndpoint(req: any, res: any) {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
}

/**
 * Get summary of key metrics
 */
export function getMetricsSummary() {
  return {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };
}
