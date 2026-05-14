# Attribute-Driven Design Document (ADD)

Project: Store Chain Management System
Prepared by: TBD
Date: 2026-05-14

## Table of Contents

1. Design Constraints
2. Quality Attribute Requirements
3. Architectural Representation

# 1. Design Constraints

- Backend: Node.js 20+, Express, TypeScript.
- Frontend: React + Vite.
- Data: PostgreSQL with Prisma ORM.
- Cache: Redis used for catalog cache and job queues.
- Security: JWT authentication, RBAC, store-scoped authorization.
- API: REST endpoints under /api/v1, Swagger documentation.
- Realtime: Socket.IO with store-scoped rooms.
- Observability: /health and /metrics endpoints.

# 2. Quality Attribute Requirements

## 2.1 Security

### 2.1.1 Authentication and Authorization

Element: Auth middleware and role enforcement.
Statement: The system must authenticate users and enforce role and store scope.
Stimulus: User attempts to access protected endpoints.
Stimulus source: Admin, manager, employee, cashier.
Environment: Normal operation via web client.
Artifact: Auth routes, JWT validation, authorization middleware.
Response: Reject invalid tokens; enforce role and store scope checks.
Response measure: 100% protected endpoints require valid JWT; unauthorized access blocked.

### 2.1.2 Data Protection

Element: Data storage and transport.
Statement: Sensitive data must be protected at rest and in transit.
Stimulus: User data and audit data stored or transmitted.
Stimulus source: All users and services.
Environment: Normal operation and backups.
Artifact: PostgreSQL, Redis, API transport.
Response: TLS in production; passwords hashed with bcrypt; minimal sensitive data stored.
Response measure: 100% passwords stored hashed; 100% API traffic encrypted in production.

### 2.1.3 Payment Security

Element: POS payment recording.
Statement: The system must avoid storing card data and support secure payment integration.
Stimulus: Cashier records payment during checkout.
Stimulus source: Cashiers.
Environment: POS checkout.
Artifact: POS module, invoice records.
Response: Store payment method and totals only; external gateway integration uses tokenization when added.
Response measure: 0% raw card data stored; gateway integration only via tokens.

## 2.2 Performance

### 2.2.1 Fast Response Times

Element: API request handling.
Statement: The system should meet latency targets for common reads.
Stimulus: Users browse catalog and run reports.
Stimulus source: Admins and staff.
Environment: Normal load.
Artifact: API server, PostgreSQL, Redis cache.
Response: Cache catalog reads and keep endpoints under target latency.
Response measure: 95% read requests under 500 ms, as per SRS.

### 2.2.2 Advanced Search Efficiency

Element: Catalog search endpoints.
Statement: Product search should be responsive for name, SKU, and barcode.
Stimulus: User searches the catalog.
Stimulus source: Admins and store staff.
Environment: Normal load.
Artifact: Products and inventory modules.
Response: Indexed queries with pagination.
Response measure: 95% catalog searches under 500 ms for typical page sizes.

### 2.2.3 Scalability for Concurrent Users

Element: API server and cache.
Statement: The system must handle concurrent users during peak times.
Stimulus: Multiple stores using POS and inventory simultaneously.
Stimulus source: Cashiers and managers.
Environment: Peak operations.
Artifact: API server, PostgreSQL, Redis.
Response: Stateless API nodes enable horizontal scaling; cache reduces DB load.
Response measure: P95 checkout under 2 seconds; error rate below 1% under target load.

## 2.3 Usability

### 2.3.1 Smooth User Experience

Element: POS and inventory screens.
Statement: Key workflows should require minimal steps and provide feedback.
Stimulus: User performs checkout or inventory update.
Stimulus source: Cashiers and inventory staff.
Environment: Normal operation.
Artifact: Frontend pages and API endpoints.
Response: Fast responses, clear errors, and state updates.
Response measure: POS checkout completes within 2 seconds for 95% of cases.

### 2.3.2 Easy-to-Use Interface

Element: Role-based layouts and navigation.
Statement: Users only see allowed modules and simplified navigation.
Stimulus: User logs in and navigates.
Stimulus source: All roles.
Environment: Normal operation.
Artifact: Role-based layouts and client routing.
Response: UI shows only role-relevant modules.
Response measure: No access to unauthorized modules without explicit permission.

## 2.4 Interoperability

### 2.4.1 Third-Party System Integration

Element: Optional integrations.
Statement: The system should support barcode scanners and external services when needed.
Stimulus: Barcode scanner input or external integration added.
Stimulus source: Store devices and future integrations.
Environment: Normal operation.
Artifact: POS UI, API endpoints.
Response: Scanner input treated as keyboard input; integrations use REST with TLS.
Response measure: Scanner input processed with no additional latency; integrations follow TLS and auth standards.

### 2.4.2 Internal Module Communication

Element: Backend domain modules.
Statement: Modules should interact through clear interfaces and shared utilities.
Stimulus: A request touches multiple domains (e.g., checkout updates inventory).
Stimulus source: API requests.
Environment: Normal operation.
Artifact: Express routers, shared lib, Prisma transactions.
Response: In-process calls with shared validation and transactional boundaries.
Response measure: No cross-module data corruption; transactional updates succeed or rollback.

## 2.5 Modifiability

### 2.5.1 Supporting Business Requirement Changes

Element: Module structure and data model.
Statement: Business rules should be adjustable with localized changes.
Stimulus: Change in pricing rules or promotion logic.
Stimulus source: Business stakeholders.
Environment: Development and maintenance.
Artifact: Pricing and promotion modules.
Response: Isolate changes to relevant module and related schema.
Response measure: Minor rule change implemented within one sprint.

### 2.5.2 Zero-Downtime Updates

Element: Deployment strategy.
Statement: Deployments should minimize downtime.
Stimulus: New release deployment.
Stimulus source: DevOps.
Environment: Production.
Artifact: API servers, database migrations.
Response: Rolling restarts with backward-compatible migrations.
Response measure: No planned downtime for minor releases.

## 2.6 Availability

### 2.6.1 Fault Tolerance and System Recovery

Element: Core services.
Statement: The system must recover from failures with minimal downtime.
Stimulus: API server or cache outage.
Stimulus source: Infrastructure events.
Environment: Runtime.
Artifact: API server, PostgreSQL, Redis, health checks.
Response: Health checks detect failures; restart services; use backups.
Response measure: Availability target 99.5% or higher; recovery within defined RTO.

### 2.6.2 Automated Payment Response Handling

Element: Future payment gateway integration.
Statement: If payment webhooks are introduced, responses must be processed reliably.
Stimulus: Payment gateway webhook.
Stimulus source: External payment gateway.
Environment: Future integration.
Artifact: Webhook handler, invoice module.
Response: Verify signatures, idempotent processing, update invoice status.
Response measure: 100% webhook validation before state changes.

# 3. Architectural Representation

## 3.1 Logical View

The system is organized into domain modules aligned with business capabilities:

- Auth, Users, Stores
- Products, Categories, Inventory, Pricing
- Orders, Transfers, POS, Invoices, Returns
- Promotions, Complaints, Reports, Audit Logs, Settings
- Shared utilities: monitoring, security middleware, job queues

## 3.2 Implementation View

- Backend: TypeScript Express app with routers under backend/src/modules.
- Frontend: React app with role-based layouts and service clients.
- Shared config through environment variables.
- Prisma schema as the single source of truth for data models.

## 3.3 Deployment View

- Local dev: Vite frontend on 5173; API on 3000; PostgreSQL and Redis via Docker Compose.
- Production: API servers behind a load balancer; shared PostgreSQL and Redis.
- Health and metrics endpoints for monitoring.

## 3.4 Data View

- Core entities: stores, users, roles, products, variants, inventories, invoices, returns.
- Operational entities: purchase orders, transfers, stock movements, promotions, complaints.
- Audit and settings: audit_logs, settings.
