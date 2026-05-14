# Store Chain Management System - Software Architecture Document (SAD)

Organization: Store Chain
Project: Store Chain Management System
Content Owner: TBD
Document Number: SAD-SCMS-001
Release/Revision: 1.0
Release/Revision Date: 2026-05-14

## Table of Contents

1. Documentation Roadmap
2. Architecture Background
3. Views
4. Relations Among Views
5. Referenced Materials
6. Directory
7. Sample Figures and Tables
8. Appendices

# 1. Documentation Roadmap

This section explains how the SAD is structured and how to use it.

## 1.1 Document Management and Configuration Control Information

Revision history:

| Revision | Date       | Purpose         | Scope        |
| -------- | ---------- | --------------- | ------------ |
| 1.0      | 2026-05-14 | Initial release | All sections |

## 1.2 Purpose and Scope of the SAD

This SAD documents the software architecture for the Store Chain Management System. It covers the major architectural structures, their elements, and the relationships between them. The document focuses on architectural concerns: system decomposition, runtime interactions, deployment topology, and data structures.

Out of scope: detailed API specifications, UI wireframes, and implementation-level details that do not affect system interactions.

## 1.3 How the SAD Is Organized

- Section 1 explains how to navigate the SAD and the stakeholders it serves.
- Section 2 provides background, goals, and driving requirements.
- Section 3 presents architectural views (module, runtime, deployment, data).
- Section 4 documents relations among the views.
- Sections 5 and 6 provide references and a glossary.

## 1.4 Stakeholder Representation

Stakeholders and concerns:

| Stakeholder    | Primary Concerns                                       |
| -------------- | ------------------------------------------------------ |
| Business Owner | Time to market, operational coverage, risk containment |
| Store Manager  | Availability, POS performance, data accuracy           |
| Cashier        | Fast checkout, minimal downtime                        |
| Admin          | Security, role control, auditability                   |
| Developer      | Modularity, maintainability, testability               |
| DevOps         | Deployability, monitoring, recovery                    |
| Auditor        | Traceability, audit logs, access control               |

## 1.5 Viewpoint Definitions

The SAD uses four viewpoints to cover stakeholder concerns. Each viewpoint has a corresponding view in Section 3.

### 1.5.1 Module Decomposition Viewpoint

#### Abstract

Shows the static decomposition of the system into implementation modules.

#### Stakeholders and Their Concerns Addressed

Developers, testers, and managers need to understand ownership, responsibilities, and boundaries.

#### Elements, Relations, Properties, and Constraints

- Elements: modules, packages, and routers.
- Relations: depends-on, imports, uses.
- Properties: responsibility, public interfaces, ownership.
- Constraints: module boundaries align with domain modules.

#### Language(s) to Model/Represent Conforming Views

Text and tables with simple diagrams.

#### Applicable Evaluation/Analysis Techniques and Consistency/Completeness Criteria

- Each requirement maps to at least one module.
- Each public API route maps to exactly one module.

#### Viewpoint Source

Adapted from the View and Beyond module viewpoint.

### 1.5.2 Component-and-Connector Viewpoint

#### Abstract

Shows runtime components and interactions.

#### Stakeholders and Their Concerns Addressed

Operations and performance stakeholders need to know how requests flow and what components are critical.

#### Elements, Relations, Properties, and Constraints

- Elements: frontend client, API server, database, cache, realtime server.
- Relations: request/response, event emission, data access.
- Properties: latency, availability, scalability.
- Constraints: store scoping on all non-admin requests.

#### Language(s) to Model/Represent Conforming Views

Text and ASCII sequence/context diagrams.

#### Applicable Evaluation/Analysis Techniques and Consistency/Completeness Criteria

- Every external request has a defined path and error handling.
- Caching and invalidation are documented for catalog endpoints.

#### Viewpoint Source

Adapted from the View and Beyond component-and-connector viewpoint.

### 1.5.3 Deployment (Allocation) Viewpoint

#### Abstract

Shows the mapping of software elements to runtime environments.

#### Stakeholders and Their Concerns Addressed

DevOps and maintainers need deployment topology and runtime dependencies.

#### Elements, Relations, Properties, and Constraints

- Elements: API service, database, cache, client.
- Relations: network links, environment variables.
- Properties: ports, scaling, health checks.
- Constraints: API base path /api/v1, health endpoint /health.

#### Language(s) to Model/Represent Conforming Views

Text with deployment diagrams.

#### Applicable Evaluation/Analysis Techniques and Consistency/Completeness Criteria

- All runtime dependencies are explicit (PostgreSQL, Redis).
- Health and metrics endpoints are specified.

#### Viewpoint Source

Adapted from the View and Beyond allocation viewpoint.

### 1.5.4 Data Viewpoint

#### Abstract

Shows major data entities and their relationships.

#### Stakeholders and Their Concerns Addressed

Business, developers, and auditors need to understand data coverage and constraints.

#### Elements, Relations, Properties, and Constraints

- Elements: entities in the database schema.
- Relations: foreign keys, one-to-many, many-to-many.
- Properties: integrity constraints, auditability.
- Constraints: store scoped data access.

#### Language(s) to Model/Represent Conforming Views

Text and ERD-style descriptions.

#### Applicable Evaluation/Analysis Techniques and Consistency/Completeness Criteria

- Entities cover functional requirements from SRS.
- Audit logging is captured for critical actions.

#### Viewpoint Source

Internal viewpoint aligned to the Prisma schema.

## 1.6 How a View is Documented

Each view is documented with a description, a view packet overview, architecture background, variability mechanisms, and a single view packet that includes primary presentation, element catalog, context diagram, and related view packets.

## 1.7 Relationship to Other SADs

Not applicable for this release.

## 1.8 Process for Updating this SAD

Submit changes via a pull request with a short summary and updated revision history. Requests are reviewed by the content owner and lead engineer before merging.

# 2. Architecture Background

## 2.1 Problem Background

### 2.1.1 System Overview

The system provides a web-based platform for multi-store retail operations: catalog, pricing, inventory, procurement, transfers, POS sales, returns, promotions, complaints, reports, audit logs, and settings.

### 2.1.2 Goals and Context

- Provide store-scoped access with role-based authorization.
- Support fast POS transactions and inventory updates.
- Centralize operations across stores with a shared data model.
- Provide observability via health, metrics, and logs.

### 2.1.3 Significant Driving Requirements

- JWT authentication with role-based access and store scoping.
- REST API under /api/v1 with Swagger documentation.
- Catalog caching with Redis and explicit invalidation.
- Realtime updates through Socket.IO store rooms.
- PostgreSQL as primary data store with Prisma ORM.

## 2.2 Solution Background

### 2.2.1 Architectural Approaches

- Modular monolith backend: Express routers per domain module.
- Central API gateway via Express app with security and monitoring middleware.
- Data access via Prisma and PostgreSQL with transactional boundaries.
- Redis for catalog cache and background job queue (Bull.js).
- Socket.IO for store-scoped realtime events.
- React + Vite frontend with role-based layouts.

### 2.2.2 Analysis Results

No formal ATAM has been performed. Architecture decisions are validated through unit/integration tests, health checks, and performance targets defined in the SRS. Cache hit rate and response time are monitored via metrics.

### 2.2.3 Requirements Coverage

- Auth and RBAC: middleware pipeline and /auth routes.
- Store scoping: active store resolution and store checks.
- POS and inventory: domain modules in backend and schema entities.
- Reporting and audit: reports module and audit_logs module.
- Observability: /health, /metrics, structured logging.

### 2.2.4 Summary of Background Changes Reflected in Current Version

Initial SAD release reflects Phase 1 enhancements: monitoring, security middleware, and job queue setup.

## 2.3 Product Line Reuse Considerations

The architecture supports reuse across multiple retail chains by adjusting configuration (stores, roles, pricing rules) and enabling optional modules (loyalty, dynamic pricing).

# 3. Views

## 3.1 Module Decomposition View

### 3.1.1 View Description

Shows the code-level decomposition into domain modules, shared libraries, and interfaces.

### 3.1.2 View Packet Overview

Single view packet: backend and frontend module decomposition.

### 3.1.3 Architecture Background

Modules align to business domains and API routes. Each router contains its own Prisma access and validation.

### 3.1.4 Variability Mechanisms

Feature flags can be introduced per module; optional modules (loyalty, pricing) are already isolated.

### 3.1.5 View Packets

#### 3.1.5.1 View Packet 1

##### Primary Presentation

```
backend/
  src/
    app.ts (middleware pipeline)
    routes/index.ts (route registry)
    modules/
      auth, users, stores, products, inventory, orders, pos,
      invoices, returns, transfers, promotions, complaints,
      reports, audit_logs, settings, loyalty, pricing
    lib/ (monitoring, queues, infrastructure)
frontend/
  src/
    services/ (axios client, API wrappers)
    layouts/ (role-based shells)
    pages/ (feature pages)
```

##### Element Catalog

- Elements: domain modules, shared libs, API client, UI layouts.
- Relations: routes import modules, modules use Prisma, UI uses services.
- Interfaces: REST endpoints, axios service wrappers.
- Behavior: request validation, store scoping, cache invalidation.
- Constraints: each module owns its route prefix.

##### Context Diagram

```
[Browser] -> [Frontend] -> [Backend API] -> [PostgreSQL]
                            |-> [Redis]
```

##### Variability Mechanisms

Optional modules (loyalty, pricing) can be enabled per deployment.

##### Architecture Background

The modular monolith reduces operational overhead while keeping domain boundaries explicit.

##### Related View Packets

See Component-and-Connector View for runtime behavior.

## 3.2 Component-and-Connector View

### 3.2.1 View Description

Shows runtime components and their interactions.

### 3.2.2 View Packet Overview

Single view packet: runtime request flow and realtime events.

### 3.2.3 Architecture Background

The system separates stateless API handling from stateful data stores and cache.

### 3.2.4 Variability Mechanisms

Realtime channels are store-scoped; cache TTL is configurable.

### 3.2.5 View Packets

#### 3.2.5.1 View Packet 1

##### Primary Presentation

```
Client -> API (Express) -> Prisma -> PostgreSQL
                     |-> Redis (cache/queue)
                     |-> Socket.IO (store rooms)
```

##### Element Catalog

- Elements: React client, Express API, Prisma, PostgreSQL, Redis, Socket.IO.
- Relations: HTTP requests, DB queries, cache get/set, websocket events.
- Interfaces: REST /api/v1, /socket.io, /health, /metrics.
- Behavior: authenticate -> authorize -> resolve store -> execute module.
- Constraints: non-admin store access restricted by x-store-id.

##### Context Diagram

```
External User
  | HTTP/WS
[Frontend] <-> [API Server] <-> [PostgreSQL]
                      |-> [Redis]
```

##### Variability Mechanisms

Cache TTL and scheduling intervals are configurable.

##### Architecture Background

Store-scoped rooms isolate realtime events per store.

##### Related View Packets

Deployment view describes runtime placement.

## 3.3 Deployment View

### 3.3.1 View Description

Shows how software is deployed across runtime environments.

### 3.3.2 View Packet Overview

Single view packet: local and container-based deployment.

### 3.3.3 Architecture Background

The system supports local dev with Vite proxy and backend running on port 3000.

### 3.3.4 Variability Mechanisms

API and cache endpoints are set via environment variables.

### 3.3.5 View Packets

#### 3.3.5.1 View Packet 1

##### Primary Presentation

```
[User Browser]
    -> Vite Dev Server (frontend)
    -> API Server (backend)
         -> PostgreSQL
         -> Redis
```

##### Element Catalog

- Elements: frontend dev server, backend API, PostgreSQL, Redis.
- Relations: Vite proxy to /api/v1 and /socket.io.
- Interfaces: HTTP ports 5173 and 3000; DB 5432; Redis 6379.
- Behavior: stateless API nodes can scale horizontally.
- Constraints: environment variables for DB and JWT secrets.

##### Context Diagram

```
[Browser] -> [Vite] -> [API] -> [PostgreSQL]
                       |-> [Redis]
```

##### Variability Mechanisms

Containerized deployment via Docker Compose is supported.

##### Architecture Background

Health checks are exposed at /health with metrics at /metrics.

##### Related View Packets

See Data View for data storage details.

## 3.4 Data View

### 3.4.1 View Description

Summarizes major entities and relationships in the data model.

### 3.4.2 View Packet Overview

Single view packet: core operational entities.

### 3.4.3 Architecture Background

The Prisma schema defines the authoritative data model and constraints.

### 3.4.4 Variability Mechanisms

Optional entities for loyalty and pricing can be enabled per deployment phase.

### 3.4.5 View Packets

#### 3.4.5.1 View Packet 1

##### Primary Presentation

Key entities:

- stores, users, roles, user_stores
- products, product_variants, categories, brands, variant_prices
- inventories, stock_lots, stock_movements
- purchase_orders, purchase_order_receipts
- store_transfers, store_transfer_items
- invoices, invoice_items, returns, return_items
- promotions, complaints, audit_logs, settings

##### Element Catalog

- Elements: entities above.
- Relations: store scoped entities reference store_id.
- Interfaces: Prisma model access and REST endpoints.
- Behavior: transactional updates for inventory and sales.
- Constraints: unique SKU and barcode; non-negative inventory.

##### Context Diagram

```
[API] -> [Prisma] -> [PostgreSQL]
```

##### Variability Mechanisms

Additional analytical tables can be added without changing core POS flows.

##### Architecture Background

Audit logs provide traceability for critical operations.

##### Related View Packets

Module view maps entities to domain modules.

# 4. Relations Among Views

## 4.1 General Relations Among Views

- Module view defines code ownership for elements shown in runtime and data views.
- Component view shows execution of modules at runtime.
- Deployment view maps components to runtime environments.
- Data view provides persistence for module behavior.

## 4.2 View-to-View Relations

- Each backend module in the Module View maps to a route in the Component View.
- Data entities map to module responsibilities (e.g., inventory module -> inventories, stock_movements).
- Deployment nodes host the components described in the Component View.

# 5. Referenced Materials

- [README.md](README.md)
- [SRS.md](SRS.md)
- [BRD.md](BRD.md)
- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [backend/docs/system_design](backend/docs/system_design)
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma)

# 6. Directory

## 6.1 Index

Not maintained in this release.

## 6.2 Glossary

| Term        | Definition                                     |
| ----------- | ---------------------------------------------- |
| SAD         | Software Architecture Document                 |
| View        | Representation of architectural structure      |
| Store scope | Active store context enforced by access checks |

## 6.3 Acronym List

| Acronym | Meaning                             |
| ------- | ----------------------------------- |
| API     | Application Programming Interface   |
| POS     | Point of Sale                       |
| RBAC    | Role Based Access Control           |
| JWT     | JSON Web Token                      |
| SRS     | Software Requirements Specification |

# 7. Sample Figures and Tables

Not applicable in this release.

# 8. Appendices

## Appendix A - API Surface Summary

Base path: /api/v1

Primary route groups:

- /auth, /users, /stores
- /products, /categories, /inventory, /pricing
- /orders, /invoices, /returns, /pos, /transfers
- /promotions, /complaints, /loyalty
- /reports, /audit-logs, /settings
