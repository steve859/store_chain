/**
 * POS Checkout Router (State Machine Implementation)
 * 
 * RESTful endpoints for managing checkout sessions using state machine pattern.
 * This is an alternative to the legacy checkout endpoint that uses explicit state transitions.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
// import { requireActiveStore } from '../../middlewares/store.middleware';
import { checkoutService, CreateCheckoutRequest, AddItemRequest, CheckoutRequest } from './checkout.service';
import { logger } from '../../lib/monitoring/logger';

const router = Router();

// Middleware
router.use(authenticateToken);

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/pos/checkout/initialize
 * Initialize a new checkout session
 * 
 * @example
 * POST /api/v1/pos/checkout/initialize
 * {
 *   "storeId": "550e8400-e29b-41d4-a716-446655440000",
 *   "cashierId": "550e8400-e29b-41d4-a716-446655440001"
 * }
 * 
 * Response (201):
 * {
 *   "checkoutId": "checkout_1715000000000_abc123def",
 *   "state": "CART_OPEN",
 *   "context": { ... }
 * }
 */
router.post('/initialize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, cashierId } = req.body;

    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required' });
    }

    const request: CreateCheckoutRequest = {
      storeId,
      cashierId,
    };

    const context = await checkoutService.initializeCheckout(request);

    res.status(201).json({
      checkoutId: context.checkoutId,
      state: 'CART_OPEN',
      context,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pos/checkout/:checkoutId/add-item
 * Add item to cart
 * 
 * @example
 * POST /api/v1/pos/checkout/checkout_1715000000000_abc123def/add-item
 * {
 *   "skuId": "550e8400-e29b-41d4-a716-446655440002",
 *   "quantity": 2,
 *   "price": 9.99
 * }
 * 
 * Response (200):
 * {
 *   "item": { ... },
 *   "state": "CART_OPEN",
 *   "context": { ... }
 * }
 */
router.post('/:checkoutId/add-item', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;
    const { skuId, quantity, price } = req.body;

    if (!skuId || !quantity) {
      return res.status(400).json({ error: 'skuId and quantity are required' });
    }

    const itemRequest: AddItemRequest = {
      skuId,
      quantity: Number(quantity),
      price: price ? Number(price) : undefined,
    };

    const item = await checkoutService.addItemToCart(checkoutId, itemRequest);
    const state = checkoutService.getCheckoutState(checkoutId);
    const context = checkoutService.getCheckoutContext(checkoutId);

    res.json({
      item,
      state,
      context,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/pos/checkout/:checkoutId/item/:skuId
 * Remove item from cart
 * 
 * @example
 * DELETE /api/v1/pos/checkout/checkout_1715000000000_abc123def/item/550e8400-e29b-41d4-a716-446655440002
 * 
 * Response (200):
 * {
 *   "state": "CART_OPEN",
 *   "context": { ... }
 * }
 */
router.delete('/:checkoutId/item/:skuId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId, skuId } = req.params;

    await checkoutService.removeItemFromCart(checkoutId, skuId);
    const state = checkoutService.getCheckoutState(checkoutId);
    const context = checkoutService.getCheckoutContext(checkoutId);

    res.json({
      state,
      context,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pos/checkout/:checkoutId/apply-discount
 * Apply discount to checkout
 * 
 * @example
 * POST /api/v1/pos/checkout/checkout_1715000000000_abc123def/apply-discount
 * {
 *   "discountAmount": 5.00
 * }
 * 
 * Response (200):
 * {
 *   "state": "CART_OPEN",
 *   "context": { ... }
 * }
 */
router.post('/:checkoutId/apply-discount', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;
    const { discountAmount } = req.body;

    if (discountAmount === undefined || discountAmount === null) {
      return res.status(400).json({ error: 'discountAmount is required' });
    }

    await checkoutService.applyDiscount(checkoutId, Number(discountAmount));
    const state = checkoutService.getCheckoutState(checkoutId);
    const context = checkoutService.getCheckoutContext(checkoutId);

    res.json({
      state,
      context,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pos/checkout/:checkoutId/checkout
 * Process checkout - validate cart and initiate payment
 * Transition: CART_OPEN -> PAYMENT_PENDING -> PAYMENT_PROCESSING
 * 
 * @example
 * POST /api/v1/pos/checkout/checkout_1715000000000_abc123def/checkout
 * {
 *   "paymentMethod": "card",
 *   "paidAmount": 50.00
 * }
 * 
 * Response (200):
 * {
 *   "state": "PAYMENT_PROCESSING",
 *   "context": { ... },
 *   "paymentInitiated": true
 * }
 */
router.post('/:checkoutId/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;
    const { paymentMethod, paidAmount } = req.body;

    if (!paymentMethod || !paidAmount) {
      return res.status(400).json({ error: 'paymentMethod and paidAmount are required' });
    }

    const checkoutRequest: CheckoutRequest = {
      paymentMethod,
      paidAmount: Number(paidAmount),
    };

    const context = await checkoutService.processCheckout(checkoutId, checkoutRequest);
    const state = checkoutService.getCheckoutState(checkoutId);

    res.json({
      state,
      context,
      paymentInitiated: true,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pos/checkout/:checkoutId/process-payment
 * Process payment through payment gateway
 * Transition: PAYMENT_PROCESSING -> TRANSACTION_RECORDING or PAYMENT_FAILED
 * 
 * @example
 * POST /api/v1/pos/checkout/checkout_1715000000000_abc123def/process-payment
 * 
 * Response (200):
 * {
 *   "state": "TRANSACTION_RECORDING" or "PAYMENT_FAILED",
 *   "context": { ... },
 *   "paymentResult": { ... }
 * }
 */
router.post('/:checkoutId/process-payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;

    const context = await checkoutService.processPayment(checkoutId);
    const state = checkoutService.getCheckoutState(checkoutId);

    res.json({
      state,
      context,
      paymentResult: context.paymentResult,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pos/checkout/:checkoutId/retry-payment
 * Retry payment after failure
 * Transition: PAYMENT_FAILED -> PAYMENT_PENDING
 * 
 * @example
 * POST /api/v1/pos/checkout/checkout_1715000000000_abc123def/retry-payment
 * 
 * Response (200):
 * {
 *   "state": "PAYMENT_PENDING",
 *   "context": { ... }
 * }
 */
router.post('/:checkoutId/retry-payment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;

    const context = await checkoutService.retryPayment(checkoutId);
    const state = checkoutService.getCheckoutState(checkoutId);

    res.json({
      state,
      context,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/pos/checkout/:checkoutId/cancel
 * Cancel checkout session
 * Transition: Any state (except terminal states) -> CANCELLED
 * 
 * @example
 * POST /api/v1/pos/checkout/checkout_1715000000000_abc123def/cancel
 * {
 *   "reason": "Customer changed mind"
 * }
 * 
 * Response (200):
 * {
 *   "state": "CANCELLED",
 *   "context": { ... }
 * }
 */
router.post('/:checkoutId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const context = await checkoutService.cancelCheckout(checkoutId, reason);
    const state = checkoutService.getCheckoutState(checkoutId);

    res.json({
      state,
      context,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pos/checkout/:checkoutId
 * Get current checkout state and context
 * 
 * @example
 * GET /api/v1/pos/checkout/checkout_1715000000000_abc123def
 * 
 * Response (200):
 * {
 *   "checkoutId": "checkout_1715000000000_abc123def",
 *   "state": "PAYMENT_PROCESSING",
 *   "context": { ... }
 * }
 */
router.get('/:checkoutId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;

    const state = checkoutService.getCheckoutState(checkoutId);
    const context = checkoutService.getCheckoutContext(checkoutId);

    res.json({
      checkoutId,
      state,
      context,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/pos/checkout/:checkoutId/audit-log
 * Get audit log (state transitions) for checkout
 * 
 * @example
 * GET /api/v1/pos/checkout/checkout_1715000000000_abc123def/audit-log
 * 
 * Response (200):
 * {
 *   "checkoutId": "checkout_1715000000000_abc123def",
 *   "auditLog": [
 *     {
 *       "timestamp": "2026-05-14T12:45:00Z",
 *       "fromState": "CART_OPEN",
 *       "toState": "PAYMENT_PENDING",
 *       "action": "checkout initiated",
 *       "data": { ... }
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/:checkoutId/audit-log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkoutId } = req.params;

    const auditLog = checkoutService.getAuditLog(checkoutId);

    res.json({
      checkoutId,
      auditLog,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
