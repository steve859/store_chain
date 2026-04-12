# Software Requirements Specification (IEEE 830)

Store Chain Management System
Version 1.0
Date: 2026-03-29

## Revision History

| Version | Date       | Author | Description     |
| ------- | ---------- | ------ | --------------- |
| 1.0     | 2026-03-29 | TBD    | Initial release |

## Table of Contents

1. Introduction
   1.1 Purpose
   1.2 Scope
   1.3 Definitions, Acronyms, and Abbreviations
   1.4 References
   1.5 Overview
2. Overall Description
   2.1 Product Perspective
   2.2 Product Functions
   2.3 User Classes and Characteristics
   2.4 Operating Environment
   2.5 Design and Implementation Constraints
   2.6 User Documentation
   2.7 Dependencies
3. System Features
   3.1 Authentication and Authorization
   3.2 User and Role Management
   3.3 Store Management
   3.4 Product Catalog, Categories, Brands, and Pricing
   3.5 Inventory and Stock Movement
   3.6 Procurement and Supplier Management
   3.7 Transfers Between Stores
   3.8 POS Sales and Shifts
   3.9 Invoices and Orders
   3.10 Returns and Refunds
   3.11 Promotions and Discounts
   3.12 Complaints Handling
   3.13 Reports and Dashboard
   3.14 Audit Logs
   3.15 Settings and Maintenance
   3.16 Realtime Notifications
   3.17 Catalog Cache
4. External Interface Requirements
5. Non-functional Requirements
6. Use Cases
7. System Architecture
8. Data Model
9. Assumptions and Constraints

# 1. Introduction

## 1.1 Purpose

This document specifies the requirements for the Store Chain Management System. It follows IEEE 830 and describes system scope, features, interfaces, constraints, and quality requirements for implementation and testing.

## 1.2 Scope

The system provides end-to-end operations management for a retail store chain. Core domains include products, pricing, inventory, procurement, transfers, POS sales, returns, promotions, complaints, reporting, and audit logs. The system is delivered as a web application with a REST API backend, database, cache, and web frontend.

## 1.3 Definitions, Acronyms, and Abbreviations

- POS: Point of Sale
- SKU: Stock Keeping Unit
- RBAC: Role-Based Access Control
- JWT: JSON Web Token
- API: Application Programming Interface
- TTL: Time To Live

## 1.4 References

- Root README: [README.md](README.md)
- Backend README: [backend/README.md](backend/README.md)
- Frontend README: [frontend/README.md](frontend/README.md)
- Prisma schema: [backend/prisma/schema.prisma](backend/prisma/schema.prisma)
- OpenAPI annotations: [backend/src/docs/openapi.annotations.ts](backend/src/docs/openapi.annotations.ts)

## 1.5 Overview

Section 2 provides a product overview. Section 3 details functional requirements. Sections 4 and 5 describe interfaces and non-functional requirements. Sections 6 to 9 provide use cases, architecture, data model, and constraints.

# 2. Overall Description

## 2.1 Product Perspective

The product is a multi-tier web system consisting of a React frontend, a Node.js/Express REST API, a PostgreSQL database accessed via Prisma, and Redis for caching. Socket.IO provides realtime updates scoped to stores.

## 2.2 Product Functions

- Authenticate users and enforce RBAC and store scope.
- Manage stores, users, roles, and store assignments.
- Manage products, variants, categories, brands, and store-specific pricing.
- Track inventory, stock lots, and stock movements.
- Manage procurement, purchase orders, and receiving.
- Support stock transfers between stores.
- Operate POS sales with shifts, cash movements, and checkout.
- Manage invoices, returns, and refunds.
- Manage promotions and discounts.
- Record complaints and track resolution.
- Provide reports and dashboards.
- Record audit logs and system settings.

## 2.3 User Classes and Characteristics

- Admin: Full system configuration, store setup, user and role management, reports, and audit access.
- Store Manager: Store operations, inventory, procurement, transfers, reports, and approvals.
- Employee: Day-to-day operations, inventory updates, receiving, and complaints.
- Cashier: POS checkout, shift management, returns within policy.
- Auditor/Owner: Read-only access to reports and audit logs.

## 2.4 Operating Environment

- Server: Linux/Windows/Mac with Node.js 20+.
- Database: PostgreSQL.
- Cache: Redis 7+.
- Client: Modern browsers (Chrome, Edge, Firefox, Safari).

## 2.5 Design and Implementation Constraints

- Backend and frontend are implemented in TypeScript.
- Backend uses Express with REST endpoints under /api/v1.
- Authentication uses JWT with Authorization: Bearer tokens.
- Store context is resolved from x-store-id or storeId input.
- Data access uses Prisma with PostgreSQL.
- Catalog caching uses Redis with TTL 30-60 seconds.

## 2.6 User Documentation

- Installation and run guide: [README.md](README.md)
- API documentation via Swagger UI at /api-docs (runtime).

## 2.7 Dependencies

- PostgreSQL and Redis availability.
- Environment variables for DATABASE_URL, JWT_SECRET, and REDIS_URL.
- Accurate server time for pricing windows, audit timestamps, and reports.

# 3. System Features

## 3.1 Authentication and Authorization

Description: Authenticate users and enforce RBAC with store scope. Priority: High.

Functional Requirements:

- REQ-AUTH-001: The system shall authenticate users using username or email with password.
- REQ-AUTH-002: The system shall issue a JWT containing userId, role, and store scope.
- REQ-AUTH-003: The system shall reject requests with missing or invalid tokens.
- REQ-AUTH-004: The system shall enforce role-based access control per endpoint.
- REQ-AUTH-005: The system shall resolve active store from x-store-id or storeId input.
- REQ-AUTH-006: The system shall deny non-admin access to stores outside the user scope.
- REQ-AUTH-007: The system shall provide an endpoint to return the current user profile.

## 3.2 User and Role Management

Description: Manage users, roles, and store assignments. Priority: High.

Functional Requirements:

- REQ-USER-001: The system shall allow admins to create, update, and deactivate users.
- REQ-USER-002: The system shall support assigning users to one or more stores.
- REQ-USER-003: The system shall allow setting a primary store per user.
- REQ-USER-004: The system shall expose metadata for roles and stores for UI forms.
- REQ-USER-005: The system shall enforce unique usernames and emails.

## 3.3 Store Management

Description: Manage store profiles and availability. Priority: High.

Functional Requirements:

- REQ-STORE-001: The system shall allow admins to create and update stores.
- REQ-STORE-002: The system shall allow deactivation of stores without data loss.
- REQ-STORE-003: The system shall provide store overview metrics (inventory, sales, staff).
- REQ-STORE-004: The system shall support search and pagination for store lists.

## 3.4 Product Catalog, Categories, Brands, and Pricing

Description: Manage product master data and store-specific pricing. Priority: High.

Functional Requirements:

- REQ-PROD-001: The system shall allow CRUD operations for products and variants.
- REQ-PROD-002: The system shall enforce unique SKU, variant code, and barcode constraints.
- REQ-PROD-003: The system shall allow CRUD operations for categories and brands.
- REQ-PROD-004: The system shall provide a store-scoped catalog view combining product, price, and inventory.
- REQ-PROD-005: The system shall allow store-specific pricing with effective start and end times.
- REQ-PROD-006: The system shall reject overlapping price windows per store and variant.
- REQ-PROD-007: The system shall support search by name, SKU, or barcode.

## 3.5 Inventory and Stock Movement

Description: Track stock levels, lots, and movements per store. Priority: High.

Functional Requirements:

- REQ-INV-001: The system shall maintain inventory per store and variant.
- REQ-INV-002: The system shall allow adjustments by delta or absolute set (mutually exclusive).
- REQ-INV-003: The system shall not allow quantity to fall below reserved.
- REQ-INV-004: The system shall record stock movements for sales, returns, transfers, and adjustments.
- REQ-INV-005: The system shall track stock lots with lot code and optional expiry date.
- REQ-INV-006: The system shall support inventory lookup by barcode or variant.

## 3.6 Procurement and Supplier Management

Description: Manage suppliers and purchase orders. Priority: Medium.

Functional Requirements:

- REQ-SUP-001: The system shall allow CRUD operations for suppliers.
- REQ-PO-001: The system shall allow creation of purchase orders with line items.
- REQ-PO-002: The system shall support purchase order status transitions (draft, submitted, approved, cancelled, received).
- REQ-PO-003: The system shall support receiving purchase orders with receipt documents.
- REQ-PO-004: The system shall update received quantities and total costs on receipt.
- REQ-PO-005: The system shall update inventory and stock lots when receiving items.

## 3.7 Transfers Between Stores

Description: Manage stock transfers between stores. Priority: Medium.

Functional Requirements:

- REQ-TRF-001: The system shall allow creation of transfer requests with items.
- REQ-TRF-002: The system shall reserve stock at the source store on transfer creation.
- REQ-TRF-003: The system shall allow dispatch only for pending transfers.
- REQ-TRF-004: The system shall allow receiving only for in-transit transfers.
- REQ-TRF-005: The system shall allow cancel only for pending transfers and release reserved stock.

## 3.8 POS Sales and Shifts

Description: Support POS checkout with shift and cash handling. Priority: High.

Functional Requirements:

- REQ-POS-001: The system shall require an open shift for checkout.
- REQ-POS-002: The system shall allow opening and closing shifts with cash amounts.
- REQ-POS-003: The system shall record cash-in and cash-out movements during a shift.
- REQ-POS-004: The system shall create invoices and invoice items during checkout.
- REQ-POS-005: The system shall reduce inventory and record stock movements on checkout.
- REQ-POS-006: The system shall support holding and resuming carts.

## 3.9 Invoices and Orders

Description: Manage sales invoices and order history. Priority: High.

Functional Requirements:

- REQ-INVH-001: The system shall list invoices with filters and pagination.
- REQ-INVH-002: The system shall provide invoice details and line items.
- REQ-INVH-003: The system shall generate receipt data for POS printing.

## 3.10 Returns and Refunds

Description: Process returns and refunds from sales. Priority: High.

Functional Requirements:

- REQ-RET-001: The system shall validate return quantities against invoice history.
- REQ-RET-002: The system shall allow partial and full returns.
- REQ-RET-003: The system shall restock inventory when configured for a return.
- REQ-RET-004: The system shall record stock movements for returns.
- REQ-RET-005: The system shall require manager approval for large refunds.
- REQ-RET-006: The system shall record audit logs for return operations.

## 3.11 Promotions and Discounts

Description: Manage promotions and validate discount codes. Priority: Medium.

Functional Requirements:

- REQ-PROMO-001: The system shall allow CRUD operations for promotions.
- REQ-PROMO-002: The system shall validate promotion codes by date range and order total.
- REQ-PROMO-003: The system shall enforce usage limits and store scope when defined.

## 3.12 Complaints Handling

Description: Record and resolve customer complaints. Priority: Medium.

Functional Requirements:

- REQ-COMP-001: The system shall allow creation of complaints with store and employee details.
- REQ-COMP-002: The system shall allow status updates and admin notes.
- REQ-COMP-003: The system shall restrict complaint access to the active store scope.

## 3.13 Reports and Dashboard

Description: Provide operational and revenue reports. Priority: Medium.

Functional Requirements:

- REQ-REP-001: The system shall provide dashboard metrics by store and date range.
- REQ-REP-002: The system shall provide revenue trends and top product reports.
- REQ-REP-003: The system shall default date ranges when none are provided.

## 3.14 Audit Logs

Description: Record critical actions for traceability. Priority: Medium.

Functional Requirements:

- REQ-AUD-001: The system shall record audit logs for create, update, delete, and refund actions.
- REQ-AUD-002: The system shall allow admins to search and filter audit logs by date, user, and action.

## 3.15 Settings and Maintenance

Description: Manage system configuration and maintenance tasks. Priority: Low.

Functional Requirements:

- REQ-SET-001: The system shall store settings grouped by category.
- REQ-SET-002: The system shall allow batch updates of settings.
- REQ-SET-003: The system shall provide default settings initialization.
- REQ-MNT-001: The system shall provide maintenance actions such as backup and cleanup.

## 3.16 Realtime Notifications

Description: Support store-scoped realtime updates. Priority: Low.

Functional Requirements:

- REQ-RTC-001: The system shall allow clients to join and leave store-specific channels.
- REQ-RTC-002: The system shall broadcast store-scoped events for relevant changes.

## 3.17 Catalog Cache

Description: Cache catalog responses to reduce database load. Priority: Medium.

Functional Requirements:

- REQ-CACHE-001: The system shall cache catalog responses using a store and URL key.
- REQ-CACHE-002: The system shall enforce a TTL between 30 and 60 seconds.
- REQ-CACHE-003: The system shall invalidate catalog cache when catalog data changes.

# 4. External Interface Requirements

## 4.1 User Interfaces

- Login page with credential input and error feedback.
- Role-specific layouts for Admin, Manager/Employee, and Cashier.
- Admin UI: store setup, users, products, inventory, procurement, transfers, promotions, reports, and settings.
- Cashier UI: barcode scanning, cart management, payments, shift open/close, and refunds.

## 4.2 Hardware Interfaces

- Optional barcode scanner input as keyboard emulation.
- Optional receipt printer for POS receipts.

## 4.3 Software Interfaces

- PostgreSQL database accessed via Prisma ORM.
- Redis for caching catalog responses.
- Socket.IO for realtime events.
- Swagger/OpenAPI for API documentation.

## 4.4 Communications Interfaces

- REST API over HTTP/HTTPS, JSON request/response.
- WebSocket (Socket.IO) for realtime updates.
- API base path: /api/v1; health endpoint: /health.
- Authorization header uses Bearer JWT.
- Store context is provided via x-store-id or storeId input.

# 5. Non-functional Requirements

## 5.1 Performance

- The system shall return typical read requests within 500 ms for 95 percent of requests under normal load.
- The system shall complete POS checkout in under 2 seconds for 95 percent of requests.
- The system shall support paginated lists up to 200 records per page.
- Catalog caching shall reduce repeated catalog read latency.

## 5.2 Availability and Recovery

- The system shall target 99.5 percent monthly API availability.
- The system shall support database backups and restore procedures.

## 5.3 Security

- Passwords shall be stored using salted hashing (bcrypt).
- JWT tokens shall expire and be validated on every protected request.
- Role-based access and store scope checks shall be enforced for protected endpoints.
- Transport security (HTTPS) shall be required in production deployments.

## 5.4 Reliability and Data Integrity

- Inventory updates, receipts, and checkout operations shall be atomic.
- Duplicate receives shall be prevented by idempotent reference handling.
- Audit logs shall record critical changes.

## 5.5 Maintainability and Testability

- The codebase shall be modular by domain to isolate changes.
- API documentation shall be maintained via OpenAPI annotations.
- Automated tests shall cover critical business flows.

## 5.6 Scalability

- The API layer shall support horizontal scaling behind a load balancer.
- Redis cache shall be shared across API instances.

## 5.7 Usability

- The POS workflow shall minimize clicks and support barcode scanning.
- Role-specific navigation shall present only permitted modules.

## 5.8 Localization

- Store timezone shall be used for reporting and price effective windows.
- Currency formatting shall be configurable at the UI layer.

# 6. Use Cases

## 6.1 UC-01 User Login

Actors: Admin, Manager, Employee, Cashier
Preconditions: User account is active.
Trigger: User submits login credentials.
Main Flow:

1. User enters username/email and password.
2. System validates credentials.
3. System returns JWT, user profile, and store scope.
   Alternate Flows:
   A1. Invalid credentials -> error message.
   Postconditions: User is authenticated and can access permitted modules.

## 6.2 UC-02 Switch Active Store

Actors: Admin, Manager, Employee
Preconditions: User has access to multiple stores.
Trigger: User selects another store in UI.
Main Flow:

1. UI sends requests with x-store-id of the selected store.
2. System validates store scope and sets activeStoreId.
   Alternate Flows:
   A1. Store not allowed -> 403 error.
   Postconditions: Subsequent requests operate under the selected store.

## 6.3 UC-03 Maintain Product Catalog

Actors: Admin, Manager
Preconditions: User has catalog permissions.
Trigger: User creates or edits product data.
Main Flow:

1. User creates or updates product and variant details.
2. System validates unique SKU and barcode.
3. System saves the catalog item.
   Alternate Flows:
   A1. Duplicate SKU or barcode -> validation error.
   Postconditions: Product catalog is updated and available to stores.

## 6.4 UC-04 Receive Purchase Order

Actors: Manager, Inventory Staff
Preconditions: Purchase order exists and is approved.
Trigger: Goods arrive at the store/warehouse.
Main Flow:

1. User creates a receipt and enters received quantities.
2. System updates purchase order status and received quantities.
3. System updates inventory and stock lots.
   Alternate Flows:
   A1. Receipt reference already used -> idempotency rejection.
   Postconditions: Inventory reflects received goods and receipt is recorded.

## 6.5 UC-05 Transfer Stock Between Stores

Actors: Manager, Inventory Staff
Preconditions: Source store has available inventory.
Trigger: User creates a transfer request.
Main Flow:

1. User creates a transfer with item quantities.
2. System reserves source stock and sets status to pending.
3. User dispatches transfer; system marks in transit and reduces quantity.
4. Receiving store accepts transfer; system increases quantity.
   Alternate Flows:
   A1. Cancel pending transfer -> reserved stock released.
   Postconditions: Stock is moved from source to destination and logged.

## 6.6 UC-06 POS Checkout

Actors: Cashier
Preconditions: Shift is open; products are in catalog.
Trigger: Customer proceeds to checkout.
Main Flow:

1. Cashier scans items and sets quantities.
2. System calculates totals and applies promotions.
3. Cashier confirms payment method and amount.
4. System creates invoice and reduces inventory.
   Alternate Flows:
   A1. No open shift -> checkout rejected.
   Postconditions: Invoice is recorded and inventory updated.

## 6.7 UC-07 Hold and Resume Cart

Actors: Cashier
Preconditions: Items are in cart.
Trigger: Cashier places transaction on hold.
Main Flow:

1. Cashier marks cart as hold.
2. System creates a pending invoice and reserves stock.
3. Cashier resumes the cart later.
   Alternate Flows:
   A1. Item stock is insufficient on resume -> prompt for adjustment.
   Postconditions: Cart is resumed and can proceed to checkout.

## 6.8 UC-08 Return and Refund

Actors: Cashier, Manager
Preconditions: Original invoice exists.
Trigger: Customer requests return.
Main Flow:

1. Cashier selects invoice and items to return.
2. System validates remaining return quantity.
3. System calculates refund and creates return record.
4. Inventory is restocked if configured.
   Alternate Flows:
   A1. Refund exceeds threshold -> manager approval required.
   Postconditions: Return is recorded and refund processed.

## 6.9 UC-09 Apply Promotion

Actors: Cashier
Preconditions: Promotion exists and is active.
Trigger: Cashier enters promotion code at checkout.
Main Flow:

1. System validates promotion code and rules.
2. System applies discount to the order.
   Alternate Flows:
   A1. Promotion invalid or expired -> error message.
   Postconditions: Checkout totals reflect applied discount.

## 6.10 UC-10 View Reports

Actors: Admin, Manager, Auditor
Preconditions: User has report access.
Trigger: User opens dashboard or report page.
Main Flow:

1. User selects date range and store.
2. System aggregates and returns metrics.
   Alternate Flows:
   A1. No data -> return empty results.
   Postconditions: Reports are displayed.

## 6.11 UC-11 Handle Complaint

Actors: Manager, Admin
Preconditions: Complaint is created.
Trigger: Manager updates complaint status.
Main Flow:

1. User reviews complaint details.
2. User updates status and admin note.
   Alternate Flows:
   A1. User not authorized for store -> 403 error.
   Postconditions: Complaint status is updated.

# 7. System Architecture

The system uses a layered architecture:

- Presentation layer: React frontend (role-specific layouts and routing).
- API layer: Express REST API with middleware for auth, store scope, and error handling.
- Data layer: Prisma ORM with PostgreSQL database.
- Cache layer: Redis for catalog caching.
- Realtime layer: Socket.IO for store-scoped events.
- Background processing: Scheduler for periodic maintenance tasks.

Key data flow:

1. UI sends REST requests with JWT and x-store-id.
2. API validates auth and scope, applies business rules, and reads/writes via Prisma.
3. Catalog responses may be cached in Redis; invalidation occurs on catalog updates.
4. Realtime events are emitted to store rooms as needed.

# 8. Data Model

The database schema is defined in [backend/prisma/schema.prisma](backend/prisma/schema.prisma). Key entities include:

Master data:

- stores: store profile and status.
- roles, users, user_stores: RBAC and store membership.
- categories, brands, products, product_variants, variant_prices: catalog and pricing.
- promotions: discount rules and validity windows.

Operational data:

- inventories: per store stock levels and reserved quantities.
- stock_lots: lot tracking with optional expiry.
- stock_movements: immutable movement ledger.
- purchase_orders, purchase_items, purchase_order_receipts, purchase_order_receipt_items: procurement lifecycle.
- store_transfers, store_transfer_items: inter-store transfer lifecycle.
- invoices, invoice_items: POS sales history.
- returns, return_items: refund workflow.
- pos_shifts, cash_movements: shift and cash tracking.
- complaints: complaint records and status tracking.
- audit_logs: system audit events.
- customers, loyalty_points: customer and loyalty tracking.

Relationship summary:

- A store has many inventories, invoices, purchase orders, receipts, transfers, shifts, and movements.
- A product has many variants; variants appear in inventories, invoice items, return items, transfers, and lots.
- A user has a role and may be assigned to multiple stores via user_stores.
- Purchase orders have items and receipts; receipts have receipt items and update inventory.
- Invoices have invoice items; returns reference invoices and contain return items.

# 9. Assumptions and Constraints

- The system runs on Node.js 20+ with PostgreSQL and Redis available.
- Environment variables for database and JWT configuration are provided at startup.
- API clients include Authorization: Bearer tokens for protected endpoints.
- Store scope is enforced with x-store-id or storeId input for non-admin roles.
- Pricing and reporting are based on server time and configured store timezones.
- Single-currency operation is assumed unless configured otherwise at the UI layer.
