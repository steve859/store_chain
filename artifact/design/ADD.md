# ADD

_Source file: `ADD_Store_Chain_Revised_By_ASR.docx`_

ATTRIBUTE-DRIVEN DESIGN DOCUMENT

Store Chain Management System

Version 1.1 - Revised according to ASR and ADD Template

Prepared by
Team

# Table of content

1. Design Constraints

2. Quality Attribute Requirements

2.1 Security

2.1.1 Authentication and Authorization

2.1.2 Data Protection

2.1.3 Audit Logging and Sensitive Operations

2.1.4 Payment Security

2.2 Performance

2.2.1 Fast Response Times

2.2.2 POS and Dynamic Pricing Latency

2.2.3 Scalability for Concurrent Users

2.3 Usability

2.3.1 Smooth User Experience

2.3.2 Easy-to-Use Role-Based Interface

2.4 Interoperability

2.4.1 External System Integration

2.4.2 Internal Module Communication

2.5 Modifiability

2.5.1 Supporting Business Requirement Changes

2.5.2 Zero-Downtime Updates

2.6 Availability and Reliability

2.6.1 Fault Tolerance and System Recovery

2.6.2 Low-Stock Notification and Background Job Reliability

2.7 Data Integrity and Consistency

2.7.1 Transactional Consistency for POS, Inventory, Loyalty, Transfers

2.7.2 Reporting and Analytics Data Accuracy

3. Architectural Representation

3.1 Logical View

3.2 Implementation View

3.3 Deployment View

3.4 Data View

4. ASR Traceability Matrix

# 1. Design Constraints

The following constraints shape all architectural and implementation decisions for the Store Chain Management System. They are revised to match the corrected ASR and SRS non-functional requirements.

| Constraint | Details |
| --- | --- |
| Scalability | The system must support at least 5,000 concurrent users and concurrent POS terminals across multiple stores during peak periods such as promotions and holidays. |
| Performance | POS transaction processing must complete within 2 seconds under normal load. Dashboard loading time must not exceed 3 seconds for standard reports. Dynamic pricing calculation latency should remain below 100 ms per item batch where feasible. |
| Security | The system must enforce JWT authentication, RBAC, store-scoped authorization, HTTPS/TLS, encrypted passwords, audit logging, and rate limiting for failed login attempts. |
| Availability | Production operation targets 99.99% uptime. Architecture must support database replication, failover, automated backup, disaster recovery, and monitoring/alerting. |
| Data Integrity | POS sales, inventory deduction, loyalty points, transfer approval, report generation, and price rollback must use transactional boundaries and audit trails to prevent inconsistent business data. |
| Modifiability | Pricing, promotion, loyalty, low-stock threshold, and reporting rules must be isolated in dedicated modules so business rule changes have localized impact. |
| Implementation | Frontend uses ReactJS. Backend uses Node.js and ExpressJS. PostgreSQL is the primary database. Redis is used for caching, job queues, and Pub/Sub. APIs follow RESTful architecture. Real-time communication uses WebSocket where required. Docker is used for deployment. |
| Interoperability | The system must support barcode scanners at POS, report export in PDF/XLSX/CSV, future payment gateway integration, and integration with BI/reporting tools through APIs. |

# 2. Quality Attribute Requirements

This section follows the ADD template scenario format. Each quality attribute scenario is derived from the ASR modules and the SRS non-functional requirements for the Store Chain Management System.

## 2.1 Security

### 2.1.1 Authentication and Authorization

| Element | Auth middleware, user management, RBAC rules, store-scoped authorization, and session management. |
| --- | --- |
| Statement | The system must authenticate users securely and enforce role-based and store-scoped access on every protected request. |
| Stimulus | Users attempt to log in, manage users, configure roles, access dashboards, run reports, change prices, approve transfers, or handle complaints. |
| Stimulus source | Admin, District Manager, Store Manager, Cashier, Inventory Staff, Loyalty Member. |
| Environment | Normal operation through the ReactJS frontend or direct REST API access. |
| Artifact | Auth routes, JWT middleware, RBAC module, user service, role-permission configuration, role-based layouts. |
| Response | Generate signed JWTs after successful credential validation. Enforce RBAC and store/region scope for all protected endpoints. Hide unauthorized UI modules. Apply session expiration and failed-login monitoring. Log all successful and failed access attempts. |
| Response measure | 100% protected endpoints require valid JWT. 100% unauthorized access attempts blocked and logged. Login and authorization checks complete within 2 seconds under normal load. Role permission changes are written to audit logs. |

### 2.1.2 Data Protection

| Element | PostgreSQL, Redis, API transport, backups, secrets, and personal/customer data. |
| --- | --- |
| Statement | Sensitive business, user, transaction, loyalty, complaint, and audit data must be protected in storage and transmission. |
| Stimulus | The system stores, processes, exports, or transmits user profiles, transaction data, loyalty information, report data, and audit records. |
| Stimulus source | All system roles and system background services. |
| Environment | Normal runtime, report export, backup, recovery, and administrative operations. |
| Artifact | Database, cache, file export storage, API layer, secret management, audit logs. |
| Response | Enforce HTTPS/TLS for client-server and service communication. Store passwords using secure hashing and salt. Encrypt sensitive fields at rest. Restrict database and export access by role. Keep API keys and credentials outside source code. Sanitize search and report filters. |
| Response measure | 100% production API traffic encrypted. 100% passwords stored hashed. Sensitive fields encrypted at rest. Exported reports only available to authorized users. Security logs retained according to audit policy. |

### 2.1.3 Audit Logging and Sensitive Operations

| Element | Audit log service and sensitive workflow modules. |
| --- | --- |
| Statement | Sensitive operations must be traceable so administrators can investigate changes, fraud, or data inconsistency. |
| Stimulus | A user updates permissions, creates/updates stores, adjusts stock, approves transfers, changes prices, rolls back prices, exports reports, or handles complaints. |
| Stimulus source | Admin, District Manager, Store Manager, Inventory Staff, Cashier, System. |
| Environment | Normal business operation and post-incident investigation. |
| Artifact | Audit log module, users, stores, inventory, transfers, pricing, reports, complaints, POS modules. |
| Response | Record actor, action, target entity, timestamp, old value, new value, result, and request source. Make audit records append-only. Provide filters for administrators and reporting modules. |
| Response measure | 100% sensitive operations generate audit records. Audit write failure triggers alerting. Audit records are immutable to ordinary users and searchable by authorized administrators. |

### 2.1.4 Payment Security

| Element | POS payment recording and future payment gateway integration. |
| --- | --- |
| Statement | The system must avoid storing raw card information and must process payment-related data safely. |
| Stimulus | Cashier records a POS payment or the future gateway sends a payment result webhook. |
| Stimulus source | Cashier, payment gateway. |
| Environment | POS checkout and future online/payment-gateway integration. |
| Artifact | POS module, transaction records, invoice/payment records, webhook handler. |
| Response | Store only payment method, amount, status, and reference. Do not store raw card data. Use HTTPS and authenticated gateway communication. Verify webhook signatures and process each payment response idempotently. |
| Response measure | 0% raw card data stored. 100% payment gateway messages verified before state changes. Payment failures produce clear retry messages and logs. |

## 2.2 Performance

### 2.2.1 Fast Response Times

| Element | API request handling, catalog reads, dashboards, reports, and common queries. |
| --- | --- |
| Statement | The system must meet response-time targets for day-to-day store operations and management screens. |
| Stimulus | Users load dashboards, search product catalog, view transaction history, generate reports, or manage stores/products. |
| Stimulus source | Admin, District Manager, Store Manager, Cashier, Inventory Staff. |
| Environment | Normal and peak business operation. |
| Artifact | Node.js/Express API, PostgreSQL, Redis cache, report service, frontend service clients. |
| Response | Use Redis cache for frequently accessed catalog/dashboard data. Apply database indexes on SKU, barcode, product name, store, date, and transaction status. Paginate search and history screens. Run heavy report generation asynchronously when needed. |
| Response measure | POS transaction processing <= 2 seconds under normal load. Dashboard loading <= 3 seconds for standard reports. Catalog searches complete within acceptable page latency. Alerts trigger when thresholds are exceeded. |

### 2.2.2 POS and Dynamic Pricing Latency

| Element | POS transaction flow, promotion engine, loyalty service, and pricing engine. |
| --- | --- |
| Statement | Checkout and price calculations must be fast enough to avoid slowing cashier operation. |
| Stimulus | Cashier scans items, applies loyalty member, applies promotion, redeems points, and completes payment. |
| Stimulus source | Cashier and system pricing/promotion services. |
| Environment | High-frequency POS usage during store operating hours. |
| Artifact | POS module, inventory service, promotion service, loyalty service, dynamic pricing engine, Redis. |
| Response | Preload current prices and active promotions. Use efficient calculation logic. Cache active pricing/promotion rules. Publish price updates to POS clients via WebSocket/Redis Pub/Sub. Keep payment and receipt generation bounded. |
| Response measure | Price calculation latency below 100 ms per item batch where feasible. 95% of checkout transactions complete within 2 seconds under normal load. Stale price updates are detected and corrected. |

### 2.2.3 Scalability for Concurrent Users

| Element | API servers, database, cache, WebSocket, and job queue infrastructure. |
| --- | --- |
| Statement | The architecture must support concurrent usage across all stores and roles. |
| Stimulus | At least 5,000 concurrent users access POS, dashboards, inventory, reports, transfers, and pricing modules. |
| Stimulus source | Multiple stores, cashiers, managers, admins, and system jobs. |
| Environment | Peak operational periods such as promotions or holidays. |
| Artifact | Stateless API nodes, load balancer, PostgreSQL, Redis, WebSocket service, report/background job workers. |
| Response | Deploy stateless API instances behind a load balancer. Use Redis for caching and queues. Add PostgreSQL read replicas for read-heavy workloads. Isolate long-running jobs from request threads. Use backpressure/rate limiting where required. |
| Response measure | System supports 5,000 concurrent users. Error rate remains within target under peak load. Scaling actions are observable through metrics and alerts. |

## 2.3 Usability

### 2.3.1 Smooth User Experience

| Element | POS, inventory, transfer, complaint, and report workflows. |
| --- | --- |
| Statement | Key workflows must be simple, responsive, and clear for store staff and managers. |
| Stimulus | Users perform checkout, close shift, update stock, create transfer requests, approve transfers, submit complaints, or export reports. |
| Stimulus source | Cashier, Inventory Staff, Store Manager, Loyalty Member. |
| Environment | Daily store operations under time pressure. |
| Artifact | ReactJS UI pages, forms, validation components, REST APIs, notification components. |
| Response | Provide clear field validation, confirmation messages, progress states, retry options, and role-appropriate actions. Minimize steps in POS and inventory workflows. Display clear error messages based on SRS message codes. |
| Response measure | 95% of POS checkout flows complete on first attempt. Common tasks are discoverable within 1 minute. Most required-field errors are caught before submission. |

### 2.3.2 Easy-to-Use Role-Based Interface

| Element | Role-based layouts, navigation, dashboards, and action visibility. |
| --- | --- |
| Statement | Users should see only modules and actions relevant to their role and scope. |
| Stimulus | User logs in and navigates the system. |
| Stimulus source | Admin, District Manager, Store Manager, Cashier, Inventory Staff, Loyalty Member. |
| Environment | Normal browser use across desktop and supported devices. |
| Artifact | Frontend routing, sidebar/menu configuration, dashboard widgets, RBAC state. |
| Response | Render dashboards and menus according to role. Hide unauthorized functions in the UI while enforcing permission again on the backend. Use consistent page layouts and plain labels. |
| Response measure | No unauthorized module visible/actionable without permission. Average time to locate main functions is below 1 minute. UI support requests for basic tasks remain low. |

## 2.4 Interoperability

### 2.4.1 External System Integration

| Element | Barcode scanners, payment gateways, report export, and BI/reporting integrations. |
| --- | --- |
| Statement | The system must exchange data with store devices and external services safely and consistently. |
| Stimulus | Barcode is scanned at POS, report is exported, BI tool queries report data, or payment gateway sends a response. |
| Stimulus source | Store devices, external payment providers, BI tools, administrators. |
| Environment | POS checkout, reporting, and future integration operation. |
| Artifact | POS UI, export service, integration adapters, webhook handler, REST APIs. |
| Response | Treat barcode scanner input as keyboard input and validate scanned codes. Export reports in PDF, XLSX, and CSV. Use TLS, authentication, timeouts, retries, and signature verification for external integrations. |
| Response measure | Scanner input adds no meaningful latency. Report export succeeds for authorized users. External integration success rate >= 99.5% excluding partner-side errors. Failed integrations recover or alert within 5 minutes. |

### 2.4.2 Internal Module Communication

| Element | Backend modules, service layer, Redis Pub/Sub, database transactions. |
| --- | --- |
| Statement | Internal modules must communicate through clear interfaces with transactional boundaries. |
| Stimulus | Checkout updates inventory and loyalty; transfers move stock; pricing updates POS prices; low-stock monitoring triggers notifications. |
| Stimulus source | API requests and scheduled/background services. |
| Environment | Normal operation and background processing. |
| Artifact | Express routers/controllers, services, repositories, Redis Pub/Sub, PostgreSQL transactions. |
| Response | Use service interfaces for synchronous calls. Use database transactions for multi-module state changes. Use Redis Pub/Sub or job queues for decoupled notifications and dashboard updates. Apply retries and circuit breakers to prevent cascading failures. |
| Response measure | Multi-domain operations either complete fully or roll back. Inter-module call latency remains low. Background events are delivered or retried with logs. |

## 2.5 Modifiability

### 2.5.1 Supporting Business Requirement Changes

| Element | Pricing, promotions, loyalty, reporting, complaint, and inventory rule modules. |
| --- | --- |
| Statement | Frequent business-rule changes must be localized and low-risk. |
| Stimulus | Stakeholders request new promotion rules, loyalty tier thresholds, pricing strategies, low-stock thresholds, report formats, or complaint workflows. |
| Stimulus source | Business stakeholders, product team, administrators. |
| Environment | Development and maintenance phases. |
| Artifact | Domain modules, configuration/settings tables, rule services, automated tests. |
| Response | Isolate each business capability into a module. Store adjustable thresholds and parameters in configuration where possible. Use strategy/rule-style services for pricing, promotions, and loyalty. Keep APIs documented and covered by regression tests. |
| Response measure | Minor business rule changes implemented within one sprint. Number of affected modules <= 2 for common rule changes. Regression rate after updates <= 1%. |

### 2.5.2 Zero-Downtime Updates

| Element | API servers, frontend deployment, migrations, workers, and configuration updates. |
| --- | --- |
| Statement | Deployments should minimize disruption to active store operations. |
| Stimulus | A new version, security patch, or configuration update is deployed. |
| Stimulus source | Development/DevOps team. |
| Environment | Production with active users and POS transactions. |
| Artifact | Dockerized services, load balancer, health checks, PostgreSQL migrations, Redis workers. |
| Response | Use rolling deployments for stateless API nodes. Apply backward-compatible database migrations. Monitor health checks and metrics during deployment. Roll back automatically on failure. |
| Response measure | No planned downtime for minor releases. Rolling update completes within 30 minutes. Rollback completes within 10 minutes if required. |

## 2.6 Availability and Reliability

### 2.6.1 Fault Tolerance and System Recovery

| Element | API server, PostgreSQL, Redis, WebSocket service, background workers, monitoring. |
| --- | --- |
| Statement | The system must detect failures, recover quickly, and maintain availability for core store operations. |
| Stimulus | API instance, database node, Redis node, WebSocket connection, or background worker fails. |
| Stimulus source | Hardware failure, software bug, network event, overload, or third-party outage. |
| Environment | Production runtime. |
| Artifact | API cluster, PostgreSQL replication/failover, Redis cluster, /health and /metrics endpoints, backup and DR process. |
| Response | Expose health and metrics endpoints. Use database replication and failover. Run scheduled backups and recovery tests. Use circuit breakers to isolate failures. Alert administrators on degradation. |
| Response measure | Production uptime target 99.99%. MTTR < 30 minutes. RPO < 1 hour and RTO < 4 hours. Critical degradation events trigger monitoring alerts. |

### 2.6.2 Low-Stock Notification and Background Job Reliability

| Element | Low-stock monitoring, notification service, job queue, audit logs. |
| --- | --- |
| Statement | Inventory alerts and background jobs must be delivered reliably or retried with traceability. |
| Stimulus | Inventory falls below threshold or a notification job fails. |
| Stimulus source | Inventory service, system scheduler, notification provider. |
| Environment | Normal inventory operation and failure/retry conditions. |
| Artifact | Inventory module, alert rule module, notification service, Redis job queue, audit log. |
| Response | Monitor active inventory against thresholds. Generate low-stock events. Send notifications to inventory staff. Retry failed notifications up to configured limits and log persistent failures. |
| Response measure | Low-stock alerts are generated when inventory <= threshold. Failed notification attempts are retried and logged. Persistent failures trigger audit/alert records. |

## 2.7 Data Integrity and Consistency

### 2.7.1 Transactional Consistency for POS, Inventory, Loyalty, Transfers

| Element | POS, inventory, loyalty, transfer, pricing rollback, and audit modules. |
| --- | --- |
| Statement | Operations that modify multiple business entities must remain consistent and recoverable. |
| Stimulus | A checkout completes, loyalty points are earned/redeemed, stock is adjusted, transfer is approved, or price rollback is executed. |
| Stimulus source | Cashier, Inventory Staff, Store Manager, District Manager, Admin, System. |
| Environment | Concurrent operation across stores and terminals. |
| Artifact | PostgreSQL transactions, service layer, repositories, audit logs, Redis locks where needed. |
| Response | Wrap multi-entity operations in database transactions. Validate stock and loyalty balances before commit. Use idempotency keys for repeatable actions. Record immutable audit entries for sensitive state changes. |
| Response measure | No negative stock or loyalty balance caused by valid operations. Transfer approval either moves all stock or none. Price rollback records old/new values and syncs POS updates. |

### 2.7.2 Reporting and Analytics Data Accuracy

| Element | Store reports, chain reports, real-time analytics, export service. |
| --- | --- |
| Statement | Reports and analytics must reflect authorized, accurate, and consistent business data. |
| Stimulus | Users generate store/chain reports, view analytics, or export report files. |
| Stimulus source | Store Manager, District Manager, Admin. |
| Environment | Normal operation and management reporting periods. |
| Artifact | Report service, analytics service, transaction/inventory repositories, export module, WebSocket analytics feed. |
| Response | Scope reports by role and store/region. Aggregate data through controlled report services. Use consistent date ranges and filters. Warn users when synchronization is incomplete. Save generated report metadata for traceability. |
| Response measure | Unauthorized users cannot access report data. Report generation errors are surfaced clearly. Exported files match selected filters and formats PDF/XLSX/CSV. |

# 3. Architectural Representation

The Store Chain Management System is described through four complementary views, adapted from the ADD template and revised to align with the ASR modules.

## 3.1 Logical View

The logical view decomposes the system into domain modules aligned with business capabilities:

• Auth, Users, Roles and Permissions - authentication, authorization, RBAC, sessions, and user administration.

• Stores and Dashboard - store creation/update, store scope, dashboard KPIs, and multi-store visibility.

• POS and Transactions - checkout, payment recording, loyalty member linking, shift closing, and transaction history.

• Loyalty Program - points calculation, redemption, tier evaluation, and loyalty history.

• Promotions and Dynamic Pricing - promotion management, promotion application, pricing rules, price execution, A/B testing, history, and rollback.

• Products, Inventory and Transfers - product catalog, stock adjustment, inter-store transfer requests, approvals, low-stock thresholds, and notifications.

• Reports and Analytics - store reports, chain reports, real-time analytics, report export, and analytics aggregation.

• Complaints and Governance - complaint submission/handling, audit logs, settings, and system monitoring.

• Shared Infrastructure - validation utilities, security middleware, cache, job queues, WebSocket channels, and observability components.

## 3.2 Implementation View

• Backend: Node.js and ExpressJS organized by domain modules. Each module contains routes/controllers, services, repositories, validation, and tests.

• Frontend: ReactJS with role-based layouts and service clients consuming RESTful APIs.

• Database: PostgreSQL stores transactional and operational data. Schema migrations must be backward-compatible for rolling deployment.

• Cache and Messaging: Redis supports catalog cache, session/ephemeral data, job queues, Pub/Sub, dashboard updates, and POS price synchronization.

• Real-time: WebSocket is used where required for dashboard updates, price feeds, and selected notifications.

• Deployment: Docker is used for local and production packaging. CI/CD runs tests, dependency checks, and build validation.

• Documentation: APIs are documented consistently and versioned under RESTful conventions.

## 3.3 Deployment View

• Local development: React frontend, Express backend, PostgreSQL, and Redis can be provisioned through Docker Compose.

• Production: Stateless API instances run behind a load balancer and can scale horizontally.

• Database: PostgreSQL primary with read replicas and failover support for reliability and reporting workloads.

• Cache/Queue: Redis cluster is used for cache, job processing, Pub/Sub, and session-related ephemeral data.

• Security perimeter: HTTPS/TLS termination, WAF/DDoS protection, rate limiting, and secure secret management are applied to public endpoints.

• Observability: Health checks, metrics, centralized logs, dashboards, alerts, and backup monitoring are enabled.

• Recovery: Automated backups, replication, failover procedures, and disaster recovery runbooks support the 99.99% availability target.

## 3.4 Data View

• Identity and access entities: users, roles, permissions, sessions, login attempts.

• Store entities: stores, store assignments, dashboards, settings.

• Catalog and inventory entities: products, categories, SKUs, prices, price history, inventory, stock movements, alert thresholds.

• Transaction entities: POS transactions, transaction items, payments, receipts, shifts, transaction history.

• Loyalty entities: loyalty members, points ledger, redemption history, tier history, loyalty policies.

• Promotion and pricing entities: promotions, promotion rules, pricing rules, pricing experiments, rollback history.

• Transfer entities: inter-store transfer requests, transfer items, approvals, rejection notes.

• Reporting entities: generated reports, report metadata, export files, analytics snapshots.

• Complaint and governance entities: complaints, complaint status history, audit logs, system settings.

• Data protection: PII and sensitive data are encrypted at rest, all API traffic uses HTTPS/TLS, and database access is restricted by role.

# 4. ASR Traceability Matrix

The following matrix summarizes how the revised ADD covers the corrected ASR workbook.

| ASR No. | Module | Function | ADD Coverage |
| --- | --- | --- | --- |
| 1 | Authentication & Access | UC01 - Login | Security 2.1 |
| 1 | Authentication & Access | UC02 - Manage Users | Security 2.1 |
| 1 | Authentication & Access | UC03 - Configure Roles and Permissions | Security 2.1 |
| 2 | Store Management & Dashboard | UC04 - Create or Update Store | Logical/Implementation View 3.1-3.4 |
| 2 | Store Management & Dashboard | UC05 - View Store Dashboard | Performance 2.2 / Reporting 2.7.2 |
| 3 | POS Operations | UC06 - Create POS Transaction | Data Integrity 2.7 |
| 3 | POS Operations | UC07 - Apply Loyalty Member | Data Integrity 2.7; Modifiability 2.5 |
| 3 | POS Operations | UC16 - Close Shift | Data Integrity 2.7 |
| 3 | POS Operations | UC17 - View Transaction History | Data Integrity 2.7 |
| 4 | Loyalty Program | UC08 - Calculate Loyalty Points | Data Integrity 2.7; Modifiability 2.5 |
| 4 | Loyalty Program | UC09 - Redeem Loyalty Points | Data Integrity 2.7; Modifiability 2.5 |
| 4 | Loyalty Program | UC10 - Upgrade Loyalty Tier | Data Integrity 2.7; Modifiability 2.5 |
| 5 | Promotion Management | UC11 - Manage Promotion | Modifiability 2.5 |
| 5 | Promotion Management | UC12 - Apply Promotion to Transaction | Data Integrity 2.7; Modifiability 2.5 |
| 6 | Dynamic Pricing | UC13 - Create Pricing Rule | Performance 2.2 / Reporting 2.7.2; Modifiability 2.5 |
| 6 | Dynamic Pricing | UC14 - Execute Dynamic Pricing | Performance 2.2 / Reporting 2.7.2; Modifiability 2.5 |
| 6 | Dynamic Pricing | UC15 - View Price History | Logical/Implementation View 3.1-3.4 |
| 6 | Dynamic Pricing | UC29 - A/B Test Pricing | Performance 2.2 / Reporting 2.7.2; Modifiability 2.5 |
| 6 | Dynamic Pricing | UC30 - Rollback Price Change | Data Integrity 2.7 |
| 7 | Inventory & Transfer Management | UC18 - Manage Product Catalog | Performance 2.2 / Reporting 2.7.2 |
| 7 | Inventory & Transfer Management | UC19 - Update Inventory Stock Level | Data Integrity 2.7 |
| 7 | Inventory & Transfer Management | UC20 - Create Inter-store Transfer | Data Integrity 2.7 |
| 7 | Inventory & Transfer Management | UC21 - Approve Transfer | Data Integrity 2.7 |
| 7 | Inventory & Transfer Management | UC25 - Set Low-stock Alert Threshold | Modifiability 2.5 |
| 7 | Inventory & Transfer Management | UC26 - Receive Low-stock Notification | Availability 2.6 |
| 8 | Reporting & Analytics | UC22 - Generate Store Report | Performance 2.2 / Reporting 2.7.2 |
| 8 | Reporting & Analytics | UC23 - Generate Chain Report | Performance 2.2 / Reporting 2.7.2 |
| 8 | Reporting & Analytics | UC24 - View Real-time Analytics | Performance 2.2 / Reporting 2.7.2 |
| 8 | Reporting & Analytics | UC28 - Export Report | Performance 2.2 / Reporting 2.7.2 |
| 9 | Complaint Management | UC27 - Manage Complaints | Modifiability 2.5 |
| 10 | Non-Functional Architecture | Security Architecture | Security 2.1 |
| 10 | Non-Functional Architecture | Performance Architecture | Logical/Implementation View 3.1-3.4 |
| 10 | Non-Functional Architecture | Availability & Reliability Architecture | Availability 2.6 |
| 10 | Non-Functional Architecture | Implementation Architecture | Logical/Implementation View 3.1-3.4 |
