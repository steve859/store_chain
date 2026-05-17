/**
 * ASR-M3: Distributed Tracing with OpenTelemetry + Jaeger
 *
 * IMPORTANT: This file must be imported BEFORE any other application code
 * so that auto-instrumentations can patch libraries (express, ioredis, pg, etc.).
 *
 * Usage in server.ts:
 *   import './lib/monitoring/tracing';  // must be first import
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode, context, Span } from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'store-chain-api';
const SERVICE_VERSION = process.env.APP_VERSION || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const OTEL_EXPORTER_URL =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
const TRACING_ENABLED = process.env.TRACING_ENABLED !== 'false'; // enabled by default

// ---------------------------------------------------------------------------
// SDK Initialization
// ---------------------------------------------------------------------------

let sdk: NodeSDK | null = null;

if (TRACING_ENABLED) {
  const traceExporter = new OTLPTraceExporter({
    url: OTEL_EXPORTER_URL,
  });

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: ENVIRONMENT,
  });

  sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Fine-tune auto-instrumentations
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req: any) => {
            const ignorePaths = ['/health', '/metrics', '/favicon.ico'];
            return ignorePaths.some(p => req.url?.startsWith(p));
          },
        },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        // Disable noisy/unnecessary ones
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });

  sdk.start();

  console.log(`[Tracing] OpenTelemetry initialized → ${OTEL_EXPORTER_URL}`);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      .then(() => console.log('[Tracing] SDK shut down successfully'))
      .catch((err) => console.error('[Tracing] Shutdown error', err));
  });
} else {
  console.log('[Tracing] Disabled via TRACING_ENABLED=false');
}

// ---------------------------------------------------------------------------
// Helper utilities for manual span creation
// ---------------------------------------------------------------------------

/**
 * Get the default tracer instance
 */
export function getTracer(name = 'store-chain') {
  return trace.getTracer(name);
}

/**
 * Create a child span for a database operation
 */
export function startDatabaseSpan(operationName: string, query?: string): Span {
  const tracer = getTracer();
  const span = tracer.startSpan(`db.${operationName}`, {
    attributes: {
      'db.system': 'postgresql',
      'db.operation': operationName,
      ...(query ? { 'db.statement': query.substring(0, 500) } : {}),
    },
  });
  return span;
}

/**
 * Create a child span for a cache operation
 */
export function startCacheSpan(
  operation: 'get' | 'set' | 'del' | 'pipeline',
  key?: string,
): Span {
  const tracer = getTracer();
  return tracer.startSpan(`cache.${operation}`, {
    attributes: {
      'db.system': 'redis',
      'db.operation': operation,
      ...(key ? { 'cache.key': key.substring(0, 200) } : {}),
    },
  });
}

/**
 * Create a child span for business logic
 */
export function startBusinessSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, { attributes });
}

/**
 * Record an error on the current active span (or a given span)
 */
export function recordSpanError(error: Error, span?: Span): void {
  const target = span || trace.getActiveSpan();
  if (target) {
    target.recordException(error);
    target.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
}

export { sdk, SpanStatusCode, trace, context };
