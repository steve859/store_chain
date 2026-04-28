import pino from 'pino';

/**
 * Structured logging system using Pino
 * Features:
 * - Structured JSON logs in production
 * - Pretty-printed logs in development
 * - Context injection (userId, storeId, requestId)
 * - Performance tracking
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Log structured request information
 */
export function logRequest(req: any, res: any, duration: number) {
  const level = res.statusCode >= 400 ? 'warn' : 'info';
  
  logger[level]({
    type: 'http_request',
    method: req.method,
    path: req.path,
    status: res.statusCode,
    duration: `${duration}ms`,
    userId: req.user?.id,
    storeId: req.storeId,
    ip: req.ip,
  });
}

/**
 * Log errors with full context
 */
export function logError(error: Error, context: Record<string, any> = {}) {
  logger.error({
    type: 'error',
    error: error.message,
    stack: error.stack,
    ...context,
  });
}

/**
 * Log database queries
 */
export function logQuery(
  query: string,
  duration: number,
  params?: any[]
) {
  if (duration > 1000) {
    logger.warn({
      type: 'db_query',
      query: query.substring(0, 200),
      duration: `${duration}ms`,
      slow: true,
      params: params?.length,
    });
  } else {
    logger.debug({
      type: 'db_query',
      duration: `${duration}ms`,
    });
  }
}

/**
 * Log business events
 */
export function logEvent(eventType: string, data: any) {
  logger.info({
    type: 'event',
    eventType,
    ...data,
  });
}
