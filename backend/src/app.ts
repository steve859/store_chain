import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import notFound from './middlewares/notFound';
import errorHandler from './middlewares/errorHandler';
import { setupSwagger } from './docs/swagger';
import {
  monitoringMiddleware,
  errorMonitoringMiddleware,
  requestIdMiddleware,
  verboseLoggingMiddleware,
} from './middlewares/monitoring.middleware';
import {
  securityHeaders,
  apiLimiter,
  authLimiter,
  validateInput,
  corsValidation,
  httpsRedirect,
  payloadSizeLimit,
  requestTimeout,
} from './middlewares/security.middleware';
import { metricsEndpoint } from './lib/monitoring/metrics';
import { initErrorTracking } from './lib/monitoring/errorTracking';
import { logger } from './lib/monitoring/logger';
import healthRoutes from './routes/health';

const app = express();

// Initialize error tracking (Sentry)
initErrorTracking();

// Security middlewares
app.use(httpsRedirect);
app.use(securityHeaders);
app.use(corsValidation);
app.use(payloadSizeLimit);
app.use(requestTimeout);
app.use(apiLimiter);

// Standard middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Request tracking
app.use(requestIdMiddleware);
app.use(verboseLoggingMiddleware);
app.use(validateInput);

// Monitoring
app.use(monitoringMiddleware);

// Health checks (liveness, readiness, full infrastructure status)
app.use('/health', healthRoutes);

// Metrics endpoint (Prometheus)
app.get('/metrics', metricsEndpoint);

// Swagger documentation
setupSwagger(app);

// Auth endpoints with stricter rate limiting
app.use('/api/v1/auth', authLimiter);

// API routes
app.use('/api/v1', routes);

// Not found handler
app.use(notFound);

// Error monitoring and handling
app.use(errorMonitoringMiddleware);
app.use(errorHandler);

logger.info({ message: '✅ Express app configured with Phase 1 enhancements' });

export default app;
