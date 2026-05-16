# State Machine Architecture Diagram

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (POS Terminal)                    │
│  Cashier UI: Add items → Apply discount → Checkout        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           Express Routers (checkout.router.ts)             │
│  • POST /initialize                                        │
│  • POST /:id/add-item                                      │
│  • DELETE /:id/item/:skuId                                 │
│  • POST /:id/apply-discount                                │
│  • POST /:id/checkout                                      │
│  • POST /:id/process-payment                               │
│  • POST /:id/retry-payment                                 │
│  • POST /:id/cancel                                        │
│  • GET /:id                                                │
│  • GET /:id/audit-log                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│       CheckoutService (checkout.service.ts)                │
│  • Validation & Guard Conditions                           │
│  • Inventory Checks                                        │
│  • Payment Gateway Integration                             │
│  • Database Persistence                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│   CheckoutStateMachine (checkout.statemachine.ts)          │
│  ┌────────────────────────────────────────────────────┐   │
│  │ State Implementations:                             │   │
│  │ • CartOpenState                                    │   │
│  │ • PaymentPendingState                              │   │
│  │ • PaymentProcessingState                           │   │
│  │ • PaymentFailedState                               │   │
│  │ • TransactionRecordingState                        │   │
│  │ • CompletedState                                   │   │
│  │ • CancelledState                                   │   │
│  └────────────────────────────────────────────────────┘   │
│  • State Transitions (with guards)                        │
│  • Audit Log Recording                                    │
│  • Context Management                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌─────────┐  ┌──────────┐  ┌───────────┐
    │Database │  │ Payment  │  │  Logger   │
    │ (Prisma)│  │ Gateway  │  │  (Pino)   │
    └─────────┘  └──────────┘  └───────────┘
```

## State Transition Flow Diagram

```
                    START
                      │
                      ▼
            ┌──────────────────┐
            │ POST /initialize │
            └────────┬─────────┘
                     ▼
        ┌────────────────────────┐
        │   CART_OPEN [Initial]  │
        │  ① Add items to cart   │
        │  ② Remove items        │
        │  ③ Apply discount      │
        └───┬──────────┬─────────┘
            │          │
            │          └──────────────────┐
            │                             │
       checkout()                    cancel()
      (validate)                   (reason)
            │                             │
            ▼                             ▼
   ┌──────────────────────┐    ┌──────────────────┐
   │  PAYMENT_PENDING     │    │   CANCELLED      │
   │ Guard: cart not empty│    │  [Terminal]      │
   └───┬──────────┬───────┘    │ • Release stock  │
       │          │             │ • Log reason     │
       │          └─────────────┴─────────────────┘
       │
  (payment method
    + amount)
       │
       ▼
   ┌──────────────────────┐
   │ PAYMENT_PROCESSING   │
   │ • Call payment API   │
   │ • Handle response    │
   └───┬────────┬─────────┘
       │        │
    ✓  │        │  ✗
  Pass │        │ Fail
       │        │
       ▼        ▼
   ┌──────┐  ┌──────────────────────┐
   │ TX   │  │  PAYMENT_FAILED      │
   │RECORD│  │  [Retryable State]   │
   │ING   │  │ • Store error        │
   │[Temp]│  │ • Allow retry        │
   └───┬──┘  └─────────┬────────────┘
       │                │
       │          retry()│
       │                ▼
       │      ┌──────────────────┐
       │      │ PAYMENT_PENDING  │
       │      │ (Go back to      │
       │      │  payment stage)  │
       │      └──────────────────┘
       │
       ▼
   ┌──────────────────────┐
   │   COMPLETED          │
   │  [Terminal/Success]  │
   │ • Save to DB         │
   │ • Deduct inventory   │
   │ • Generate receipt   │
   │ • Send notifications │
   └──────────────────────┘
```

## Request/Response Flow

```
CLIENT REQUEST                              SERVER RESPONSE
───────────────────────────────────────────────────────────────

POST /initialize
{storeId, cashierId}
  ────────────────────────────────────────>  201 Created
                                             {
                                               checkoutId: "checkout_...",
                                               state: "CART_OPEN",
                                               context: {...}
                                             }

POST /:id/add-item
{skuId, quantity, price?}
  ────────────────────────────────────────>  200 OK
                                             {
                                               item: {...},
                                               state: "CART_OPEN",
                                               context: {...}
                                             }

POST /:id/apply-discount
{discountAmount}
  ────────────────────────────────────────>  200 OK
                                             {
                                               state: "CART_OPEN",
                                               context: {...}
                                             }

POST /:id/checkout
{paymentMethod, paidAmount}
  ────────────────────────────────────────>  200 OK
                                             {
                                               state: "PAYMENT_PROCESSING",
                                               context: {...}
                                             }

POST /:id/process-payment
{}
  ────────────────────────────────────────>  200 OK
                                             {
                                               state: "COMPLETED" | "PAYMENT_FAILED",
                                               context: {...},
                                               paymentResult: {...}
                                             }

GET /:id/audit-log
  ────────────────────────────────────────>  200 OK
                                             {
                                               checkoutId: "...",
                                               auditLog: [
                                                 {
                                                   timestamp: "...",
                                                   fromState: "CART_OPEN",
                                                   toState: "PAYMENT_PENDING",
                                                   action: "...",
                                                   data: {...}
                                                 },
                                                 ...
                                               ]
                                             }
```

## State Machine Context Object

```
CheckoutContext {
  ┌─────────────────────────────────────────────────┐
  │ Identification                                  │
  ├─────────────────────────────────────────────────┤
  │ checkoutId: "checkout_1715000000000_abc123"    │
  │ storeId: "550e8400-e29b-41d4-a716-446655440000"│
  │ cashierId?: "550e8400-e29b-41d4-a716-..."      │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Cart Data                                       │
  ├─────────────────────────────────────────────────┤
  │ items: [                                        │
  │   {                                             │
  │     skuId: "sku-milk",                          │
  │     quantity: 2,                                │
  │     price: 9.99,                                │
  │     subtotal: 19.98,                            │
  │     discountAmount?: 5.00                       │
  │   },                                            │
  │   {...}                                         │
  │ ]                                               │
  │ totalAmount: 34.97  (including tax & discount) │
  │ tax: 3.50                                       │
  │ discount?: 5.00                                 │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Payment Data                                    │
  ├─────────────────────────────────────────────────┤
  │ paymentMethod?: "card"                          │
  │ paidAmount?: 34.97                              │
  │ paymentResult?: {                               │
  │   status: "success" | "failed" | "pending",     │
  │   transactionId: "txn_...",                     │
  │   errorCode?: "INSUFFICIENT_FUNDS",             │
  │   errorMessage?: "Payment declined"             │
  │ }                                               │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Transaction Data                                │
  ├─────────────────────────────────────────────────┤
  │ transactionId?: "sale_550e8400-e29b-41d4-..."  │
  │ error?: "Customer cancelled"                    │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Timestamps                                      │
  ├─────────────────────────────────────────────────┤
  │ createdAt: 2026-05-14T12:45:00.000Z             │
  │ updatedAt: 2026-05-14T12:45:15.000Z             │
  └─────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────┐
  │ Audit Trail                                     │
  ├─────────────────────────────────────────────────┤
  │ auditLog: [                                     │
  │   {                                             │
  │     timestamp: 2026-05-14T12:45:00.000Z,       │
  │     fromState: "CART_OPEN",                    │
  │     toState: "PAYMENT_PENDING",                │
  │     action: "checkout initiated",              │
  │     data: { itemCount: 2, totalAmount: 34.97 } │
  │   },                                            │
  │   {...}                                         │
  │ ]                                               │
  └─────────────────────────────────────────────────┘
}
```

## Concurrent Request Handling

```
Multiple checkouts can run simultaneously (in-memory state machines):

┌──────────────────────────────────────────────────────────────┐
│  StateMachines Map: <checkoutId, StateMachine>             │
├──────────────────────────────────────────────────────────────┤
│  "checkout_1715000000000_abc123" ──> StateMachine (State: CART_OPEN)
│  "checkout_1715000000001_def456" ──> StateMachine (State: PAYMENT_PROCESSING)
│  "checkout_1715000000002_ghi789" ──> StateMachine (State: COMPLETED)
│  "checkout_1715000000003_jkl012" ──> StateMachine (State: PAYMENT_FAILED)
└──────────────────────────────────────────────────────────────┘

Each checkout:
• Has isolated state (no interference)
• Progresses independently
• Can be processed concurrently
• Shared access to database (for inventory/sales)
• Database transactions handle concurrency
```

## Guard Conditions Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│ Action              │ From State           │ Guard Condition         │
├─────────────────────────────────────────────────────────────────────┤
│ addItem()           │ CART_OPEN           │ (allowed, no guard)     │
│ removeItem()        │ CART_OPEN           │ (allowed, no guard)     │
│ applyDiscount()     │ CART_OPEN           │ (allowed, no guard)     │
│ checkout()          │ CART_OPEN           │ ✓ items.length > 0      │
│                     │                      │ ✓ paymentMethod set     │
│                     │                      │ ✓ paidAmount >= total   │
│ processPayment()    │ PAYMENT_PROCESSING  │ ✓ payment API responded │
│ recordTransaction() │ TRANSACTION_RECORDING│ ✓ payment successful    │
│ retryPayment()      │ PAYMENT_FAILED      │ (allowed, resets state) │
│ cancel()            │ Any (except         │ ✓ reason provided       │
│                     │ COMPLETED/CANCELLED)│                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
REQUEST
  │
  ▼
VALIDATION (input checks)
  │
  ├─ ✗ Invalid input ──────────> 400 Bad Request
  │
  ▼ ✓ Valid
STATE MACHINE TRANSITION
  │
  ├─ ✗ Invalid state transition ─────────> Error: Invalid transition
  ├─ ✗ Guard condition failed ─────────────> Error: Guard condition failed
  │
  ▼ ✓ Allowed
DATABASE OPERATION
  │
  ├─ ✗ Inventory insufficient ───────────> Error: Insufficient stock
  ├─ ✗ Database error ────────────────────> 500 Internal Server Error
  │
  ▼ ✓ Success
PAYMENT PROCESSING
  │
  ├─ ✗ Payment declined ──────────────────> State: PAYMENT_FAILED
  ├─ ✗ Timeout ──────────────────────────> State: PAYMENT_FAILED
  │
  ▼ ✓ Approved
TRANSACTION RECORDING
  │
  ├─ ✗ Insert failed ────────────────────> Rollback, Error
  │
  ▼ ✓ Recorded
RESPONSE: 200 OK with Updated State
```

## Performance Characteristics

```
Operation                    Time Complexity    Space Complexity
─────────────────────────────────────────────────────────────────
Initialize Checkout         O(1)               O(1)
Add Item                     O(n)               O(1)
Remove Item                  O(n)               O(1)
Apply Discount              O(1)               O(1)
State Transition            O(1)               O(m)  [m = log size]
Get Audit Log               O(m)               O(m)  [m = transitions]
Process Payment (async)     O(1) + network     O(1)
Record Transaction          O(n)               O(1)
─────────────────────────────────────────────────────────────────
Overall Checkout (happy)    O(n+m)             O(n+m)
where:
  n = number of items in cart
  m = number of state transitions
  
Typical: <100ms for most operations
Payment processing: 500ms-5s (depends on gateway)
```

