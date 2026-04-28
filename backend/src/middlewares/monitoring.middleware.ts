import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal } from '../lib/monitoring/metrics';
import { logRequest, logError } from '../lib/monitoring/logger';
import { capturePerformanceIssue } from '../lib/monitoring/errorTracking';

/**
 * Middleware to track HTTP request metrics and logs
 * Measures: latency, status codes, errors
 * Logs: slow requests, errors
 * Alerts: performance degradation
 */
export function monitoringMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Override res.json() to capture and track response
  const originalJson = res.json.bind(res);
  res.json = function (data: any) {
    const duration = Date.now() - startTime;

    // Record metrics
    httpRequestDuration
      .labels(req.method, req.path, String(res.statusCode))
      .observe(duration / 1000); // Convert to seconds

    httpRequestTotal
      .labels(req.method, req.path, String(res.statusCode))
      .inc();

    // Log request
    logRequest(req, res, duration);

    // Alert on slow requests (P95 target: 200ms)
    if (duration > 500) {
      capturePerformanceIssue(
        `${req.method} ${req.path}`,
        duration,
        500
      );
    }

    return originalJson(data);
  };

  // Override res.status().json() chain
  const originalStatus = res.status.bind(res);
  (res as any).status = function (code: number) {
    const status = originalStatus(code);
    return {
      ...status,
      json: (data: any) => {
        const duration = Date.now() - startTime;

        httpRequestDuration
          .labels(req.method, req.path, String(code))
          .observe(duration / 1000);

        httpRequestTotal
          .labels(req.method, req.path, String(code))
          .inc();

        return originalJson(data);
      },
    };
  };

  next();
}

/**
 * Error handling middleware with monitoring
 * Logs errors, captures to Sentry, returns proper response
 */
export function errorMonitoringMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logError(error, {
    method: req.method,
    path: req.path,
    userId: (req as any).user?.id,
    storeId: (req as any).storeId,
  });

  // Don't expose error details in production
  const errorResponse = {
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message,
    status: res.statusCode || 500,
  };

  res.status(res.statusCode || 500).json(errorResponse);
}

/**
 * Request ID middleware
 * Tracks request through system for correlation
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string || 
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
}

/**
 * Log all requests in development
 */
export function verboseLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`📨 ${req.method} ${req.path}`, {
      query: req.query,
      userId: (req as any).user?.id,
    });
  }

  next();
}
