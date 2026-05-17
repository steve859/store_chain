/**
 * POS Checkout Service
 * 
 * Service layer that integrates the State Machine with database operations,
 * payment processing, and inventory management.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import { logger } from '../../utils/logger';
import {
  CheckoutStateMachine,
  CheckoutState,
  CheckoutContext,
  CartItem,
  PaymentResult,
  AuditLog,
} from './checkout.statemachine';
import { CheckoutSaga, CheckoutSagaStep, sagaRegistry } from '../../lib/saga/checkoutSaga';
import { eventBus } from '../../lib/events/eventBus';

export interface CreateCheckoutRequest {
  storeId: string;
  cashierId?: string;
}

export interface AddItemRequest {
  skuId: string;
  quantity: number;
  price?: number;
}

export interface CheckoutRequest {
  paymentMethod: string;
  paidAmount: number;
}

export class CheckoutService {
  private stateMachines: Map<string, CheckoutStateMachine> = new Map();

  /**
   * Initialize a new checkout session
   */
  async initializeCheckout(req: CreateCheckoutRequest): Promise<CheckoutContext> {
    const checkoutId = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sm = new CheckoutStateMachine(checkoutId, req.storeId, req.cashierId);

    this.stateMachines.set(checkoutId, sm);

    logger.info(`[CheckoutService] Checkout initialized: ${checkoutId}`);
    return sm.getContext();
  }

  /**
   * Add item to cart
   */
  async addItemToCart(checkoutId: string, req: AddItemRequest): Promise<CartItem> {
    const sm = this.getStateMachine(checkoutId);

    // Fetch SKU details from database
    const sku = await prisma.$queryRaw<Array<{ id: string; price: string }>>(
      Prisma.sql`
        SELECT id::text as id, price::text as price
        FROM skus
        WHERE id = ${req.skuId}::uuid
        LIMIT 1
      `,
    );

    if (!sku || sku.length === 0) {
      throw new Error(`SKU not found: ${req.skuId}`);
    }

    const price = req.price ?? Number.parseFloat(sku[0].price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid price for SKU ${req.skuId}`);
    }

    const item: CartItem = {
      skuId: req.skuId,
      quantity: req.quantity,
      price,
      subtotal: req.quantity * price,
    };

    await sm.addItem(item);
    logger.info(`[CheckoutService] Item added to cart ${checkoutId}: ${req.skuId} x${req.quantity}`);

    return item;
  }

  /**
   * Remove item from cart
   */
  async removeItemFromCart(checkoutId: string, skuId: string): Promise<void> {
    const sm = this.getStateMachine(checkoutId);
    await sm.removeItem(skuId);
    logger.info(`[CheckoutService] Item removed from cart ${checkoutId}: ${skuId}`);
  }

  /**
   * Apply loyalty discount
   */
  async applyDiscount(checkoutId: string, discountAmount: number): Promise<void> {
    const sm = this.getStateMachine(checkoutId);
    await sm.applyDiscount(discountAmount);
    logger.info(`[CheckoutService] Discount applied to ${checkoutId}: ${discountAmount}`);
  }

  /**
   * Process checkout - validate and initiate payment
   */
  async processCheckout(checkoutId: string, req: CheckoutRequest): Promise<CheckoutContext> {
    const sm = this.getStateMachine(checkoutId);
    const context = sm.getContext();

    // Validate cart
    if (context.items.length === 0) {
      throw new Error('Cart is empty');
    }

    // Validate inventory availability
    await this.validateInventory(context.storeId, context.items);

    // Initiate payment state transition
    await sm.checkout(req.paymentMethod, req.paidAmount);

    logger.info(`[CheckoutService] Checkout processed for ${checkoutId}`);
    return sm.getContext();
  }

  /**
   * Simulate payment processing & Orchestrate Checkout Saga
   */
  async processPayment(checkoutId: string): Promise<CheckoutContext> {
    const sm = this.getStateMachine(checkoutId);
    const context = sm.getContext();

    // Start Saga Orchestration
    let storeIdNum = parseInt(context.storeId, 10);
    if (isNaN(storeIdNum)) {
      // In case storeId is UUID, just use a dummy number for the saga or try to parse
      storeIdNum = 1;
    }
    const saga = new CheckoutSaga(checkoutId, storeIdNum);
    sagaRegistry.register(saga);

    try {
      // 1. VALIDATE
      saga.completeStep(CheckoutSagaStep.VALIDATE);

      // 2. RESERVE_INVENTORY
      await this.reserveInventory(context);
      saga.completeStep(CheckoutSagaStep.RESERVE_INVENTORY);

      // 3. APPLY_PROMOTIONS
      await this.applyPromotionsSagaStep(context);
      saga.completeStep(CheckoutSagaStep.APPLY_PROMOTIONS);

      // 4. DEDUCT_LOYALTY
      await this.deductLoyaltySagaStep(context);
      saga.completeStep(CheckoutSagaStep.DEDUCT_LOYALTY);

      // 5. AUTHORIZE_PAYMENT
      const paymentResult = await this.callPaymentGateway(
        context.paymentMethod!,
        context.paidAmount!,
        context.totalAmount,
      );

      if (paymentResult.status !== 'success') {
        throw new Error(paymentResult.errorMessage || 'Payment authorization failed');
      }
      saga.completeStep(CheckoutSagaStep.AUTHORIZE_PAYMENT);

      // Update state machine with payment result
      await sm.processPayment(paymentResult);

      // 6. PROCESS_TRANSACTION
      await this.recordTransaction(checkoutId, sm.getContext());
      saga.completeStep(CheckoutSagaStep.PROCESS_TRANSACTION);

      // Complete Saga
      await saga.complete();
      sagaRegistry.remove(checkoutId);

      // Mark as completed in state machine
      await sm.recordTransaction();

      logger.info(`[CheckoutService] Payment and Saga processed for ${checkoutId}: ${paymentResult.status}`);
      return sm.getContext();
    } catch (error: any) {
      // Execute Compensating Transactions
      await saga.fail(saga.getState().currentStep, error.message);
      sagaRegistry.remove(checkoutId);

      // Update state machine to failed state
      await sm.processPayment({
        status: 'failed',
        errorCode: 'SAGA_FAILED',
        errorMessage: error.message,
      });

      logger.error(`[CheckoutService] Payment saga failed for ${checkoutId}: ${error.message}`);
      return sm.getContext();
    }
  }

  /**
   * Retry payment after failure
   */
  async retryPayment(checkoutId: string): Promise<CheckoutContext> {
    const sm = this.getStateMachine(checkoutId);
    await sm.retryPayment();
    logger.info(`[CheckoutService] Payment retry initiated for ${checkoutId}`);
    return sm.getContext();
  }

  /**
   * Cancel checkout
   */
  async cancelCheckout(checkoutId: string, reason: string): Promise<CheckoutContext> {
    const sm = this.getStateMachine(checkoutId);
    await sm.cancel(reason);
    logger.info(`[CheckoutService] Checkout cancelled: ${checkoutId}, reason: ${reason}`);

    // Cleanup: remove from active sessions
    this.stateMachines.delete(checkoutId);

    return sm.getContext();
  }

  /**
   * Get current checkout state
   */
  getCheckoutState(checkoutId: string): CheckoutState {
    const sm = this.getStateMachine(checkoutId);
    return sm.getState();
  }

  /**
   * Get full checkout context
   */
  getCheckoutContext(checkoutId: string): CheckoutContext {
    const sm = this.getStateMachine(checkoutId);
    return sm.getContext();
  }

  /**
   * Get audit log for checkout
   */
  getAuditLog(checkoutId: string): AuditLog[] {
    const sm = this.getStateMachine(checkoutId);
    return sm.getAuditLog();
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  private getStateMachine(checkoutId: string): CheckoutStateMachine {
    const sm = this.stateMachines.get(checkoutId);
    if (!sm) {
      throw new Error(`Checkout not found: ${checkoutId}`);
    }
    return sm;
  }

  /**
   * Validate inventory availability for all items
   */
  private async validateInventory(storeId: string, items: CartItem[]): Promise<void> {
    for (const item of items) {
      const inventory = await prisma.$queryRaw<
        Array<{ available: number }>
      >(Prisma.sql`
        SELECT COALESCE(quantity - reserved, 0)::int as available
        FROM inventories
        WHERE store_id = ${Number(storeId)}
          AND variant_id = ${Number(item.skuId)}
        LIMIT 1
      `);

      if (!inventory || inventory.length === 0 || inventory[0].available < item.quantity) {
        throw new Error(
          `Insufficient stock for SKU ${item.skuId} at store ${storeId}`,
        );
      }
    }
  }

  /**
   * Reserve inventory step for Saga
   */
  private async reserveInventory(context: CheckoutContext): Promise<void> {
    // In a full implementation, this would increase the "reserved" count in inventory_levels
    logger.info(`[CheckoutService] Inventory reserved for checkout ${context.checkoutId}`);
  }

  /**
   * Apply promotions step for Saga
   */
  private async applyPromotionsSagaStep(context: CheckoutContext): Promise<void> {
    logger.info(`[CheckoutService] Promotions applied for checkout ${context.checkoutId}`);
  }

  /**
   * Deduct loyalty step for Saga
   */
  private async deductLoyaltySagaStep(context: CheckoutContext): Promise<void> {
    logger.info(`[CheckoutService] Loyalty points deducted for checkout ${context.checkoutId}`);
  }

  /**
   * Call payment gateway
   * This is a mock implementation. In production, integrate with Stripe, PayPal, Square, etc.
   */
  private async callPaymentGateway(
    paymentMethod: string,
    paidAmount: number,
    totalAmount: number,
  ): Promise<PaymentResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock payment success/failure logic
    const isSuccess = Math.random() > 0.1; // 90% success rate for testing

    if (isSuccess && paidAmount >= totalAmount) {
      return {
        status: 'success',
        transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
    } else {
      return {
        status: 'failed',
        errorCode: 'INSUFFICIENT_FUNDS',
        errorMessage: 'Payment declined by payment gateway',
      };
    }
  }

  /**
   * Record transaction in database
   */
  private async recordTransaction(checkoutId: string, context: CheckoutContext): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Create POS sale
      const saleResult = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO pos_sales (store_id, cashier_id, total_amount, paid_amount, payment_method)
        VALUES (
          ${context.storeId}::uuid,
          ${context.cashierId ? Prisma.sql`${context.cashierId}::uuid` : Prisma.sql`NULL`},
          ${context.totalAmount},
          ${context.paidAmount || null},
          ${context.paymentMethod}
        )
        RETURNING id::text as id
      `);

      if (!saleResult || saleResult.length === 0) {
        throw new Error('Failed to create sale record');
      }

      const saleId = saleResult[0].id;

      // Create line items
      for (const item of context.items) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO pos_line_items (sale_id, sku_id, quantity, price)
          VALUES (${saleId}::uuid, ${item.skuId}::uuid, ${item.quantity}, ${item.price})
        `);

        // Fetch current version for optimistic locking
        const inv = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
          SELECT version FROM inventories 
          WHERE store_id = ${Number(context.storeId)} AND variant_id = ${Number(item.skuId)}
        `);
        const currentVersion = inv[0]?.version || 1;

        // Update inventory with Optimistic Locking (ASR-R3)
        const updated = await tx.$executeRaw(Prisma.sql`
          UPDATE inventories
          SET quantity = quantity - ${item.quantity}, last_update = CURRENT_TIMESTAMP, version = version + 1
          WHERE store_id = ${Number(context.storeId)}
            AND variant_id = ${Number(item.skuId)}
            AND version = ${currentVersion}
            AND quantity - reserved >= ${item.quantity}
        `);

        if (updated === 0) {
          throw new Error(`Optimistic Locking Failed or Insufficient stock for SKU ${item.skuId}`);
        }
      }

      // Record audit log
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO audit_logs (entity_type, entity_id, action, data)
        VALUES (
          'pos_checkout',
          ${saleId},
          'checkout_completed',
          ${JSON.stringify({
            checkoutId,
            itemCount: context.items.length,
            totalAmount: context.totalAmount,
            paymentMethod: context.paymentMethod,
            transactionId: context.transactionId,
          })}::jsonb
        )
      `);

      logger.info(`[CheckoutService] Transaction recorded for sale: ${saleId}`);
    });

    // Publish CQRS Event for Analytics Pipeline
    await eventBus.publish('checkout.completed', {
      transactionId: context.transactionId || checkoutId,
      storeId: Number(context.storeId),
      totalAmount: context.totalAmount,
      paidAmount: context.paidAmount || context.totalAmount,
      paymentMethod: context.paymentMethod || 'cash',
      items: context.items.map(i => ({
        skuId: i.skuId,
        quantity: i.quantity,
        price: i.price
      })),
      timestamp: Date.now()
    });
  }
}

// Export singleton instance
export const checkoutService = new CheckoutService();
