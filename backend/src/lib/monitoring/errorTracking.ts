import * as Sentry from '@sentry/node';
import { logger } from './logger';

/**
 * Error Tracking with Sentry
 * Captures exceptions, performance issues, and messages
 * Sends to Sentry.io for centralized error monitoring
 */

export function initErrorTracking() {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️  SENTRY_DSN not set, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACE_RATE || '0.1'), // 10% of transactions
    debug: process.env.NODE_ENV === 'development',
  });

  console.log('✅ Sentry error tracking initialized');
}

/**
 * Capture exception with context
 */
export function captureException(error: Error, context: Record<string, any> = {}) {
  logger.error({
    type: 'captured_exception',
    error: error.message,
    context,
  });

  Sentry.captureException(error, {
    contexts: { custom: context },
  });
}

/**
 * Capture message
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' = 'info'
) {
  const logLevel = level === 'fatal' ? 'error' : level === 'warning' ? 'warn' : level;
  (logger as any)[logLevel]({
    type: 'captured_message',
    message,
  });

  Sentry.captureMessage(message, level as any);
}

/**
 * Capture performance issue
 */
export function capturePerformanceIssue(
  operation: string,
  duration: number,
  threshold: number
) {
  if (duration > threshold) {
    captureMessage(
      `Slow operation: ${operation} took ${duration}ms (threshold: ${threshold}ms)`,
      'warning'
    );
  }
}
