# Refactor Plan — Phased Execution for Codex

Do not execute all phases at once. Complete one phase, verify, then continue.

## Phase 0 — Repository analysis only

Goal: understand current repo without modifying code.

Codex should produce:

- Current folder structure.
- Current frontend/backend entry points.
- Current API routes.
- Current database/ORM setup.
- Current auth/RBAC implementation.
- Current modules vs target module map.
- Missing tests and risky areas.

No code changes in this phase.

## Phase 1 — Normalize project structure

Goal: make backend/frontend folders clear without changing business behavior.

Tasks:

- Identify frontend and backend packages.
- Ensure backend has a clear entry point: `app.ts`/`server.ts` or equivalent.
- Ensure route registry exists.
- Move obvious domain files into module folders where safe.
- Update imports.
- Keep existing route paths working.

Acceptance:

- Build/typecheck passes.
- Existing routes still registered.

## Phase 2 — Middleware baseline

Goal: centralize cross-cutting concerns.

Tasks:

- Add/clean auth middleware.
- Add/clean RBAC middleware.
- Add/clean store-scope middleware.
- Add/clean error handler.
- Add request logging.
- Add rate limiting for login/sensitive routes where package exists or can be added safely.

Acceptance:

- Protected routes require auth.
- Permission checks are backend enforced.
- Error responses are consistent.

## Phase 3 — Auth, users, roles, stores

Goal: align access-control modules.

Tasks:

- Refactor login into `auth` module.
- Refactor user CRUD into `users` module.
- Refactor role/permission logic into `roles` module.
- Refactor store CRUD/scope logic into `stores` module.
- Add audit logs for role/user/store changes if audit module exists.

Acceptance:

- Login still works.
- Admin-only features remain admin-only.
- Store-scoped access is not weakened.

## Phase 4 — POS, transactions, loyalty, promotions

Goal: align core store operation workflow.

Tasks:

- Refactor checkout into `pos` module.
- Keep transaction history in `transactions` module.
- Move loyalty logic into `loyalty` module.
- Move promotion logic into `promotions` module.
- Ensure checkout uses transaction boundaries where DB/ORM supports it.
- Ensure inventory/loyalty changes cannot become partially committed.

Acceptance:

- Checkout flow still works.
- No negative stock/points from valid operations.
- Audit logging exists or TODO is clearly added for sensitive changes.

## Phase 5 — Products, inventory, transfers, low-stock alerts

Goal: align inventory and movement modules.

Tasks:

- Refactor catalog into `products`.
- Refactor stock adjustment into `inventory`.
- Refactor transfer request/approval into `transfers`.
- Refactor thresholds/low-stock events into `inventory` + queue/notification.
- Add retry/logging for failed notifications if queue exists.

Acceptance:

- Product search/list supports pagination where applicable.
- Transfer approval is transactional.
- Low-stock alert logic is isolated and testable.

## Phase 6 — Pricing, reports, analytics, complaints

Goal: align advanced business modules.

Tasks:

- Refactor dynamic pricing into `pricing`.
- Refactor report generation/export into `reports`.
- Refactor live analytics into `analytics`.
- Refactor complaints into `complaints`.
- Keep price rollback and A/B test logic isolated.

Acceptance:

- Report export format behavior remains compatible.
- Pricing changes are audit logged.
- Analytics routes/streams remain role-scoped.

## Phase 7 — Redis/WebSocket/background jobs

Goal: align infrastructure adapters.

Tasks:

- Centralize Redis client in `lib/redis.ts`.
- Centralize queue setup in `lib/queue.ts`.
- Centralize WebSocket setup in `lib/socket.ts`.
- Use store-scoped WebSocket rooms/channels.
- Avoid direct Redis client creation inside random modules.

Acceptance:

- No duplicate Redis connection setup except where intentionally required.
- WebSocket events do not leak across stores.

## Phase 8 — Tests and documentation

Goal: stabilize after refactor.

Tasks:

- Add or fix unit tests for services.
- Add integration tests for critical API flows if test framework exists.
- Update README route/module documentation.
- Add TODOs only for explicitly deferred architecture tasks.

Acceptance:

- Tests/lint/build run.
- Known remaining gaps are documented.
