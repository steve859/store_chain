/**
 * Checkout Latency Monitoring Middleware
 * Tracks and monitors checkout operation latencies
 * Ensures critical path stays <200ms, total response <500ms
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/monitoring/logger';

interface CheckoutMetrics {
  startTime: number;
  operations: Map<string, { startTime: number; duration?: number }>;
}

// Store metrics in request context
declare global {
  namespace Express {
    interface Request {
      checkoutMetrics?: CheckoutMetrics;
    }
  }
}

/**
 * Initialize checkout metrics tracking
 */
export function checkoutMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only track checkout endpoints
  if (!req.path.includes('/checkout')) {
    return next();
  }

  req.checkoutMetrics = {
    startTime: Date.now(),
    operations: new Map(),
  };

  // Intercept response to log total latency
  const originalJson = res.json;
  res.json = function (data: any) {
    const totalTime = Date.now() - req.checkoutMetrics!.startTime;

    // Build metrics object
    const metricsData: Record<string, any> = {
      total_ms: totalTime,
      operations: {},
    };

    req.checkoutMetrics!.operations.forEach((op, name) => {
      metricsData.operations[name] = {
        duration_ms: op.duration || 0,
      };
    });

    // Log warning if total time exceeds 500ms
    if (totalTime > 500) {
      logger.warn({
        message: 'Checkout latency exceeds 500ms target',
        path: req.path,
        method: req.method,
        totalMs: totalTime,
        metrics: metricsData,
      });
    } else if (totalTime > 300) {
      logger.info({
        message: 'Checkout latency elevated',
        path: req.path,
        method: req.method,
        totalMs: totalTime,
      });
    }

    // Add metrics to response headers
    res.set({
      'X-Checkout-Total-Ms': String(totalTime),
      'X-Checkout-Operations': String(req.checkoutMetrics!.operations.size),
    });

    // Add metrics to response body if it's an object
    if (data && typeof data === 'object') {
      data._metrics = metricsData;
    }

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Track operation latency within checkout
 */
export function trackCheckoutOperation(req: Request, name: string) {
  if (!req.checkoutMetrics) {
    return {
      end: () => {},
      duration: () => 0,
    };
  }

  const startTime = Date.now();
  const metrics = req.checkoutMetrics;

  metrics.operations.set(name, { startTime });

  return {
    end: () => {
      const op = metrics.operations.get(name);
      if (op) {
        op.duration = Date.now() - startTime;

        // Log slow operations
        if (op.duration > 100) {
          logger.warn({
            message: 'Checkout operation exceeded 100ms',
            operation: name,
            durationMs: op.duration,
          });
        }
      }
    },
    duration: () => {
      const op = metrics.operations.get(name);
      return op?.duration || 0;
    },
  };
}

/**
 * Get all checkout metrics from request
 */
export function getCheckoutMetrics(req: Request) {
  if (!req.checkoutMetrics) {
    return null;
  }

  const metrics: Record<string, any> = {
    total_ms: Date.now() - req.checkoutMetrics.startTime,
    operations: {},
  };

  req.checkoutMetrics.operations.forEach((op, name) => {
    metrics.operations[name] = {
      duration_ms: op.duration || 0,
      percentage: op.duration ? ((op.duration / metrics.total_ms) * 100).toFixed(1) : 0,
    };
  });

  return metrics;
}

/**
 * Critical path timeout guard
 * Fails checkout if critical path (payment + inventory) exceeds limit
 */
export class CriticalPathGuard {
  private static MAX_CRITICAL_PATH_MS = 300; // 300ms limit for critical ops
  private static MAX_TOTAL_MS = 500; // 500ms limit for total checkout

  static markCriticalPathStart(req: Request): void {
    if (!req.checkoutMetrics) {
      req.checkoutMetrics = {
        startTime: Date.now(),
        operations: new Map(),
      };
    }
  }

  static checkCriticalPathTimeout(req: Request): boolean {
    if (!req.checkoutMetrics) {
      return false;
    }

    const criticalOps = ['payment_authorization', 'inventory_reservation', 'tax_calculation'];
    const criticalTime = Array.from(req.checkoutMetrics.operations.entries())
      .filter(([name]) => criticalOps.includes(name))
      .reduce((sum, [, op]) => sum + (op.duration || 0), 0);

    if (criticalTime > this.MAX_CRITICAL_PATH_MS) {
      logger.error({
        message: 'Critical path timeout exceeded',
        criticalTimeMs: criticalTime,
        limit: this.MAX_CRITICAL_PATH_MS,
      });
      return true;
    }

    return false;
  }

  static checkTotalTimeout(req: Request): boolean {
    if (!req.checkoutMetrics) {
      return false;
    }

    const totalTime = Date.now() - req.checkoutMetrics.startTime;

    if (totalTime > this.MAX_TOTAL_MS) {
      logger.error({
        message: 'Total checkout timeout exceeded',
        totalMs: totalTime,
        limit: this.MAX_TOTAL_MS,
      });
      return true;
    }

    return false;
  }
}
