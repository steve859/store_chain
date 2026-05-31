import pino from 'pino';

/**
 * ASR-M3: Structured Logging with ELK Integration
 *
 * Features:
 * - Structured JSON logs in production (ELK-ready)
 * - Pretty-printed logs in development
 * - Elasticsearch transport in production (via pino-elasticsearch)
 * - Context injection (userId, storeId, requestId, traceId)
 * - Performance tracking
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const ELK_ENABLED = process.env.ELK_ENABLED === 'true';
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const ELK_INDEX = process.env.ELK_INDEX || 'store-chain-logs';

// Build transport targets
function buildTransport(): pino.TransportMultiOptions | pino.TransportSingleOptions | undefined {
  const targets: pino.TransportTargetOptions[] = [];

  if (isDevelopment) {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level: process.env.LOG_LEVEL || 'debug',
    });
  }

  if (ELK_ENABLED) {
    targets.push({
      target: 'pino-elasticsearch',
      options: {
        index: ELK_INDEX,
        node: ELASTICSEARCH_URL,
        flushBytes: 1000,
        flushInterval: 5000,
        // Elasticsearch mapping – ECS-compatible
        esVersion: 8,
        op_type: 'create',
      },
      level: process.env.LOG_LEVEL || 'info',
    });
  }

  if (targets.length === 0) return undefined;
  if (targets.length === 1) return { target: targets[0].target, options: targets[0].options };
  return { targets };
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    // Add trace context fields for correlation with Jaeger
    mixin() {
      // Try to extract OpenTelemetry trace context
      try {
        const { trace } = require('@opentelemetry/api');
        const span = trace.getActiveSpan?.();
        if (span) {
          const ctx = span.spanContext();
          return {
            traceId: ctx.traceId,
            spanId: ctx.spanId,
          };
        }
      } catch {
        // OTel not available, skip
      }
      return {};
    },
    // Standard fields for ECS (Elastic Common Schema)
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.transport(buildTransport() || {
    target: 'pino/file',
    options: { destination: 1 }, // stdout
  }),
);

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
