/**
 * Phase 3: Distributed Tracing with OpenTelemetry
 * 
 * Enables end-to-end request tracing across services:
 * - Request span creation
 * - Service dependency mapping
 * - Performance analysis
 * - Error tracking with context
 */

import { NodeSDK } from '@opentelemetry/auto-instrumentations-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { BasicTracerProvider, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/tracing';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { CompositePropagator } from '@opentelemetry/core';
import { JaegerPropagator } from '@opentelemetry/jaeger';
import { logger } from './logger';

interface TracingConfig {
  jaegerEndpoint: string;
  jaegerServiceName: string;
  enableConsoleExporter: boolean;
  sampleRate: number; // 0-1
  environment: string;
}

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(config?: Partial<TracingConfig>): void {
  const tracingConfig: TracingConfig = {
    jaegerEndpoint: config?.jaegerEndpoint || 
      process.env.JAEGER_ENDPOINT || 
      'http://localhost:14268/api/traces',
    jaegerServiceName: config?.jaegerServiceName || 
      process.env.SERVICE_NAME || 
      'store-chain-api',
    enableConsoleExporter: config?.enableConsoleExporter ?? false,
    sampleRate: config?.sampleRate ?? 0.1,
    environment: config?.environment || process.env.NODE_ENV || 'development',
  };

  try {
    // Create Jaeger exporter
    const jaegerExporter = new JaegerExporter({
      endpoint: tracingConfig.jaegerEndpoint,
      serviceName: tracingConfig.jaegerServiceName,
      maxPacketSize: 65000,
    });

    // Create tracer provider
    const tracerProvider = new BasicTracerProvider({
      sampler: {
        shouldSample: () => Math.random() < tracingConfig.sampleRate,
      },
      resource: {
        attributes: {
          'service.name': tracingConfig.jaegerServiceName,
          'service.version': process.env.APP_VERSION || '1.0.0',
          'deployment.environment': tracingConfig.environment,
        },
      },
    });

    // Add Jaeger exporter
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(jaegerExporter));

    // Add console exporter in development
    if (tracingConfig.enableConsoleExporter) {
      tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    }

    // Set trace context propagator
    const propagator = new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new JaegerPropagator(),
      ],
    });

    logger.info({
      message: 'OpenTelemetry tracing initialized',
      jaegerEndpoint: tracingConfig.jaegerEndpoint,
      serviceName: tracingConfig.jaegerServiceName,
      sampleRate: tracingConfig.sampleRate,
    });
  } catch (error) {
    logger.error({
      message: 'Failed to initialize tracing',
      error,
    });
  }
}

/**
 * Middleware to create spans for each request
 * 
 * Usage:
 *   app.use(createRequestSpanMiddleware());
 */
export function createRequestSpanMiddleware() {
  return (req: any, res: any, next: any) => {
    const tracer = global.tracer || {};
    
    // Create span for this request
    const span = tracer.startSpan?.(`${req.method} ${req.path}`, {
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.host': req.hostname,
        'http.scheme': req.protocol,
        'http.user_agent': req.get('user-agent'),
        'http.client_ip': req.ip,
      },
    });

    // Add trace ID to response headers
    if (span?.spanContext?.traceId) {
      res.set('X-Trace-ID', span.spanContext.traceId);
    }

    // Wrap response methods to capture status and duration
    const originalJson = res.json;
    res.json = function(body: any) {
      if (span) {
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response_content_length': JSON.stringify(body).length,
        });
        span.end();
      }
      return originalJson.call(this, body);
    };

    // Handle errors
    const originalSend = res.send;
    res.send = function(data: any) {
      if (span) {
        if (res.statusCode >= 400) {
          span.recordException(new Error(`HTTP ${res.statusCode}: ${req.method} ${req.path}`));
          span.setAttributes({
            'error': true,
            'error.kind': 'HttpError',
          });
        }
        span.setAttributes({
          'http.status_code': res.statusCode,
        });
        span.end();
      }
      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Create a child span for database operations
 */
export function createDatabaseSpan(
  operationName: string,
  query: string,
  params?: any[],
): any {
  const tracer = global.tracer || {};
  
  return tracer.startSpan?.(operationName, {
    attributes: {
      'db.operation': operationName,
      'db.statement': query.substring(0, 500), // Limit to 500 chars for security
      'db.params_count': params?.length || 0,
      'span.kind': 'client',
      'db.type': 'sql',
    },
  });
}

/**
 * Create a child span for cache operations
 */
export function createCacheSpan(
  operation: 'get' | 'set' | 'delete' | 'invalidate',
  key: string,
): any {
  const tracer = global.tracer || {};
  
  return tracer.startSpan?.(`cache.${operation}`, {
    attributes: {
      'cache.operation': operation,
      'cache.key': key.substring(0, 200),
      'span.kind': 'client',
    },
  });
}

/**
 * Create a child span for external API calls
 */
export function createExternalApiSpan(
  serviceName: string,
  method: string,
  url: string,
): any {
  const tracer = global.tracer || {};
  
  return tracer.startSpan?.(`external.${serviceName}`, {
    attributes: {
      'http.method': method,
      'http.url': url,
      'span.kind': 'client',
      'external.service': serviceName,
    },
  });
}

/**
 * Create a child span for business logic operations
 */
export function createBusinessSpan(
  operationName: string,
  attributes?: Record<string, any>,
): any {
  const tracer = global.tracer || {};
  
  return tracer.startSpan?.(operationName, {
    attributes: {
      'span.kind': 'internal',
      ...(attributes || {}),
    },
  });
}

export default {
  initializeTracing,
  createRequestSpanMiddleware,
  createDatabaseSpan,
  createCacheSpan,
  createExternalApiSpan,
  createBusinessSpan,
};
