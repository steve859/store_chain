/**
 * Payment Optimization Handler
 * Implements timeout, retry, and circuit breaker patterns for payment processing
 */

import { logger } from '../monitoring/logger';

/**
 * Payment authorization result
 */
export interface PaymentAuthResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  amount: number;
  message: string;
  latency: number;
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Too many failures, rejecting requests
  HALF_OPEN = 'half_open', // Testing if service recovered
}

/**
 * Circuit breaker for payment provider
 */
class PaymentCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastStateChangeTime = Date.now();
  private readonly failureThreshold = 5;
  private readonly successThreshold = 3;
  private readonly resetTimeout = 60000; // 60 seconds

  /**
   * Check if request can proceed
   */
  canRequest(): boolean {
    // Check if we should attempt to recover
    if (this.state === CircuitState.OPEN) {
      const timeSinceOpen = Date.now() - this.lastStateChangeTime;
      if (timeSinceOpen > this.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        this.failureCount = 0;
        logger.info({ message: 'Circuit breaker entering HALF_OPEN state' });
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Record successful request
   */
  recordSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        this.lastStateChangeTime = Date.now();
        logger.info({ message: 'Circuit breaker closed (service recovered)' });
      }
    }
  }

  /**
   * Record failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold && this.state === CircuitState.CLOSED) {
      this.state = CircuitState.OPEN;
      this.lastStateChangeTime = Date.now();
      logger.warn({
        message: 'Circuit breaker opened (too many failures)',
        failureCount: this.failureCount,
      });
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
}

/**
 * Global circuit breaker for payment provider
 */
const paymentCircuitBreaker = new PaymentCircuitBreaker();

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 2,
};

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Authorize payment with timeout and retry
 */
export async function authorizePaymentWithRetry(
  amount: number,
  currency: string,
  orderId: string,
  timeout: number = 5000, // 5 seconds per attempt
  retryConfig: RetryConfig = defaultRetryConfig,
): Promise<PaymentAuthResult> {
  const startTime = Date.now();

  // Check circuit breaker
  if (!paymentCircuitBreaker.canRequest()) {
    return {
      success: false,
      amount,
      message: 'Payment service unavailable (circuit open)',
      latency: Date.now() - startTime,
    };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await authorizePaymentWithTimeout(
        amount,
        currency,
        orderId,
        timeout,
      );

      if (result.success) {
        paymentCircuitBreaker.recordSuccess();
        result.latency = Date.now() - startTime;
        return result;
      }

      // Check if error is retryable
      if (!isRetryableError(result.message)) {
        paymentCircuitBreaker.recordFailure();
        result.latency = Date.now() - startTime;
        return result;
      }

      lastError = new Error(result.message);

      // Exponential backoff before retry
      if (attempt < retryConfig.maxRetries) {
        const delayMs = getBackoffDelay(attempt, retryConfig);
        logger.debug({
          message: 'Payment auth retry',
          orderId,
          attempt: attempt + 1,
          delayMs,
        });
        await sleep(delayMs);
      }
    } catch (error: any) {
      lastError = error;

      logger.warn({
        message: 'Payment auth error',
        orderId,
        attempt: attempt + 1,
        errorMessage: error.message,
      });

      // Check if error is retryable
      if (!isRetryableError(error.message)) {
        paymentCircuitBreaker.recordFailure();
        break;
      }

      // Exponential backoff before retry
      if (attempt < retryConfig.maxRetries) {
        const delayMs = getBackoffDelay(attempt, retryConfig);
        await sleep(delayMs);
      }
    }
  }

  // All retries exhausted
  paymentCircuitBreaker.recordFailure();

  return {
    success: false,
    amount,
    message: lastError?.message || 'Payment authorization failed after retries',
    latency: Date.now() - startTime,
  };
}

/**
 * Authorize payment with timeout
 * Uses Promise.race to enforce strict timeout
 */
async function authorizePaymentWithTimeout(
  amount: number,
  currency: string,
  orderId: string,
  timeout: number,
): Promise<PaymentAuthResult> {
  const timeoutPromise = new Promise<PaymentAuthResult>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Payment authorization timeout (${timeout}ms)`));
    }, timeout);
  });

  try {
    const authPromise = callPaymentProvider(amount, currency, orderId);
    return await Promise.race([authPromise, timeoutPromise]);
  } catch (error: any) {
    if (error.message.includes('timeout')) {
      return {
        success: false,
        amount,
        message: error.message,
        latency: timeout,
      };
    }
    throw error;
  }
}

/**
 * Call payment provider
 * This is a stub - replace with actual payment gateway integration
 */
async function callPaymentProvider(
  amount: number,
  currency: string,
  orderId: string,
): Promise<PaymentAuthResult> {
  // Simulate payment processing with random latency (10-150ms)
  const latency = 10 + Math.random() * 140;
  await sleep(latency);

  // Simulate occasional failures
  const failureRate = 0.05; // 5% failure rate
  if (Math.random() < failureRate) {
    throw new Error('Payment provider temporarily unavailable');
  }

  // Simulate occasional timeout-recovery scenarios
  const slowRate = 0.02;
  if (Math.random() < slowRate) {
    logger.warn({ message: 'Slow payment response', orderId });
  }

  return {
    success: true,
    transactionId: `txn_${orderId}_${Date.now()}`,
    authCode: `AUTH_${Math.random().toString(36).substring(7).toUpperCase()}`,
    amount,
    message: 'Payment authorized',
    latency,
  };
}

/**
 * Determine if error should trigger retry
 */
function isRetryableError(message: string): boolean {
  const retryablePatterns = [
    'temporarily unavailable',
    'timeout',
    'connection reset',
    'ECONNREFUSED',
    'ENOTFOUND',
    'service unavailable',
    'gateway timeout',
  ];

  return retryablePatterns.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

/**
 * Get payment circuit breaker status
 */
export function getPaymentCircuitBreakerStatus(): {
  state: string;
  canRequest: boolean;
} {
  return {
    state: paymentCircuitBreaker.getState(),
    canRequest: paymentCircuitBreaker.canRequest(),
  };
}

/**
 * Payment processing result with latency details
 */
export interface PaymentProcessingResult {
  success: boolean;
  amount: number;
  authCode?: string;
  transactionId?: string;
  latency: number;
  retries: number;
  message: string;
}

/**
 * Process payment with comprehensive error handling
 */
export async function processPayment(
  amount: number,
  currency: string,
  orderId: string,
  maxLatency: number = 5000,
): Promise<PaymentProcessingResult> {
  const startTime = Date.now();
  let retries = 0;

  const result = await authorizePaymentWithRetry(amount, currency, orderId, maxLatency);

  return {
    success: result.success,
    amount: result.amount,
    authCode: result.authCode,
    transactionId: result.transactionId,
    latency: result.latency,
    retries,
    message: result.message,
  };
}
