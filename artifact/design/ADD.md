Dưới đây là ADD được tái cấu trúc lại từ tập ASR của hệ thống Store Chain Management System theo đúng template bạn cung cấp. 

# Attribute-Driven Design Document (ADD)

**Project:** Store Chain Management System
**Prepared by:** Architecture Team
**Date:** 2026-05-16

---

# Table of Contents

1. Design Constraints
2. Quality Attribute Requirements
3. Architectural Representation

---

# 1. Design Constraints

* Backend: Node.js 20+, Express, TypeScript.
* Frontend: React + Vite.
* Database: PostgreSQL with replication and automated failover.
* ORM: Prisma ORM.
* Cache Layer: Redis Cluster for distributed caching.
* Messaging: Kafka or RabbitMQ for event-driven communication.
* Authentication: JWT + RBAC authorization.
* API Style: REST API under `/api/v1`.
* Real-time Communication: WebSocket / Socket.IO.
* Deployment: Docker + Kubernetes.
* Monitoring: Prometheus, Grafana, OpenTelemetry.
* Security: WAF, rate limiting, DDoS protection.
* Availability Target: 99.99% SLA.
* Pricing Latency Target: <100ms.
* Synchronization Model: Event-driven eventual consistency.
* Architecture Style: Domain-Driven Design + Clean Architecture.

---

# 2. Quality Attribute Requirements

# 2.1 Availability

## 2.1.1 High Availability Infrastructure

**Element:** Core platform infrastructure.

**Statement:** The system must maintain 99.99% uptime for all critical business operations.

**Stimulus:** Infrastructure node failure, database outage, or service crash.

**Stimulus Source:** Runtime infrastructure events.

**Environment:** Production multi-store deployment.

**Artifact:** API services, PostgreSQL cluster, Redis cluster, Kubernetes infrastructure.

**Response:** Failed instances are automatically replaced; traffic is rerouted; failover database becomes primary automatically.

**Response Measure:** System availability ≥ 99.99%; failover recovery within RTO target.

---

## 2.1.2 POS Operation During Network Disruption

**Element:** POS transaction subsystem.

**Statement:** POS terminals must continue operating during temporary network outages.

**Stimulus:** Connection loss to central services.

**Stimulus Source:** Network instability or infrastructure disruption.

**Environment:** Store checkout operation.

**Artifact:** POS module, local transaction queue, synchronization service.

**Response:** Transactions are stored locally and synchronized asynchronously after reconnection.

**Response Measure:** No transaction loss during temporary disconnection.

---

# 2.2 Performance

## 2.2.1 Dynamic Pricing Low Latency

**Element:** Pricing engine and pricing APIs.

**Statement:** Dynamic pricing calculations must respond within 100ms.

**Stimulus:** POS requests item pricing during checkout.

**Stimulus Source:** Cashiers and POS systems.

**Environment:** Peak operational load.

**Artifact:** Pricing service, Redis cache, pricing rule engine.

**Response:** Frequently accessed prices are cached; pricing calculations use precomputed rule evaluation.

**Response Measure:** 95% pricing lookups under 100ms.

---

## 2.2.2 Real-time Dashboard Analytics

**Element:** Analytics and reporting subsystem.

**Statement:** Operational dashboards must display near real-time metrics across all stores.

**Stimulus:** Store transactions and inventory updates.

**Stimulus Source:** POS systems and inventory services.

**Environment:** Multi-store concurrent operations.

**Artifact:** Analytics pipeline, reporting service, event stream processor.

**Response:** Events are streamed and aggregated continuously.

**Response Measure:** Dashboard data freshness below 30 seconds.

---

## 2.2.3 Concurrent Multi-store Scalability

**Element:** API services and backend infrastructure.

**Statement:** The platform must support concurrent operations for 100+ stores.

**Stimulus:** Simultaneous POS transactions and inventory operations.

**Stimulus Source:** Cashiers, managers, inventory staff.

**Environment:** Peak business hours.

**Artifact:** Stateless APIs, Redis cluster, message broker, PostgreSQL.

**Response:** Services scale horizontally; cache reduces database contention.

**Response Measure:** Error rate below 1% during peak load.

---

# 2.3 Security

## 2.3.1 Role-Based Access Control

**Element:** Authentication and authorization middleware.

**Statement:** The system must enforce RBAC and store-scoped authorization.

**Stimulus:** User attempts access to protected resources.

**Stimulus Source:** Admins, managers, employees, customers.

**Environment:** Normal system operation.

**Artifact:** JWT middleware, authorization policies, API gateway.

**Response:** Unauthorized requests are rejected; role and store permissions validated.

**Response Measure:** 100% protected endpoints require valid authorization.

---

## 2.3.2 Audit Logging for Critical Operations

**Element:** Audit and compliance subsystem.

**Statement:** All sensitive business operations must be recorded in immutable audit logs.

**Stimulus:** Price changes, inventory updates, user management actions.

**Stimulus Source:** System users and automated services.

**Environment:** Runtime operations.

**Artifact:** Audit service, event log storage.

**Response:** Operations are recorded with timestamp, actor, and affected entity.

**Response Measure:** 100% critical operations logged successfully.

---

## 2.3.3 Customer Data Protection

**Element:** Customer loyalty and account data.

**Statement:** Sensitive customer data must be protected in storage and transmission.

**Stimulus:** Customer registration, login, and transaction processing.

**Stimulus Source:** Loyalty members and APIs.

**Environment:** Normal operation and backups.

**Artifact:** PostgreSQL, Redis, API communication.

**Response:** TLS enforced; sensitive fields encrypted; passwords hashed.

**Response Measure:** 100% encrypted API traffic in production.

---

## 2.3.4 DDoS and Threat Protection

**Element:** Edge network infrastructure.

**Statement:** The platform must protect services against malicious traffic and DDoS attacks.

**Stimulus:** Abnormal request spikes or attack traffic.

**Stimulus Source:** External malicious actors.

**Environment:** Public internet exposure.

**Artifact:** WAF, API Gateway, CDN edge services.

**Response:** Suspicious traffic blocked or rate-limited automatically.

**Response Measure:** No critical service outage caused by malicious traffic.

---

# 2.4 Scalability

## 2.4.1 Real-time Inventory Synchronization

**Element:** Inventory synchronization architecture.

**Statement:** Inventory changes must synchronize across stores in near real-time.

**Stimulus:** Inventory updates, transfers, sales transactions.

**Stimulus Source:** POS systems and inventory staff.

**Environment:** Multi-store operations.

**Artifact:** Inventory service, message broker, WebSocket gateway.

**Response:** Inventory events published asynchronously and pushed to subscribers.

**Response Measure:** Synchronization delay below 5 seconds.

---

## 2.4.2 Pricing Engine Batch Scalability

**Element:** Dynamic pricing scheduler.

**Statement:** Pricing recalculation jobs must scale across large product catalogs.

**Stimulus:** Scheduled pricing recalculation every 15 minutes.

**Stimulus Source:** Automated scheduler.

**Environment:** Peak catalog size and concurrent load.

**Artifact:** Pricing workers, distributed task queue, Redis cache.

**Response:** Pricing jobs distributed across worker nodes.

**Response Measure:** Complete pricing recalculation cycle within scheduling window.

---

# 2.5 Reliability

## 2.5.1 Database Failover Reliability

**Element:** PostgreSQL infrastructure.

**Statement:** Database services must recover automatically from primary node failure.

**Stimulus:** Primary database outage.

**Stimulus Source:** Infrastructure failure.

**Environment:** Production deployment.

**Artifact:** PostgreSQL replication cluster.

**Response:** Replica promoted automatically to primary.

**Response Measure:** Recovery within defined RTO.

---

## 2.5.2 Disaster Recovery

**Element:** Backup and recovery infrastructure.

**Statement:** The system must support disaster recovery and backup restoration.

**Stimulus:** Catastrophic infrastructure failure.

**Stimulus Source:** Infrastructure incidents.

**Environment:** Disaster recovery scenarios.

**Artifact:** Backup storage, infrastructure automation.

**Response:** Restore services from backup and re-establish operations.

**Response Measure:** Recovery meets RPO and RTO targets.

---

# 2.6 Modifiability

## 2.6.1 Extensible Pricing Rules

**Element:** Pricing rule engine.

**Statement:** New pricing strategies must be introduced with minimal impact to existing modules.

**Stimulus:** Business introduces new pricing rules.

**Stimulus Source:** Product management and business stakeholders.

**Environment:** Maintenance and future enhancements.

**Artifact:** Pricing engine, rule evaluation modules.

**Response:** New pricing strategies added via modular rule handlers.

**Response Measure:** Minor pricing rule changes completed within one sprint.

---

## 2.6.2 Domain-driven Module Isolation

**Element:** System module structure.

**Statement:** Business domains must remain loosely coupled.

**Stimulus:** Feature additions or domain modifications.

**Stimulus Source:** Development team.

**Environment:** Development lifecycle.

**Artifact:** Domain modules and shared services.

**Response:** Changes isolated within bounded contexts.

**Response Measure:** Cross-domain breaking changes minimized.

---

# 2.7 Observability

## 2.7.1 Distributed Tracing

**Element:** Observability infrastructure.

**Statement:** Cross-service requests must be traceable end-to-end.

**Stimulus:** System troubleshooting or performance investigation.

**Stimulus Source:** Operations and DevOps teams.

**Environment:** Runtime production environment.

**Artifact:** OpenTelemetry, Jaeger, API services.

**Response:** Trace IDs propagated across services and logs.

**Response Measure:** 100% critical requests traceable.

---

## 2.7.2 Centralized Monitoring and Alerting

**Element:** Monitoring subsystem.

**Statement:** Operational metrics and alerts must be centralized.

**Stimulus:** Service degradation or infrastructure anomaly.

**Stimulus Source:** Monitoring systems.

**Environment:** Production runtime.

**Artifact:** Prometheus, Grafana, alerting services.

**Response:** Metrics collected continuously; alerts triggered automatically.

**Response Measure:** Critical alerts generated within 1 minute.

---

# 3. Architectural Representation

# 3.1 Logical View

The system is organized into bounded contexts aligned with business capabilities:

* Identity & Access Management
* Store Management
* Product Catalog
* Inventory Management
* Pricing Engine
* POS & Transactions
* Loyalty & Promotions
* Reporting & Analytics
* Audit & Compliance
* Notification & Monitoring

Shared platform services include:

* Event Bus
* Distributed Cache
* Observability Stack
* API Gateway
* Security Middleware

---

# 3.2 Implementation View

* Backend implemented using TypeScript and Express.
* Modular architecture following DDD and Clean Architecture principles.
* Services communicate via REST and asynchronous events.
* Prisma schema acts as centralized data model definition.
* Shared infrastructure libraries:

  * logging
  * monitoring
  * security
  * event publishing
  * caching

---

# 3.3 Deployment View

## Production Topology

* Kubernetes cluster with multiple API replicas.
* PostgreSQL replication cluster with failover.
* Redis Cluster for distributed caching.
* Kafka/RabbitMQ for event streaming.
* API Gateway and WAF at edge layer.
* Prometheus + Grafana monitoring stack.
* OpenTelemetry + Jaeger tracing infrastructure.

## Runtime Characteristics

* Horizontal scaling enabled for stateless services.
* Rolling deployments supported.
* Zero single point of failure for critical services.

---

# 3.4 Data View

## Core Business Entities

* Stores
* Users
* Roles
* Products
* Categories
* Inventory
* Transactions
* Loyalty Members
* Promotions
* Pricing Rules

## Operational Data

* Inventory Movements
* Transfers
* Shift Records
* Audit Logs
* Analytics Events

## Data Characteristics

* Transactional consistency for POS and inventory operations.
* Eventual consistency for cross-store synchronization.
* Immutable audit records for compliance.
* Partitioned historical transaction storage for scalability.
