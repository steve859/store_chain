import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from '../lib/monitoring/logger';

/**
 * Security Headers Middleware
 * Adds HTTP security headers as recommended by OWASP
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  xssFilter: true,
});

/**
 * General API Rate Limiting
 * Prevents abuse: 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Don't rate limit health checks
    return req.path === '/health' || req.path.startsWith('/health/');
  },
  handler: (req, res) => {
    logger.warn({
      type: 'rate_limit_exceeded',
      ip: req.ip,
      path: req.path,
    });

    res.status(429).json({
      error: 'Too many requests',
      retryAfter: (req as any).rateLimit?.resetTime,
    });
  },
});

/**
 * Stricter Rate Limit for Authentication Endpoints
 * Prevents brute force: 5 attempts per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 min
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later.',
  handler: (req, res) => {
    logger.warn({
      type: 'auth_rate_limit_exceeded',
      ip: req.ip,
      email: req.body?.email,
    });

    res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
    });
  },
});

/**
 * Input Validation & Sanitization
 * Removes potential XSS and injection vectors
 */
export function validateInput(req: Request, res: Response, next: NextFunction) {
  // Sanitize JSON body
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }

  next();
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // Remove HTML tags and scripts
      obj[key] = obj[key]
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .trim();
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

/**
 * CORS & Origin Validation
 * Validates incoming requests against allowed origins
 */
export function corsValidation(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://localhost:3000'
  ).split(',');

  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin.trim())) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type,Authorization,X-Store-ID,X-Request-ID'
  );
  res.header('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
}

/**
 * HTTPS Redirect Middleware
 * Redirects HTTP to HTTPS in production
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.header('host')}${req.url}`);
  }

  next();
}

/**
 * Payload Size Limiter
 * Prevents large payload attacks
 */
export function payloadSizeLimit(req: Request, res: Response, next: NextFunction) {
  const maxSize = parseInt(process.env.MAX_REQUEST_SIZE || '10485760'); // 10MB default

  if (req.headers['content-length']) {
    const size = parseInt(req.headers['content-length']);
    if (size > maxSize) {
      return res.status(413).json({
        error: 'Payload too large',
        max: maxSize,
      });
    }
  }

  next();
}

/**
 * Request Timeout Middleware
 * Terminates requests that take too long
 */
export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  const timeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000'); // 30 seconds

  req.setTimeout(timeout, () => {
    logger.warn({
      type: 'request_timeout',
      method: req.method,
      path: req.path,
      timeout: timeout,
    });

    res.status(408).json({
      error: 'Request timeout',
    });
  });

  next();
}
