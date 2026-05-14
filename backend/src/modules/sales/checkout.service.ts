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
   * Simulate payment processing
   * In production, this would call actual payment gateway (Stripe, PayPal, etc.)
   */
  async processPayment(checkoutId: string): Promise<CheckoutContext> {
    const sm = this.getStateMachine(checkoutId);
    const context = sm.getContext();

    // Simulate payment gateway call
    const paymentResult = await this.callPaymentGateway(
      context.paymentMethod!,
      context.paidAmount!,
      context.totalAmount,
    );

    // Update state machine with payment result
    await sm.processPayment(paymentResult);

    if (paymentResult.status === 'success') {
      // Record transaction in database
      await this.recordTransaction(checkoutId, sm.getContext());

      // Mark as completed
      await sm.recordTransaction();
    }

    logger.info(
      `[CheckoutService] Payment processed for ${checkoutId}: ${paymentResult.status}`,
    );
    return sm.getContext();
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
        FROM inventory_levels
        WHERE store_id = ${storeId}::uuid
          AND sku_id = ${item.skuId}::uuid
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

        // Update inventory
        const updated = await tx.$executeRaw(Prisma.sql`
          UPDATE inventory_levels
          SET quantity = quantity - ${item.quantity}, updated_at = CURRENT_TIMESTAMP
          WHERE store_id = ${context.storeId}::uuid
            AND sku_id = ${item.skuId}::uuid
            AND quantity - reserved >= ${item.quantity}
        `);

        if (updated === 0) {
          throw new Error(`Failed to update inventory for SKU ${item.skuId}`);
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
  }
}

// Export singleton instance
export const checkoutService = new CheckoutService();
