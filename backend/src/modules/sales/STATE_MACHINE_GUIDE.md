# POS Checkout State Machine Pattern - Implementation Guide

## Overview

The **State Machine Pattern** for POS checkout provides a structured, maintainable way to manage complex checkout workflows with multiple states and transitions. This guide explains the architecture, implementation, and usage.

---

## 1. State Diagram

```
┌─────────────────────────────────────────────────────────┐
│          CART_OPEN                                      │
│  • Add/Remove items                                    │
│  • Apply discounts                                     │
└────────────────┬────────────────────────────────────────┘
                 │ checkout()
                 ▼
┌─────────────────────────────────────────────────────────┐
│          PAYMENT_PENDING                                │
│  • Validate cart is not empty                          │
│  • Store payment method & amount                       │
└────────────────┬─────────────────┬─────────────────────┘
                 │                 │
      checkout() │                 │ cancel()
  allowed to     │                 ▼
  move to        │            CANCELLED
  PAYMENT_       │            (Terminal)
  PROCESSING     │
                 ▼
        ┌────────────────────┐
        │ PAYMENT_PROCESSING │
        │ • Process payment  │
        │ • Handle result    │
        └────────┬───────────┘
                 │
         ┌───────┴────────┐
         │                │
    Success          Failure
         │                │
         ▼                ▼
  TRANSACTION_      PAYMENT_FAILED
  RECORDING           │
         │            │ retry()
         │            ▼
         │       PAYMENT_PENDING
         │
         ▼
     COMPLETED
    (Terminal)
```

---

## 2. State Definitions

### **CART_OPEN**
- **Description**: Initial state where customer adds/removes items
- **Allowed Actions**:
  - `addItem()` - Add item to cart
  - `removeItem()` - Remove item from cart
  - `applyDiscount()` - Apply loyalty discount
  - `checkout()` - Proceed to payment (validates cart is not empty)
- **Exit Guard**: Cart must have at least 1 item
- **Transitions to**: `PAYMENT_PENDING`, `CANCELLED`

### **PAYMENT_PENDING**
- **Description**: Cart validated, waiting for payment confirmation
- **Allowed Actions**:
  - `initiatePayment()` - Store payment details
  - `cancel()` - Abandon checkout
- **Entry Guard**: Cart must not be empty
- **Exit Guard**: Payment method and amount must be set
- **Transitions to**: `PAYMENT_PROCESSING`, `CART_OPEN` (go back), `CANCELLED`

### **PAYMENT_PROCESSING**
- **Description**: Payment is being processed through gateway
- **Allowed Actions**:
  - `processPayment()` - Handle payment gateway response
  - `cancel()` - Cancel during processing
- **Entry Guard**: Valid payment method and amount
- **Exit Guard**: Payment result received
- **Transitions to**: `TRANSACTION_RECORDING`, `PAYMENT_FAILED`, `CANCELLED`

### **PAYMENT_FAILED**
- **Description**: Payment declined or failed
- **Allowed Actions**:
  - `retry()` - Retry payment with different method
  - `cancel()` - Give up and cancel
- **Entry Action**: Log error for debugging
- **Transitions to**: `PAYMENT_PENDING`, `CANCELLED`

### **TRANSACTION_RECORDING**
- **Description**: Successful payment, recording transaction in database
- **Allowed Actions**:
  - `recordTransaction()` - Save sale to database
  - `cancel()` - Rollback transaction if recording fails
- **Entry Guard**: Payment must be successful
- **Side Effects**:
  - Insert into `pos_sales` table
  - Insert into `pos_line_items` table
  - Update `inventory_levels` (deduct stock)
  - Record audit log
- **Transitions to**: `COMPLETED`, `CANCELLED`

### **COMPLETED** (Terminal State)
- **Description**: Transaction successfully recorded
- **Allowed Actions**: None (terminal)
- **Entry Action**: Generate receipt, emit events
- **Side Effects**:
  - Send customer notification
  - Emit Socket.IO event for real-time updates
  - Update loyalty points if applicable

### **CANCELLED** (Terminal State)
- **Description**: Checkout abandoned at any point
- **Allowed Actions**: None (terminal)
- **Entry Action**: Log cancellation reason
- **Side Effects**:
  - Release any held inventory
  - Emit notification event

---

## 3. Architecture Components

### **ICheckoutState Interface**
```typescript
interface ICheckoutState {
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
```

### **CheckoutStateMachine Class**
Manages state transitions and maintains checkout context:
- Enforces valid transitions
- Executes `onExit()` and `onEnter()` hooks
- Records audit log
- Maintains immutable context

### **CheckoutService Class**
Business logic layer:
- Wraps state machine operations
- Handles database persistence
- Integrates payment gateway
- Validates inventory

### **Router**
Express endpoints exposing all checkout operations

---

## 4. Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│ Client (Cashier POS Terminal)                               │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │ Express Routes              │
        │ /pos/checkout/initialize    │
        │ /pos/checkout/:id/add-item  │
        │ /pos/checkout/:id/checkout  │
        │ /pos/checkout/:id/...       │
        └─────────────────┬───────────┘
                          │
                          ▼
            ┌─────────────────────────┐
            │ CheckoutService         │
            │ • Validation            │
            │ • Inventory checks      │
            │ • Payment integration   │
            └─────────────┬───────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
   ┌──────────────────┐      ┌─────────────────┐
   │ CheckoutState    │      │ Database        │
   │ Machine          │      │ • pos_sales     │
   │ • State tracking │      │ • pos_line_items│
   │ • Transitions    │      │ • inventory_    │
   │ • Audit log      │      │   levels        │
   └──────────────────┘      └─────────────────┘
```

---

## 5. API Endpoints

### **Initialize Checkout**
```
POST /api/v1/pos/checkout/initialize
{
  "storeId": "uuid",
  "cashierId": "uuid (optional)"
}

Response (201):
{
  "checkoutId": "checkout_...",
  "state": "CART_OPEN",
  "context": { ... }
}
```

### **Add Item to Cart**
```
POST /api/v1/pos/checkout/:checkoutId/add-item
{
  "skuId": "uuid",
  "quantity": number,
  "price": number (optional - uses DB price if omitted)
}

Response (200):
{
  "item": { skuId, quantity, price, subtotal },
  "state": "CART_OPEN",
  "context": { ... }
}
```

### **Remove Item from Cart**
```
DELETE /api/v1/pos/checkout/:checkoutId/item/:skuId

Response (200):
{
  "state": "CART_OPEN",
  "context": { ... }
}
```

### **Apply Discount**
```
POST /api/v1/pos/checkout/:checkoutId/apply-discount
{
  "discountAmount": number
}

Response (200):
{
  "state": "CART_OPEN",
  "context": { ... }
}
```

### **Checkout (Initiate Payment)**
```
POST /api/v1/pos/checkout/:checkoutId/checkout
{
  "paymentMethod": "card" | "cash" | "loyalty_points",
  "paidAmount": number
}

Response (200):
{
  "state": "PAYMENT_PROCESSING",
  "context": { ... },
  "paymentInitiated": true
}
```

### **Process Payment**
```
POST /api/v1/pos/checkout/:checkoutId/process-payment

Response (200):
{
  "state": "TRANSACTION_RECORDING" | "PAYMENT_FAILED",
  "context": { ... },
  "paymentResult": {
    "status": "success" | "failed",
    "transactionId": "txn_...",
    "errorCode": "...",
    "errorMessage": "..."
  }
}
```

### **Retry Payment (After Failure)**
```
POST /api/v1/pos/checkout/:checkoutId/retry-payment

Response (200):
{
  "state": "PAYMENT_PENDING",
  "context": { ... }
}
```

### **Cancel Checkout**
```
POST /api/v1/pos/checkout/:checkoutId/cancel
{
  "reason": "string"
}

Response (200):
{
  "state": "CANCELLED",
  "context": { ... }
}
```

### **Get Checkout Status**
```
GET /api/v1/pos/checkout/:checkoutId

Response (200):
{
  "checkoutId": "...",
  "state": "CART_OPEN" | "PAYMENT_PENDING" | "...",
  "context": { 
    items: [...],
    totalAmount: number,
    paymentMethod: string,
    ...
  }
}
```

### **Get Audit Log**
```
GET /api/v1/pos/checkout/:checkoutId/audit-log

Response (200):
{
  "checkoutId": "...",
  "auditLog": [
    {
      "timestamp": "2026-05-14T12:45:00Z",
      "fromState": "CART_OPEN",
      "toState": "PAYMENT_PENDING",
      "action": "checkout initiated",
      "data": { itemCount, totalAmount, ... }
    },
    ...
  ]
}
```

---

## 6. Usage Example: Happy Path

```typescript
// 1. Initialize checkout
const checkout = await checkoutService.initializeCheckout({
  storeId: 'store-123',
  cashierId: 'cashier-456'
});
// State: CART_OPEN

// 2. Add items
await checkoutService.addItemToCart(checkout.checkoutId, {
  skuId: 'milk-001',
  quantity: 2,
  price: 9.99
});
// State: CART_OPEN (still)

// 3. Apply discount
await checkoutService.applyDiscount(checkout.checkoutId, 5.00);
// State: CART_OPEN (still)

// 4. Checkout (validate & initiate payment)
await checkoutService.processCheckout(checkout.checkoutId, {
  paymentMethod: 'card',
  paidAmount: 34.98
});
// State: PAYMENT_PROCESSING

// 5. Process payment
const result = await checkoutService.processPayment(checkout.checkoutId);
// State: COMPLETED (if payment successful)

// 6. Get audit trail
const auditLog = checkoutService.getAuditLog(checkout.checkoutId);
// Shows: CART_OPEN -> PAYMENT_PENDING -> PAYMENT_PROCESSING -> 
//        TRANSACTION_RECORDING -> COMPLETED
```

---

## 7. Error Handling & Edge Cases

### **Invalid State Transition**
```
Error: Invalid transition from COMPLETED to CART_OPEN
// Terminal states cannot transition
```

### **Guard Condition Failure**
```
// Cannot checkout with empty cart
Error: Cannot proceed to payment: cart is empty

// Cannot add item after payment initiated
Error: Cannot add item in PAYMENT_PROCESSING state
```

### **Insufficient Inventory**
```
Error: Insufficient stock for SKU milk-001 at store store-123
```

### **Payment Gateway Error**
```
// Payment fails, state becomes PAYMENT_FAILED
State: PAYMENT_FAILED
PaymentResult: {
  status: 'failed',
  errorCode: 'INSUFFICIENT_FUNDS',
  errorMessage: 'Payment declined by payment gateway'
}

// Customer can retry or cancel
```

---

## 8. Advantages of This Pattern

| Advantage | Benefit |
|-----------|---------|
| **Explicit State Management** | Clear what operations are allowed in each state |
| **Type Safety** | TypeScript ensures valid transitions |
| **Auditability** | Complete history of state changes |
| **Testability** | Each state can be tested independently |
| **Maintainability** | Easy to add new states or transitions |
| **Guard Conditions** | Prevent invalid business logic executions |
| **Side Effects** | `onEnter()`/`onExit()` hooks for side effects |
| **Extensibility** | Add new payment methods without modifying core logic |
| **Debugging** | Audit log shows exact sequence of events |
| **Recovery** | Retry mechanism for failed payments |

---

## 9. Integration with Existing Code

### Register the router in `backend/src/app.ts`:

```typescript
import checkoutRouter from './modules/sales/checkout.router';

app.use('/api/v1/pos/checkout', checkoutRouter);
```

### Coexist with legacy checkout endpoint:

```
Legacy endpoint: POST /api/v1/sales/checkout
New endpoint:    POST /api/v1/pos/checkout/...

Both can operate independently.
```

---

## 10. Testing State Transitions

```typescript
describe('Checkout State Machine', () => {
  it('should transition CART_OPEN -> PAYMENT_PENDING on checkout', async () => {
    const sm = new CheckoutStateMachine('test-1', 'store-1');
    const item: CartItem = { skuId: 'sku-1', quantity: 1, price: 10, subtotal: 10 };
    
    await sm.addItem(item);
    expect(sm.getState()).toBe(CheckoutState.CART_OPEN);
    
    await sm.checkout('card', 10);
    expect(sm.getState()).toBe(CheckoutState.PAYMENT_PROCESSING);
  });

  it('should prevent invalid transitions', async () => {
    const sm = new CheckoutStateMachine('test-2', 'store-2');
    
    await expect(sm.recordTransaction()).rejects.toThrow(
      'Cannot record transaction in CART_OPEN state'
    );
  });

  it('should enforce guard conditions', async () => {
    const sm = new CheckoutStateMachine('test-3', 'store-3');
    
    await expect(sm.checkout('card', 10)).rejects.toThrow(
      'Cart is empty'
    );
  });

  it('should record audit log', async () => {
    const sm = new CheckoutStateMachine('test-4', 'store-4');
    const item: CartItem = { skuId: 'sku-1', quantity: 1, price: 10, subtotal: 10 };
    
    await sm.addItem(item);
    const auditLog = sm.getAuditLog();
    
    expect(auditLog.length).toBeGreaterThan(0);
  });
});
```

---

## 11. Performance Considerations

- **State transitions**: O(1) - direct lookup
- **Cart operations**: O(n) where n = number of items
- **Audit log**: Stored in memory (persisted to DB on completion)
- **Database**: Only on `TRANSACTION_RECORDING` state
- **Payment processing**: Async, doesn't block cart operations

---

## 12. Future Enhancements

1. **Persistence**: Store state machine to Redis for session recovery
2. **Timeout handling**: Auto-cancel checkout after 30 minutes
3. **Partial payments**: Support split payment across multiple methods
4. **Scheduled processing**: Queue payment processing for off-peak hours
5. **Analytics**: Track state transition metrics (cart abandonment, etc.)
6. **Webhooks**: Notify external systems on state changes

---

## References

- [State Machine Pattern](https://refactoring.guru/design-patterns/state)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- [FSM Libraries](https://github.com/steelsquid/xstate) (for future use)

