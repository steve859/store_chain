# Module Map — Target Backend/Frontend Modules

## Backend target modules

| Module | Main responsibilities | Related use cases |
|---|---|---|
| `auth` | Login, JWT generation, session/failed login handling | UC01 |
| `users` | Manage users, account status, user profile | UC02 |
| `roles` | RBAC roles and permissions | UC03 |
| `stores` | Create/update stores, store scope | UC04 |
| `dashboard` | Store/chain dashboard data | UC05 |
| `pos` | Checkout flow, cart validation, payment recording, receipt | UC06, UC07 |
| `transactions` | Transaction history and details, close shift support | UC16, UC17 |
| `loyalty` | Apply member, calculate points, redeem points, tier upgrade | UC07, UC08, UC09, UC10 |
| `promotions` | Promotion CRUD and promotion application | UC11, UC12 |
| `pricing` | Pricing rules, dynamic pricing, price history, A/B test, rollback | UC13, UC14, UC15, UC29, UC30 |
| `products` | Product catalog, SKU/barcode/category management | UC18 |
| `inventory` | Stock level, stock movements, thresholds, low-stock detection | UC19, UC25, UC26 |
| `transfers` | Inter-store transfer request and approval | UC20, UC21 |
| `reports` | Store report, chain report, export report | UC22, UC23, UC28 |
| `analytics` | Real-time analytics and dashboard streams | UC24 |
| `complaints` | Complaint submission, handling, resolution | UC27 |
| `audit_logs` | Immutable audit records for sensitive operations | Cross-cutting |
| `settings` | Business parameters, thresholds, policy values | Cross-cutting |

## Shared backend libraries

| Folder | Responsibility |
|---|---|
| `middlewares` | Auth, RBAC, store scope, rate limit, logging, error handler |
| `lib/db.ts` | PostgreSQL/ORM client setup |
| `lib/redis.ts` | Redis client setup |
| `lib/logger.ts` | App logging |
| `lib/socket.ts` | WebSocket setup and room management |
| `lib/queue.ts` | Background job queue setup |
| `validations` | Shared schema validators if not stored per module |
| `utils` | Pure helper functions only |

## Frontend target modules/pages

| Area | Pages/components |
|---|---|
| Auth | Login page, auth guard |
| Admin | User management, roles/permissions, store management |
| Manager | Store dashboard, reports, promotions, inventory, transfers |
| Cashier | POS checkout, close shift, transaction history |
| Inventory Staff | Product catalog, stock adjustment, low-stock alerts, transfer request |
| Loyalty Member | Member profile, loyalty history, complaints |
| Shared | Role-based layout, route guards, API client, error/toast components |

## Dependency direction

Preferred backend dependency direction:

```text
routes -> controllers -> services -> repositories -> database
services -> other domain services only through explicit interfaces
services -> audit_logs for sensitive operations
services -> queue/socket/cache through lib adapters
```

Avoid:

- Repositories importing controllers.
- Frontend importing backend internals.
- Modules directly modifying another module's database tables without service/repository boundaries, unless wrapped in a documented transaction.
