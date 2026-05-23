# Architecture Target — Store Chain Management System

This document summarizes the architecture target for Codex. It is intentionally shorter than SAD/ADD so the agent can follow it during code refactor.

## 1. System goal

Store Chain Management System is a web-based multi-store retail platform supporting:

- User authentication and role-based access.
- Store management and dashboards.
- POS transactions.
- Inventory and inter-store transfers.
- Loyalty program.
- Promotions and dynamic pricing.
- Reports and real-time analytics.
- Complaint management.
- Audit logging and governance.

## 2. Technology stack

| Layer | Target |
|---|---|
| Frontend | ReactJS |
| Backend | Node.js + ExpressJS |
| API | RESTful API under `/api/v1` |
| Database | PostgreSQL |
| Cache / Queue / PubSub | Redis |
| Real-time | WebSocket |
| Deployment | Docker / Docker Compose |
| Security | JWT, RBAC, store-scoped authorization, HTTPS/TLS |
| Observability | Health checks, metrics, logs |

## 3. Quality attribute targets

### Security

- JWT required on protected endpoints.
- RBAC enforced on backend and reflected in frontend menu/layout.
- Store-scoped data access for non-admin users.
- Passwords must be hashed, never stored as plain text.
- Sensitive operations must be audit logged.

### Performance

- POS transaction target: complete within 2 seconds under normal load.
- Dashboard target: load within 3 seconds for standard reports.
- Dynamic pricing target: calculation below 100 ms per item batch where feasible.
- Catalog/search/report queries should use indexes, pagination, and cache where suitable.

### Availability and reliability

- Use PostgreSQL replication/failover when deploying production.
- Use Redis for cache, job queues, and Pub/Sub.
- Background jobs should retry failed notification/report tasks.
- Health checks and logs should support troubleshooting.

### Data integrity

- POS checkout, inventory deduction, loyalty point update, transfer approval, and price rollback must be transactional where possible.
- No negative inventory or loyalty balance should be produced by valid workflows.
- Audit logs should record old/new values for sensitive changes.

### Modifiability

- Pricing, promotion, loyalty, low-stock threshold, and reporting rules should be isolated in dedicated modules.
- Configurable thresholds should live in settings/config rather than hardcoded logic where possible.

## 4. Architectural style

Use a modular backend organized by business domains. A modular monolith is acceptable and preferred unless the existing codebase already uses microservices. Do not force microservices unless explicitly required.

## 5. Runtime flow summary

```text
Browser/POS Terminal
  -> React Frontend
  -> REST /api/v1
  -> Express App
  -> Auth/RBAC/Store Scope Middleware
  -> Domain Module Controller
  -> Service Layer
  -> Repository / PostgreSQL
  -> Redis cache/queue/pubsub when needed
  -> Response / WebSocket event
```

## 6. Main architecture constraints

- Do not bypass middleware for protected routes.
- Do not let frontend-only permission checks replace backend RBAC.
- Do not mix business logic directly into route files when a service layer exists.
- Do not make Redis the source of truth for business data.
- Do not add raw card storage or sensitive credential storage.
- Do not use hardcoded store/user IDs in authorization logic.
