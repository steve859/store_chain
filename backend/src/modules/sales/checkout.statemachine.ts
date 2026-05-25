/**
 * POS Checkout State Machine
 * 
 * Implements State Pattern to manage checkout workflow with state transitions,
 * guards, and side effects. Each state defines allowed transitions and actions.
 */

import { logger } from '../../lib/monitoring/logger';

// ============================================================================
// STATE TYPES
// ============================================================================

export enum CheckoutState {
  CART_OPEN = 'CART_OPEN',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  TRANSACTION_RECORDING = 'TRANSACTION_RECORDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface CheckoutContext {
  checkoutId: string;
  storeId: string;
  cashierId?: string;
  items: CartItem[];
  paymentMethod?: string;
  totalAmount: number;
  paidAmount?: number;
  discount?: number;
  tax: number;
  paymentResult?: PaymentResult;
  error?: string;
  transactionId?: string;
  createdAt: Date;
  updatedAt: Date;
  auditLog: AuditLog[];
}

export interface CartItem {
  skuId: string;
  quantity: number;
  price: number;
  discountAmount?: number;
  subtotal: number;
}

export interface PaymentResult {
  status: 'success' | 'failed' | 'pending';
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface AuditLog {
  timestamp: Date;
  fromState: CheckoutState;
  toState: CheckoutState;
  action: string;
  data?: Record<string, any>;
}

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface ICheckoutState {
  state: CheckoutState;
  canTransitionTo(targetState: CheckoutState): boolean;
  onEnter(context: CheckoutContext): Promise<void>;
  onExit(context: CheckoutContext): Promise<void>;
  addItem?(context: CheckoutContext, item: CartItem): Promise<boolean>;
  removeItem?(context: CheckoutContext, skuId: string): Promise<boolean>;
  applyDiscount?(context: CheckoutContext, discountAmount: number): Promise<boolean>;
  initiatePayment?(context: CheckoutContext, paymentMethod: string, paidAmount: number): Promise<boolean>;
  processPayment?(context: CheckoutContext, paymentResult: PaymentResult): Promise<boolean>;
  recordTransaction?(context: CheckoutContext): Promise<boolean>;
  cancel?(context: CheckoutContext, reason: string): Promise<boolean>;
  retry?(context: CheckoutContext): Promise<boolean>;
}

// ============================================================================
// CONCRETE STATES
// ============================================================================

class CartOpenState implements ICheckoutState {
  state = CheckoutState.CART_OPEN;

  canTransitionTo(targetState: CheckoutState): boolean {
    return targetState === CheckoutState.PAYMENT_PENDING || targetState === CheckoutState.CANCELLED;
  }

  async onEnter(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Entering CART_OPEN state`);
  }

  async onExit(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Exiting CART_OPEN state`);
  }

  async addItem(context: CheckoutContext, item: CartItem): Promise<boolean> {
    const existingIndex = context.items.findIndex((i) => i.skuId === item.skuId);
    if (existingIndex >= 0) {
      context.items[existingIndex].quantity += item.quantity;
      context.items[existingIndex].subtotal = context.items[existingIndex].quantity * context.items[existingIndex].price;
    } else {
      context.items.push(item);
    }
    context.totalAmount = this.calculateTotal(context);
    logger.info(`[Checkout ${context.checkoutId}] Item added: ${item.skuId} x${item.quantity}`);
    return true;
  }

  async removeItem(context: CheckoutContext, skuId: string): Promise<boolean> {
    const index = context.items.findIndex((i) => i.skuId === skuId);
    if (index < 0) {
      logger.warn(`[Checkout ${context.checkoutId}] Item not found: ${skuId}`);
      return false;
    }
    context.items.splice(index, 1);
    context.totalAmount = this.calculateTotal(context);
    logger.info(`[Checkout ${context.checkoutId}] Item removed: ${skuId}`);
    return true;
  }

  async applyDiscount(context: CheckoutContext, discountAmount: number): Promise<boolean> {
    if (discountAmount < 0 || discountAmount > context.totalAmount) {
      logger.warn(`[Checkout ${context.checkoutId}] Invalid discount: ${discountAmount}`);
      return false;
    }
    context.discount = discountAmount;
    context.totalAmount = this.calculateTotal(context);
    logger.info(`[Checkout ${context.checkoutId}] Discount applied: ${discountAmount}`);
    return true;
  }

  private calculateTotal(context: CheckoutContext): number {
    const subtotal = context.items.reduce((sum, item) => sum + item.subtotal, 0);
    const discounted = subtotal - (context.discount || 0);
    context.tax = discounted * 0.1; // Example: 10% tax
    return discounted + context.tax;
  }
}

class PaymentPendingState implements ICheckoutState {
  state = CheckoutState.PAYMENT_PENDING;

  canTransitionTo(targetState: CheckoutState): boolean {
    return (
      targetState === CheckoutState.PAYMENT_PROCESSING ||
      targetState === CheckoutState.CANCELLED ||
      targetState === CheckoutState.CART_OPEN // Allow going back to cart
    );
  }

  async onEnter(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Entering PAYMENT_PENDING state`);
    // Validate cart completeness
    if (context.items.length === 0) {
      throw new Error('Cannot proceed to payment: cart is empty');
    }
  }

  async onExit(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Exiting PAYMENT_PENDING state`);
  }

  async initiatePayment(
    context: CheckoutContext,
    paymentMethod: string,
    paidAmount: number,
  ): Promise<boolean> {
    if (!paymentMethod || paymentMethod.trim().length === 0) {
      logger.warn(`[Checkout ${context.checkoutId}] Invalid payment method`);
      return false;
    }
    if (paidAmount < context.totalAmount) {
      logger.warn(
        `[Checkout ${context.checkoutId}] Insufficient payment: ${paidAmount} < ${context.totalAmount}`,
      );
      return false;
    }
    context.paymentMethod = paymentMethod;
    context.paidAmount = paidAmount;
    logger.info(`[Checkout ${context.checkoutId}] Payment initiated: ${paymentMethod}, amount=${paidAmount}`);
    return true;
  }
}

class PaymentProcessingState implements ICheckoutState {
  state = CheckoutState.PAYMENT_PROCESSING;

  canTransitionTo(targetState: CheckoutState): boolean {
    return (
      targetState === CheckoutState.PAYMENT_FAILED ||
      targetState === CheckoutState.TRANSACTION_RECORDING ||
      targetState === CheckoutState.CANCELLED
    );
  }

  async onEnter(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Entering PAYMENT_PROCESSING state`);
  }

  async onExit(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Exiting PAYMENT_PROCESSING state`);
  }

  async processPayment(context: CheckoutContext, paymentResult: PaymentResult): Promise<boolean> {
    context.paymentResult = paymentResult;
    if (paymentResult.status === 'success') {
      logger.info(`[Checkout ${context.checkoutId}] Payment successful: ${paymentResult.transactionId}`);
      return true;
    } else {
      context.error = paymentResult.errorMessage || 'Payment processing failed';
      logger.warn(`[Checkout ${context.checkoutId}] Payment failed: ${context.error}`);
      return false;
    }
  }
}

class PaymentFailedState implements ICheckoutState {
  state = CheckoutState.PAYMENT_FAILED;

  canTransitionTo(targetState: CheckoutState): boolean {
    return (
      targetState === CheckoutState.PAYMENT_PENDING ||
      targetState === CheckoutState.CANCELLED
    );
  }

  async onEnter(context: CheckoutContext): Promise<void> {
    logger.warn(
      `[Checkout ${context.checkoutId}] Entering PAYMENT_FAILED state. Error: ${context.error}`,
    );
  }

  async onExit(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Exiting PAYMENT_FAILED state`);
  }

  async retry(context: CheckoutContext): Promise<boolean> {
    logger.info(`[Checkout ${context.checkoutId}] Retrying payment`);
    context.paymentResult = undefined;
    context.error = undefined;
    return true;
  }
}

class TransactionRecordingState implements ICheckoutState {
  state = CheckoutState.TRANSACTION_RECORDING;

  canTransitionTo(targetState: CheckoutState): boolean {
    return targetState === CheckoutState.COMPLETED || targetState === CheckoutState.CANCELLED;
  }

  async onEnter(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Entering TRANSACTION_RECORDING state`);
  }

  async onExit(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Exiting TRANSACTION_RECORDING state`);
  }

  async recordTransaction(context: CheckoutContext): Promise<boolean> {
    if (!context.paymentResult || context.paymentResult.status !== 'success') {
      logger.error(`[Checkout ${context.checkoutId}] Cannot record transaction without successful payment`);
      return false;
    }
    context.transactionId = context.paymentResult.transactionId;
    logger.info(`[Checkout ${context.checkoutId}] Transaction recorded: ${context.transactionId}`);
    return true;
  }
}

class CompletedState implements ICheckoutState {
  state = CheckoutState.COMPLETED;

  canTransitionTo(targetState: CheckoutState): boolean {
    // Completed is a terminal state - no transitions allowed
    return false;
  }

  async onEnter(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Entering COMPLETED state`);
    logger.info(`[Checkout ${context.checkoutId}] Checkout completed. Transaction: ${context.transactionId}`);
  }

  async onExit(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Exiting COMPLETED state`);
  }
}

class CancelledState implements ICheckoutState {
  state = CheckoutState.CANCELLED;

  canTransitionTo(targetState: CheckoutState): boolean {
    // Cancelled is a terminal state - no transitions allowed
    return false;
  }

  async onEnter(context: CheckoutContext): Promise<void> {
    logger.warn(`[Checkout ${context.checkoutId}] Entering CANCELLED state. Reason: ${context.error}`);
  }

  async onExit(context: CheckoutContext): Promise<void> {
    logger.info(`[Checkout ${context.checkoutId}] Exiting CANCELLED state`);
  }

  async cancel(context: CheckoutContext, reason: string): Promise<boolean> {
    context.error = reason;
    logger.warn(`[Checkout ${context.checkoutId}] Checkout cancelled: ${reason}`);
    return true;
  }
}

// ============================================================================
// STATE MACHINE
// ============================================================================

export class CheckoutStateMachine {
  private context: CheckoutContext;
  private currentState: ICheckoutState;
  private states: Map<CheckoutState, ICheckoutState>;

  constructor(checkoutId: string, storeId: string, cashierId?: string) {
    this.states = new Map([
      [CheckoutState.CART_OPEN, new CartOpenState()],
      [CheckoutState.PAYMENT_PENDING, new PaymentPendingState()],
      [CheckoutState.PAYMENT_PROCESSING, new PaymentProcessingState()],
      [CheckoutState.PAYMENT_FAILED, new PaymentFailedState()],
      [CheckoutState.TRANSACTION_RECORDING, new TransactionRecordingState()],
      [CheckoutState.COMPLETED, new CompletedState()],
      [CheckoutState.CANCELLED, new CancelledState()],
    ]);

    this.context = {
      checkoutId,
      storeId,
      cashierId,
      items: [],
      totalAmount: 0,
      tax: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      auditLog: [],
    };

    this.currentState = this.states.get(CheckoutState.CART_OPEN)!;
  }

  // State getter
  getState(): CheckoutState {
    return this.currentState.state;
  }

  // Context getter
  getContext(): CheckoutContext {
    return { ...this.context };
  }

  // Transition to a new state
  private async transitionTo(targetState: CheckoutState, action: string): Promise<void> {
    const fromState = this.currentState.state;

    // Check if transition is allowed
    if (!this.currentState.canTransitionTo(targetState)) {
      throw new Error(
        `Invalid transition from ${fromState} to ${targetState}`,
      );
    }

    const nextState = this.states.get(targetState);
    if (!nextState) {
      throw new Error(`Unknown state: ${targetState}`);
    }

    // Exit current state
    await this.currentState.onExit(this.context);

    // Update state
    this.currentState = nextState;
    this.context.updatedAt = new Date();

    // Record audit log
    this.context.auditLog.push({
      timestamp: new Date(),
      fromState,
      toState: targetState,
      action,
      data: {
        itemCount: this.context.items.length,
        totalAmount: this.context.totalAmount,
      },
    });

    // Enter new state
    await this.currentState.onEnter(this.context);

    logger.info(
      `[Checkout ${this.context.checkoutId}] Transitioned from ${fromState} to ${targetState} (action: ${action})`,
    );
  }

  // ========================================================================
  // PUBLIC ACTIONS
  // ========================================================================

  async addItem(item: CartItem): Promise<void> {
    if (this.currentState.state !== CheckoutState.CART_OPEN) {
      throw new Error(`Cannot add item in ${this.currentState.state} state`);
    }
    const success = await this.currentState.addItem?.(this.context, item);
    if (!success) {
      throw new Error('Failed to add item');
    }
  }

  async removeItem(skuId: string): Promise<void> {
    if (this.currentState.state !== CheckoutState.CART_OPEN) {
      throw new Error(`Cannot remove item in ${this.currentState.state} state`);
    }
    const success = await this.currentState.removeItem?.(this.context, skuId);
    if (!success) {
      throw new Error('Item not found');
    }
  }

  async applyDiscount(discountAmount: number): Promise<void> {
    if (this.currentState.state !== CheckoutState.CART_OPEN) {
      throw new Error(`Cannot apply discount in ${this.currentState.state} state`);
    }
    const success = await this.currentState.applyDiscount?.(this.context, discountAmount);
    if (!success) {
      throw new Error('Failed to apply discount');
    }
  }

  async checkout(paymentMethod: string, paidAmount: number): Promise<void> {
    // CART_OPEN -> PAYMENT_PENDING
    await this.transitionTo(CheckoutState.PAYMENT_PENDING, 'checkout initiated');

    // Validate and store payment details
    const success = await this.currentState.initiatePayment?.(
      this.context,
      paymentMethod,
      paidAmount,
    );
    if (!success) {
      throw new Error('Failed to initiate payment');
    }

    // PAYMENT_PENDING -> PAYMENT_PROCESSING
    await this.transitionTo(CheckoutState.PAYMENT_PROCESSING, 'payment processing started');
  }

  async processPayment(paymentResult: PaymentResult): Promise<void> {
    if (this.currentState.state !== CheckoutState.PAYMENT_PROCESSING) {
      throw new Error(`Cannot process payment in ${this.currentState.state} state`);
    }

    const success = await this.currentState.processPayment?.(this.context, paymentResult);

    if (success) {
      // PAYMENT_PROCESSING -> TRANSACTION_RECORDING
      await this.transitionTo(CheckoutState.TRANSACTION_RECORDING, 'payment successful');
    } else {
      // PAYMENT_PROCESSING -> PAYMENT_FAILED
      await this.transitionTo(CheckoutState.PAYMENT_FAILED, 'payment failed');
    }
  }

  async recordTransaction(): Promise<void> {
    if (this.currentState.state !== CheckoutState.TRANSACTION_RECORDING) {
      throw new Error(
        `Cannot record transaction in ${this.currentState.state} state`,
      );
    }

    const success = await this.currentState.recordTransaction?.(this.context);
    if (!success) {
      throw new Error('Failed to record transaction');
    }

    // TRANSACTION_RECORDING -> COMPLETED
    await this.transitionTo(CheckoutState.COMPLETED, 'transaction recorded');
  }

  async retryPayment(): Promise<void> {
    if (this.currentState.state !== CheckoutState.PAYMENT_FAILED) {
      throw new Error(`Cannot retry payment in ${this.currentState.state} state`);
    }

    const success = await this.currentState.retry?.(this.context);
    if (!success) {
      throw new Error('Failed to retry payment');
    }

    // PAYMENT_FAILED -> PAYMENT_PENDING
    await this.transitionTo(CheckoutState.PAYMENT_PENDING, 'payment retry initiated');
  }

  async cancel(reason: string): Promise<void> {
    // Allow cancellation from most states except terminal states
    if (this.currentState.state === CheckoutState.COMPLETED ||
        this.currentState.state === CheckoutState.CANCELLED) {
      throw new Error(`Cannot cancel from ${this.currentState.state} state`);
    }

    const success = await this.currentState.cancel?.(this.context, reason);
    if (!success) {
      throw new Error('Failed to cancel checkout');
    }

    // -> CANCELLED
    await this.transitionTo(CheckoutState.CANCELLED, `checkout cancelled: ${reason}`);
  }

  // Get audit trail
  getAuditLog(): AuditLog[] {
    return [...this.context.auditLog];
  }
}
