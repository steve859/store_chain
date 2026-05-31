

# Architecturally Significant Requirements (ASRs)

# 1. Availability ASRs

## ASR-A1 — High Availability 99.99%

### Requirement

Hệ thống phải đảm bảo SLA uptime 99.99% cho toàn bộ platform multi-store. 

### Architectural Impact

* Multi-instance deployment
* Load balancing
* Failover database
* Distributed cache
* Health checks
* Zero single point of failure

### Possible Architectural Decisions

* Kubernetes / ECS
* PostgreSQL replication + failover
* Redis Cluster
* Active-active services
* API Gateway redundancy

---

## ASR-A2 — POS Must Continue Operating During Partial Network Failure

### Requirement

POS transaction processing phải hoạt động ổn định ngay cả khi mất kết nối tạm thời với central system.

### Source

Derived from:

* Real-time sync across stores
* Async central synchronization flow 

### Architectural Impact

* Offline-first POS design
* Local transaction queue
* Eventual consistency
* Retry/reconciliation mechanisms

### Architectural Decisions

* Local embedded DB/cache
* Event sourcing/outbox pattern
* Sync service

---

# 2. Scalability ASRs

## ASR-S1 — Support 100+ Stores Concurrently ok

### Requirement

System phải hỗ trợ centralized management cho hơn 100 stores đồng thời. 


### Architectural Impact

* Horizontal scalability
* Multi-tenant-like store partitioning
* Distributed architecture

### Architectural Decisions

* Microservices/modular monolith
* Stateless APIs
* Distributed cache
* Read replicas

---

## ASR-S2 — Real-time Inventory Synchronization Across Stores ok

### Requirement

Inventory updates phải synchronize near real-time giữa các store. 

### Architectural Impact

* Event-driven architecture
* Messaging system
* Concurrency handling

### Architectural Decisions

* Kafka/RabbitMQ
* Event bus
* CDC/event streaming
* WebSocket push

---

## ASR-S3 — Dynamic Pricing Engine Must Scale ok

### Requirement

Pricing engine recalculates prices every 15 minutes for potentially thousands of products. 

### Architectural Impact

* Batch processing
* Distributed computation
* Rule engine optimization

### Architectural Decisions

* Background workers
* Scheduler service
* Distributed task queue
* Rule caching

---

# 3. Performance ASRs

## ASR-P1 — Dynamic Price Lookup <100ms ok

### Requirement

Dynamic pricing API phải đảm bảo latency dưới 100ms. 

### Architectural Impact

* Aggressive caching strategy
* Precomputed pricing
* Fast lookup architecture

### Architectural Decisions

* Redis cache
* In-memory pricing engine
* CQRS read optimization
* Materialized views

---

## ASR-P2 — Real-time Dashboard Analytics ok 

### Requirement

Dashboard phải hiển thị KPI và analytics theo thời gian thực. 

### Architectural Impact

* Streaming analytics
* Read optimization
* Data aggregation pipeline

### Architectural Decisions

* OLAP/warehouse
* Event streaming
* Time-series storage
* CQRS

---

## ASR-P3 — POS Transactions Must Have Low Latency

### Requirement

Checkout flow phải phản hồi nhanh để tránh ảnh hưởng customer experience.

### Derived From

POS transaction flow includes:

* loyalty
* promotions
* pricing
* payment
* inventory update


### Architectural Impact

* Minimize synchronous dependencies
* Async non-critical operations

### Architectural Decisions

* Async event publishing
* Saga pattern
* Cached promotion rules

---

# 4. Security ASRs

## ASR-SEC1 — Role-Based Access Control (RBAC)

### Requirement

Hệ thống phải enforce RBAC theo security matrix. 

### Architectural Impact

* Authorization middleware
* Claims-based security
* Fine-grained permission model

### Architectural Decisions

* JWT + RBAC
* Policy-based authorization
* API gateway auth

---

## ASR-SEC2 — Secure Authentication

### Requirement

Authentication sử dụng JWT và có thể hỗ trợ SSO.  

### Architectural Impact

* Central identity provider
* Token lifecycle management

### Architectural Decisions

* OAuth2/OpenID Connect
* Identity Server/Keycloak/Auth0

---

## ASR-SEC3 — Auditability of Critical Operations

### Requirement

All pricing changes, inventory movements, and sensitive actions phải được audit. 

### Architectural Impact

* Immutable audit logging
* Compliance storage

### Architectural Decisions

* Audit service
* Event sourcing
* Centralized logging

---

## ASR-SEC4 — WAF and DDoS Protection

### Requirement

System phải có protection layer chống DDoS và malicious traffic. 

### Architectural Impact

* Edge security architecture

### Architectural Decisions

* Cloudflare/AWS Shield
* API rate limiting
* CDN edge filtering

---

## ASR-SEC5 — Loyalty Data Privacy Compliance

### Requirement

Customer loyalty data phải đáp ứng privacy compliance requirements. 

### Architectural Impact

* Encryption
* Data masking
* Retention policy

### Architectural Decisions

* PII encryption
* Secret management
* Consent tracking

---

# 5. Reliability ASRs

## ASR-R1 — Automatic Database Failover

### Requirement

Database replication và automated failover là bắt buộc. 

### Architectural Impact

* HA database topology
* Replication monitoring

### Architectural Decisions

* PostgreSQL streaming replication
* Patroni
* Managed DB cluster

---

## ASR-R2 — Disaster Recovery Capability

### Requirement

System cần automated DR procedures và DR runbook.  

### Architectural Impact

* Backup strategy
* Multi-region recovery
* Infrastructure as Code

### Architectural Decisions

* Automated backups
* Cross-region replication
* Terraform

---

## ASR-R3 — Inventory Consistency Across Stores

### Requirement

Inventory synchronization phải tránh stock inconsistency.

### Architectural Impact

* Distributed consistency model
* Idempotent processing

### Architectural Decisions

* Event versioning
* Optimistic locking
* Transactional messaging

---

# 6. Maintainability ASRs

## ASR-M1 — Modular Domain-Based Architecture

### Requirement

System domain rất lớn:

* POS
* Loyalty
* Pricing
* Inventory
* Promotions
* Reporting



### Architectural Impact

* Clear bounded contexts
* Loose coupling

### Architectural Decisions

* DDD
* Modular monolith or microservices
* Clean Architecture

---

## ASR-M2 — Extensible Pricing Rule Engine

### Requirement

Pricing rules cần support:

* demand-based
* competitor-based
* time-based
* A/B testing


### Architectural Impact

* Rules engine abstraction
* Strategy pattern

### Architectural Decisions

* DSL/rule engine
* Plugin-based rules

---

## ASR-M3 — Observability & Distributed Tracing

### Requirement

System cần centralized monitoring và tracing.  

### Architectural Impact

* Telemetry everywhere
* Trace propagation

### Architectural Decisions

* OpenTelemetry
* Jaeger
* ELK/Grafana stack

---

# 7. Integration ASRs

## ASR-I1 — Real-time POS Synchronization

### Requirement

POS terminals phải nhận pricing/inventory updates real-time. 

### Architectural Impact

* Bidirectional communication

### Architectural Decisions

* WebSocket/SSE
* Pub/Sub architecture

---

## ASR-I2 — External Competitor Pricing Feed Integration

### Requirement

Dynamic pricing phụ thuộc competitor pricing feeds. 

### Architectural Impact

* External API integration
* Data normalization

### Architectural Decisions

* Integration service
* Retry/circuit breaker
* ETL pipeline

---

## ASR-I3 — Future Supplier Integration API

### Requirement

Future supplier integration cần API exposure. 

### Architectural Impact

* Public API management
* API versioning

### Architectural Decisions

* API Gateway
* OpenAPI standards

---

# 8. Data Management ASRs

## ASR-D1 — High-volume Transaction Storage

### Requirement

System phải lưu transaction history của toàn chain. 

### Architectural Impact

* Large-scale relational storage
* Archival strategy

### Architectural Decisions

* Partitioned tables
* Data archival
* Read replicas

---

## ASR-D2 — Immutable Price History

### Requirement

Price history phải có audit trail và rollback capability. 

### Architectural Impact

* Versioned data model

### Architectural Decisions

* Append-only history table
* Temporal tables

---

# 9. Deployment & Operations ASRs

## ASR-O1 — Centralized Monitoring & Alerting

### Requirement

System cần centralized monitoring across all stores. 

### Architectural Impact

* Central observability platform

### Architectural Decisions

* Prometheus + Grafana
* Centralized log aggregation

---

## ASR-O2 — Automated Deployment & Recovery

### Requirement

Enterprise-grade operations yêu cầu automated deployment và rollback.

### Architectural Impact

* CI/CD
* Blue-green deployment

### Architectural Decisions

* GitOps
* Infrastructure as Code

---

# 10. Key Architectural Drivers (Microsoft Style Summary)

Đây là các “architecture drivers” quan trọng nhất của hệ thống:

| Driver                    | Why Critical                     |
| ------------------------- | -------------------------------- |
| High Availability         | 99.99% SLA cho retail operations |
| Real-time Synchronization | Inventory + pricing consistency  |
| Low Latency               | POS experience & pricing lookup  |
| Scalability               | 100+ stores                      |
| Security & RBAC           | Enterprise operations            |
| Auditability              | Pricing + finance compliance     |
| Distributed Operations    | Multi-store architecture         |
| Extensibility             | Future phases & integrations     |
| Observability             | Enterprise troubleshooting       |
| Reliability               | Failover & disaster recovery     |

---

# Theo Microsoft, đây là các ASR có mức ảnh hưởng kiến trúc cao nhất

Nếu phải chọn “Top ASRs” ảnh hưởng mạnh nhất tới kiến trúc:

1. 99.99% High Availability
2. Dynamic pricing latency <100ms
3. Real-time inventory synchronization
4. 100+ store scalability
5. Offline-capable POS
6. RBAC + JWT security
7. Audit logging for critical operations
8. Automated failover & DR
9. Event-driven synchronization
10. Distributed observability

---

# Kiến trúc được gợi ý từ ASR này

Từ tập ASR trên, kiến trúc phù hợp nhất sẽ thiên về:

* DDD + Clean Architecture
* Modular Monolith hoặc Microservices
* Event-Driven Architecture
* CQRS cho analytics/pricing
* Redis distributed cache
* PostgreSQL HA cluster
* WebSocket real-time sync
* Message Broker (Kafka/RabbitMQ)
* Centralized Observability Stack
* Cloud-native deployment (K8s)
