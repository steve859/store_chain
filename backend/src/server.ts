// ASR-M3: Must be imported FIRST for auto-instrumentation to work
import './lib/monitoring/tracing';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './events/socket';
import { ioMiddleware } from './middlewares/io.middleware';
import dotenv from 'dotenv';
import app from './app';
import { startScheduler } from './modules/cron/scheduler';
import { closeQueues } from './lib/queues/jobQueue';
import { logger } from './lib/monitoring/logger';
import { pricingEngine } from './lib/cache/pricingEngine';
import { warmupPromotionCache } from './lib/cache/promotionRules';
import { analyticsAggregator } from './modules/reports/analyticsAggregator';

// Import all job processors to register them
import './lib/queues/processors';

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const startServer = async () => {
  const httpServer = http.createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  setupSocketHandlers(io);
  app.set('io', io);
  app.use(ioMiddleware(io));

  await startScheduler();

  // Warmup pricing engine cache asynchronously
  pricingEngine
    .warmupEngineCache()
    .catch(error => {
      logger.warn({
        message: 'Pricing engine warmup failed on startup',
        errorMessage: error.message,
      });
    });

  // Warmup promotion cache asynchronously
  warmupPromotionCache()
    .catch(error => {
      logger.warn({
        message: 'Promotion cache warmup failed on startup',
        errorMessage: error.message,
      });
    });

  // Start Real-time Data Aggregation Pipeline (CQRS for Analytics)
  analyticsAggregator.start();

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info({
      message: '🚀 API Server Started',
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      features: [
        '✅ Job Queue (Bull.js)',
        '✅ Pricing Engine (L1 In-Memory Cache)',
        '✅ Monitoring (Prometheus)',
        '✅ Error Tracking (Sentry)',
        '✅ Security Headers',
        '✅ Rate Limiting',
        '✅ Socket.IO Real-time',
        '✅ OpenTelemetry Distributed Tracing (ASR-M3)',
        '✅ ELK Centralized Logging (ASR-M3)',
        '✅ CQRS Analytics Pipeline (ASR-P2)',
        '✅ Saga Orchestrator (ASR-P3)',
      ],
    });

    console.log(`
╔════════════════════════════════════════════╗
║   Store Chain API - ASR Ready              ║
╠════════════════════════════════════════════╣
║ 🚀 Server:   http://0.0.0.0:${PORT}       ║
║ 📊 Metrics:  /metrics                      ║
║ 📋 Swagger:  /api-docs                     ║
║ 💚 Health:   /health                       ║
║                                            ║
║ ASR-P1 (<100ms Pricing Lookup):            ║
║ ✅ L1 In-Memory Cache (<1ms)               ║
║ ✅ L2 Redis Response Cache (~5ms)          ║
║ ✅ L3 DB Fallback (<50ms)                  ║
║                                            ║
║ ASR-M3 (Observability):                    ║
║ ✅ OpenTelemetry + Jaeger Tracing          ║
║ ✅ ELK Centralized Logging                 ║
║ ✅ Prometheus Metrics                      ║
║                                            ║
║ Additional Features:                       ║
║ ✅ Saga Pattern Checkout (ASR-P3)          ║
║ ✅ CQRS Analytics (ASR-P2)                 ║
║ ✅ Redis Pub/Sub Event Bus (ASR-S1)        ║
║ ✅ PII Encryption (ASR-SEC5)               ║
║ ✅ Optimistic Locking (ASR-R3)             ║
║ ✅ Terraform IaC (ASR-R1/R2)               ║
║ ✅ CI/CD Blue-Green Deploy (ASR-O2)         ║
╚════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info({ message: 'SIGTERM received, shutting down gracefully...' });
    await closeQueues();
    httpServer.close(() => {
      logger.info({ message: 'Server closed' });
      process.exit(0);
    });
    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error({ message: 'Forced shutdown after timeout' });
      process.exit(1);
    }, 10000);
  });

  process.on('SIGINT', async () => {
    logger.info({ message: 'SIGINT received, shutting down gracefully...' });
    await closeQueues();
    httpServer.close(() => {
      logger.info({ message: 'Server closed' });
      process.exit(0);
    });
  });

  // Catch unhandled exceptions
  process.on('uncaughtException', (error) => {
    logger.error({
      type: 'uncaught_exception',
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  // Catch unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      type: 'unhandled_rejection',
      reason: String(reason),
    });
    process.exit(1);
  });
};

startServer().catch((error) => {
  logger.error({ message: 'Failed to start server', error: error.message });
  process.exit(1);
});
