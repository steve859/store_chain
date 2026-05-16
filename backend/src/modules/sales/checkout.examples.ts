/**
 * POS Checkout State Machine - Usage Examples
 * 
 * This file demonstrates how to use the State Machine Pattern for POS checkout
 * with real-world examples and expected flows.
 */

// ============================================================================
// EXAMPLE 1: Happy Path - Complete Purchase
// ============================================================================

/**
 * Scenario: Customer buys items and completes payment successfully
 * State Flow: CART_OPEN -> PAYMENT_PENDING -> PAYMENT_PROCESSING -> 
 *             TRANSACTION_RECORDING -> COMPLETED
 */

const happyPathExample = async (apiClient: any) => {
  console.log('=== Happy Path: Successful Purchase ===\n');

  // Step 1: Initialize checkout
  const initResp = await apiClient.post('/api/v1/pos/checkout/initialize', {
    storeId: '550e8400-e29b-41d4-a716-446655440000',
    cashierId: '550e8400-e29b-41d4-a716-446655440001',
  });

  const checkoutId = initResp.data.checkoutId;
  console.log(`✓ Checkout initialized: ${checkoutId}`);
  console.log(`  State: ${initResp.data.state}`);
  console.log();

  // Step 2: Add items to cart
  const item1 = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/add-item`,
    {
      skuId: '550e8400-e29b-41d4-a716-446655440002',
      quantity: 2,
      price: 9.99,
    },
  );
  console.log(`✓ Item 1 added: 2x milk @ $9.99`);

  const item2 = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/add-item`,
    {
      skuId: '550e8400-e29b-41d4-a716-446655440003',
      quantity: 1,
      price: 19.99,
    },
  );
  console.log(`✓ Item 2 added: 1x bread @ $19.99`);
  console.log(`  Total before discount: $${item2.data.context.totalAmount}`);
  console.log();

  // Step 3: Apply loyalty discount
  const discount = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/apply-discount`,
    { discountAmount: 5.0 },
  );
  console.log(`✓ Loyalty discount applied: -$5.00`);
  console.log(`  Total after discount: $${discount.data.context.totalAmount}`);
  console.log();

  // Step 4: Checkout (CART_OPEN -> PAYMENT_PENDING -> PAYMENT_PROCESSING)
  const checkout = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/checkout`,
    {
      paymentMethod: 'card',
      paidAmount: checkout.data.context.totalAmount,
    },
  );
  console.log(`✓ Checkout initiated`);
  console.log(`  State: ${checkout.data.state}`);
  console.log(`  Payment method: card`);
  console.log();

  // Step 5: Process payment
  const payment = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/process-payment`,
  );
  console.log(`✓ Payment processed`);
  console.log(`  State: ${payment.data.state}`);
  console.log(`  Payment status: ${payment.data.paymentResult.status}`);
  console.log(`  Transaction ID: ${payment.data.paymentResult.transactionId}`);
  console.log();

  // Step 6: Get audit log
  const auditResp = await apiClient.get(
    `/api/v1/pos/checkout/${checkoutId}/audit-log`,
  );
  console.log(`✓ Checkout completed successfully`);
  console.log(`  State transitions:`);
  auditResp.data.auditLog.forEach((log: any, idx: number) => {
    console.log(
      `    ${idx + 1}. ${log.fromState} -> ${log.toState} (${log.action})`,
    );
  });
  console.log();
};

// ============================================================================
// EXAMPLE 2: Payment Failure & Retry
// ============================================================================

/**
 * Scenario: Payment fails initially, customer retries with another card
 * State Flow: CART_OPEN -> PAYMENT_PENDING -> PAYMENT_PROCESSING -> 
 *             PAYMENT_FAILED -> PAYMENT_PENDING -> PAYMENT_PROCESSING -> COMPLETED
 */

const paymentFailureExample = async (apiClient: any) => {
  console.log('=== Payment Failure & Retry ===\n');

  // Initialize and add items (abbreviated)
  const initResp = await apiClient.post('/api/v1/pos/checkout/initialize', {
    storeId: '550e8400-e29b-41d4-a716-446655440000',
    cashierId: '550e8400-e29b-41d4-a716-446655440001',
  });
  const checkoutId = initResp.data.checkoutId;

  await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/add-item`, {
    skuId: '550e8400-e29b-41d4-a716-446655440002',
    quantity: 1,
  });

  console.log(`✓ Checkout initialized and item added`);
  console.log();

  // Checkout
  const checkout = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/checkout`,
    {
      paymentMethod: 'card',
      paidAmount: 29.99,
    },
  );
  console.log(`✓ Payment initiated`);
  console.log();

  // Process payment (simulated failure)
  const failedPayment = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/process-payment`,
  );
  console.log(`✗ Payment failed`);
  console.log(`  Error: ${failedPayment.data.context.error}`);
  console.log(`  State: ${failedPayment.data.state}`);
  console.log();

  // Retry payment
  const retryResp = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/retry-payment`,
  );
  console.log(`✓ Retrying payment...`);
  console.log(`  State: ${retryResp.data.state}`);
  console.log();

  // Process payment again (simulated success)
  const successPayment = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/process-payment`,
  );
  console.log(`✓ Payment successful on retry`);
  console.log(`  Transaction ID: ${successPayment.data.paymentResult.transactionId}`);
  console.log();
};

// ============================================================================
// EXAMPLE 3: Cancelled Checkout
// ============================================================================

/**
 * Scenario: Customer cancels checkout midway
 * State Flow: CART_OPEN -> PAYMENT_PENDING -> CANCELLED
 */

const cancelCheckoutExample = async (apiClient: any) => {
  console.log('=== Cancelled Checkout ===\n');

  // Initialize
  const initResp = await apiClient.post('/api/v1/pos/checkout/initialize', {
    storeId: '550e8400-e29b-41d4-a716-446655440000',
  });
  const checkoutId = initResp.data.checkoutId;

  // Add items
  await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/add-item`, {
    skuId: '550e8400-e29b-41d4-a716-446655440002',
    quantity: 3,
  });

  console.log(`✓ Checkout initialized with items`);
  console.log();

  // Proceed to payment pending
  const checkout = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/checkout`,
    {
      paymentMethod: 'card',
      paidAmount: 29.99,
    },
  );
  console.log(`✓ Checkout initiated`);
  console.log();

  // Cancel
  const cancelResp = await apiClient.post(
    `/api/v1/pos/checkout/${checkoutId}/cancel`,
    { reason: 'Customer changed mind' },
  );
  console.log(`✓ Checkout cancelled`);
  console.log(`  Reason: ${cancelResp.data.context.error}`);
  console.log(`  State: ${cancelResp.data.state}`);
  console.log();
};

// ============================================================================
// EXAMPLE 4: Remove Item from Cart
// ============================================================================

/**
 * Scenario: Customer adds items, then decides to remove one
 * State Flow: CART_OPEN (add) -> CART_OPEN (remove) -> PAYMENT_PENDING
 */

const removeItemExample = async (apiClient: any) => {
  console.log('=== Remove Item from Cart ===\n');

  // Initialize
  const initResp = await apiClient.post('/api/v1/pos/checkout/initialize', {
    storeId: '550e8400-e29b-41d4-a716-446655440000',
  });
  const checkoutId = initResp.data.checkoutId;

  const skuId1 = '550e8400-e29b-41d4-a716-446655440002';
  const skuId2 = '550e8400-e29b-41d4-a716-446655440003';

  // Add items
  await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/add-item`, {
    skuId: skuId1,
    quantity: 2,
  });
  await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/add-item`, {
    skuId: skuId2,
    quantity: 1,
  });

  let cart = await apiClient.get(`/api/v1/pos/checkout/${checkoutId}`);
  console.log(`✓ Added 2 items to cart`);
  console.log(`  Total: $${cart.data.context.totalAmount}`);
  console.log(`  Items: ${cart.data.context.items.length}`);
  console.log();

  // Remove first item
  const removeResp = await apiClient.delete(
    `/api/v1/pos/checkout/${checkoutId}/item/${skuId1}`,
  );
  console.log(`✓ Removed item ${skuId1}`);
  console.log(`  Total after removal: $${removeResp.data.context.totalAmount}`);
  console.log(`  Items remaining: ${removeResp.data.context.items.length}`);
  console.log();
};

// ============================================================================
// EXAMPLE 5: State Transition Rules & Guard Conditions
// ============================================================================

/**
 * Demonstrates invalid state transitions and guard conditions
 */

const stateTransitionRulesExample = async (apiClient: any) => {
  console.log('=== State Transition Rules & Guard Conditions ===\n');

  // Initialize
  const initResp = await apiClient.post('/api/v1/pos/checkout/initialize', {
    storeId: '550e8400-e29b-41d4-a716-446655440000',
  });
  const checkoutId = initResp.data.checkoutId;

  // ✓ Valid: Add item in CART_OPEN state
  try {
    await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/add-item`, {
      skuId: '550e8400-e29b-41d4-a716-446655440002',
      quantity: 1,
    });
    console.log(`✓ RULE PASSED: Can add items in CART_OPEN state`);
  } catch (err) {
    console.log(`✗ RULE FAILED: ${err.message}`);
  }
  console.log();

  // ✓ Valid: Proceed to payment with items in cart
  try {
    await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/checkout`, {
      paymentMethod: 'card',
      paidAmount: 29.99,
    });
    console.log(`✓ RULE PASSED: Can checkout with items in cart`);
  } catch (err) {
    console.log(`✗ RULE FAILED: ${err.message}`);
  }
  console.log();

  // ✗ Invalid: Try to add item after payment initiated
  try {
    await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/add-item`, {
      skuId: '550e8400-e29b-41d4-a716-446655440003',
      quantity: 1,
    });
    console.log(`✗ RULE FAILED: Should not allow adding items after payment initiated`);
  } catch (err) {
    console.log(`✓ RULE PASSED: Cannot add items in PAYMENT_PROCESSING state`);
    console.log(`  Error: ${err.message}`);
  }
  console.log();

  // ✗ Invalid: Cannot checkout with empty cart
  try {
    const emptyInit = await apiClient.post('/api/v1/pos/checkout/initialize', {
      storeId: '550e8400-e29b-41d4-a716-446655440000',
    });
    await apiClient.post(
      `/api/v1/pos/checkout/${emptyInit.data.checkoutId}/checkout`,
      {
        paymentMethod: 'card',
        paidAmount: 29.99,
      },
    );
    console.log(`✗ RULE FAILED: Should not allow checkout with empty cart`);
  } catch (err) {
    console.log(`✓ RULE PASSED: Cannot checkout with empty cart`);
    console.log(`  Error: ${err.message}`);
  }
  console.log();
};

// ============================================================================
// AUDIT LOG EXAMPLE
// ============================================================================

/**
 * Shows how to retrieve and interpret audit logs for debugging/compliance
 */

const auditLogExample = async (apiClient: any) => {
  console.log('=== Audit Log Example ===\n');

  // Complete a purchase
  const initResp = await apiClient.post('/api/v1/pos/checkout/initialize', {
    storeId: '550e8400-e29b-41d4-a716-446655440000',
  });
  const checkoutId = initResp.data.checkoutId;

  await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/add-item`, {
    skuId: '550e8400-e29b-41d4-a716-446655440002',
    quantity: 1,
  });

  await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/checkout`, {
    paymentMethod: 'card',
    paidAmount: 29.99,
  });

  await apiClient.post(`/api/v1/pos/checkout/${checkoutId}/process-payment`);

  // Get audit log
  const auditResp = await apiClient.get(
    `/api/v1/pos/checkout/${checkoutId}/audit-log`,
  );

  console.log(`Checkout ID: ${checkoutId}`);
  console.log(`Total state transitions: ${auditResp.data.auditLog.length}\n`);

  auditResp.data.auditLog.forEach((log: any, idx: number) => {
    console.log(`Transaction ${idx + 1}:`);
    console.log(`  Timestamp: ${log.timestamp}`);
    console.log(`  Transition: ${log.fromState} -> ${log.toState}`);
    console.log(`  Action: ${log.action}`);
    console.log(`  Items: ${log.data.itemCount}, Total: $${log.data.totalAmount}`);
    console.log();
  });
};

export {
  happyPathExample,
  paymentFailureExample,
  cancelCheckoutExample,
  removeItemExample,
  stateTransitionRulesExample,
  auditLogExample,
};
