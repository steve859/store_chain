# Business Requirements Document (BRD)

## Store Chain Management System - Professional Mini-Supermarket Platform

---

## Revision History

| Date       | Version | Author | Change Description                          |
| ---------- | ------- | ------ | ------------------------------------------- |
| 2026-01-15 | 1.0     | Quan   | Initial BRD creation - Phase 1-2.2 complete |
| 2026-01-16 | 1.1     | Quan   | Added Phase 3 roadmap and domain model      |
| 2026-01-17 | 1.2     | Quan   | Structured according to formal BRD template |

## Approval

| Date       | Version | Approver Name | Position          |
| ---------- | ------- | ------------- | ----------------- |
| 2026-01-17 | 1.2     | TBD           | Application Owner |
| 2026-01-17 | 1.2     | TBD           | ITPM              |

---

## Table of Contents

1. Objective and Scope
2. Business Requirement
   - 2.1 Application Overview
   - 2.2 Domain Model
   - 2.3 Workflow
   - 2.4 Use Cases and Actors
   - 2.5 Security Matrix
   - 2.6 User Story
   - 2.7 Change Requirement
3. Appendix
   - 3.1 Glossary
   - 3.2 Open Issues

---

## 1. Objective and Scope

This document describes the business requirements for the **Store Chain Management System**, an enterprise-grade mini-supermarket chain management platform designed to transform a basic grocery store system into a scalable, multi-store operations platform comparable to Circle K.

The system enables centralized management of 100+ retail stores with unified Point-of-Sale (POS), inventory tracking, dynamic pricing, loyalty programs, and real-time reporting. The platform supports real-time synchronization across all locations, maintains 99.99% uptime SLA, and provides operational insights to drive revenue optimization and efficiency.

### Document Purpose

This BRD documents the complete functional and non-functional requirements to guide:

- Architecture and technical design decisions
- Feature development across three implementation phases
- Testing and quality assurance strategies
- Deployment and operational readiness

### System Context

The existing system manages basic product catalog, inventory, and sales for a single/small store. This upgrade transforms it into:

- **Multi-store operations platform** with centralized control
- **Revenue optimization engine** with dynamic pricing and loyalty
- **Enterprise infrastructure** with high availability and scalability
- **Real-time analytics** for business intelligence

---

## 2. Business Requirement

### 2.1 Application Overview

#### Product Description

The **Store Chain Management System** is a web-based platform for managing multi-store retail operations. It provides:

1. **Centralized Store Management**: Monitor and control 100+ store locations from a single dashboard
2. **Unified POS System**: Transaction processing, shift management, and payment integration
3. **Real-time Inventory Sync**: Stock levels synchronized across all stores with low-stock alerts
4. **Dynamic Pricing Engine**: Rules-based pricing adjustments based on demand, competition, time-of-day
5. **Loyalty Program**: Tiered member rewards (Standard/Silver/Gold) with point redemption
6. **Multi-level Promotions**: Store-specific and chain-wide campaigns with A/B testing
7. **Advanced Analytics**: Business intelligence dashboards with KPI tracking and predictive insights
8. **Role-based Access Control**: Admin, Store Manager, Cashier, Inventory Staff, District Manager roles

#### Target Users

| User Role                     | Primary Responsibilities                                   | Access Level             |
| ----------------------------- | ---------------------------------------------------------- | ------------------------ |
| **Admin**                     | System configuration, user management, chain-wide policies | Full system access       |
| **District Manager**          | Multi-store oversight, performance monitoring, compliance  | Multi-store read/execute |
| **Store Manager**             | Store operations, staff management, local promotions       | Single store admin       |
| **Cashier**                   | POS transactions, customer service, shift management       | Transaction processing   |
| **Inventory Staff**           | Stock management, transfers, receiving, reconciliation     | Inventory operations     |
| **Customer (Loyalty Member)** | Loyalty enrollment, purchase history, reward tracking      | Limited read access      |

#### Core Features (Implemented & Roadmap)

**Phase 1 - Foundation (✅ Complete)**

- Product management with categories, brands, pricing tiers
- Inventory tracking with movement history
- Multi-store setup with organizational hierarchy
- User authentication (JWT) and role-based access
- Basic dashboards and reporting

**Phase 2 - Revenue Optimization (✅ Complete)**

- Loyalty program with tiered rewards
- Points earn/redeem mechanics
- Targeted promotions and seasonal campaigns
- POS integration with shift management
- Campaign performance tracking

**Phase 2.2 - Dynamic Pricing (✅ Complete)**

- Rules-based pricing engine (demand, competitor, time-based)
- Real-time price calculation with <100ms latency guarantee
- A/B testing framework for pricing strategies
- Price history audit trail with rollback capability
- Mobile API for in-store price lookups

**Phase 3 - Operations Excellence (✅ Complete)**

- High-availability infrastructure (99.99% SLA)
- Redis clustering and distributed caching
- PostgreSQL replication with automated failover
- Distributed tracing and observability stack
- Advanced security (WAF, DDoS protection, rate limiting)
- Business intelligence with predictive analytics
- Automated disaster recovery procedures
- Centralized monitoring and alerting

---

### 2.2 Domain Model

#### 2.2.1 Domain Objects Description

| #   | Object Name            | Definition                                 | Relationships                                                                 |
| --- | ---------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | **Store**              | A physical retail location in the chain    | Contains: Inventory, Staff, POS terminals, Promotions                         |
| 2   | **Product**            | Individual SKU in the catalog              | Belongs to: Category, Brand; Has: Pricing, Inventory                          |
| 3   | **Category**           | Product grouping (e.g., Beverages, Snacks) | Contains: Products; May have: Subcategories                                   |
| 4   | **Brand**              | Manufacturer/supplier brand                | Contains: Products                                                            |
| 5   | **Inventory**          | Stock tracking per store                   | Tracks: Product quantities, movements, transfers                              |
| 6   | **Price**              | Dynamic price record                       | References: Product, Store; Has: Rules, history                               |
| 7   | **PricingRule**        | Rule definition for dynamic pricing        | Applies to: Products/Categories; Has: Condition, Effect                       |
| 8   | **Transaction (Sale)** | POS transaction record                     | Contains: LineItems; References: Store, Cashier                               |
| 9   | **LineItem**           | Individual line in a transaction           | References: Product, Price, Quantity                                          |
| 10  | **LoyaltyMember**      | Customer enrolled in loyalty program       | Has: Points, Tier, RedemptionHistory                                          |
| 11  | **LoyaltyPoints**      | Points ledger for member                   | Tracks: Earned, Redeemed, Balance                                             |
| 12  | **Promotion**          | Marketing campaign                         | References: Products/Categories, Stores; Defines: Discount rules              |
| 13  | **Shift**              | Work period for cashier/staff              | References: Store, User; Tracks: OpeningBalance, Transactions, ClosingBalance |
| 14  | **User**               | System user account                        | References: Store, Role; Has: Permissions, Status                             |
| 15  | **Role**               | Access control definition                  | Defines: Permissions for system functions                                     |
| 16  | **AuditLog**           | Change tracking record                     | References: User, Entity, Operation, Timestamp                                |
| 17  | **Transfer**           | Inter-store inventory transfer             | References: FromStore, ToStore, Products, Status                              |
| 18  | **InventoryMovement**  | Transaction recording inventory change     | References: Store, Product, Type (IN/OUT/TRANSFER/ADJUSTMENT)                 |
| 19  | **Complaint**          | Customer or staff complaint record         | References: Store, User, Subject, Resolution                                  |
| 20  | **Report**             | Generated business intelligence report     | References: Store, ReportType, DateRange, Data                                |

#### 2.2.2 Domain Entities - ERD (Textual Representation)

```
Store (1) ─── (M) User
       (1) ─── (M) Inventory
       (1) ─── (M) Transaction
       (1) ─── (M) Shift
       (1) ─── (M) Promotion
       (1) ─── (M) InventoryMovement
       (1) ─── (M) Transfer

Product (1) ─── (M) Inventory
        (1) ─── (M) LineItem
        (1) ─── (M) Price
        (M) ─── (1) Category
        (M) ─── (1) Brand

Transaction (1) ─── (M) LineItem
           (M) ─── (1) Store
           (M) ─── (1) User (Cashier)
           (1) ─── (1) Shift

Promotion (M) ─── (1) Store
         (M) ─── (M) Product

LoyaltyMember (1) ─── (M) LoyaltyPoints
             (1) ─── (M) Transaction

PricingRule (M) ─── (1) Product
            (M) ─── (M) Store

Role (1) ─── (M) User
```

---

### 2.3 Workflow

#### 2.3.1 POS Transaction Flow

```
Cashier logs in (Shift start)
    ↓
Customer approaches checkout
    ↓
Scan items (create LineItems)
    ↓
Apply loyalty member (if applicable) → Calculate points
    ↓
Apply active promotions → Calculate discounts
    ↓
Calculate dynamic price for each item
    ↓
Generate receipt
    ↓
Process payment
    ↓
Record transaction in database
    ↓
Update inventory (real-time)
    ↓
Award loyalty points
    ↓
Sync to central store (async)
```

#### 2.3.2 Inventory Replenishment Flow

```
Low-stock alert generated (threshold: 20% of max capacity)
    ↓
Inventory staff notified (push notification)
    ↓
Create transfer request (if stock available in warehouse/other store)
    ↓
Manager approves transfer
    ↓
Inventory staff processes transfer
    ↓
Update source store inventory (-qty)
    ↓
Update destination store inventory (+qty)
    ↓
Record InventoryMovement entries
    ↓
Sync stock levels to POS terminals
    ↓
Notify staff of replenishment completion
```

#### 2.3.3 Dynamic Pricing Adjustment Flow

```
Pricing rule scheduled execution (every 15 minutes)
    ↓
Fetch rules from database (demand-based, competitor-based, time-based)
    ↓
For each applicable product:
    Calculate new price based on:
    - Current demand vs baseline
    - Competitor prices (external feed)
    - Time-of-day multiplier
    - Inventory levels
    ↓
Generate price change audit record
    ↓
Validate price within min/max bounds
    ↓
Update Price table with new rate
    ↓
Invalidate cache for affected products
    ↓
Push update to POS terminals (via WebSocket)
    ↓
Record in AuditLog
```

#### 2.3.4 Loyalty Enrollment & Redemption Flow

```
Customer initiates loyalty enrollment
    ↓
Provide customer info (email, phone)
    ↓
System creates LoyaltyMember record with Standard tier
    ↓
Generate membership card/QR code
    ↓
Customer scans/enters loyalty ID at checkout
    ↓
System applies active promotions for member
    ↓
Calculate points earned: (TransactionAmount × PointsRate) + BonusPoints
    ↓
Record in LoyaltyPoints ledger
    ↓
If points >= RedemptionThreshold, member eligible for rewards
    ↓
Member redeems points:
    - Deduct from balance
    - Apply discount to transaction
    - Record redemption in ledger
    ↓
If tier criteria met (e.g., 5000+ annual spend), upgrade tier
    ↓
Send tier-specific promotions
```

#### 2.3.5 Store Operations Reconciliation Flow

```
End of shift (Cashier initiates close)
    ↓
System calculates shift totals:
    - Opening balance
    - Total transactions
    - Total cash collected
    - Total discounts applied
    ↓
Compare actual till vs. system records
    ↓
If variance > threshold:
    - Alert manager
    - Flag for manual investigation
    ↓
Record final balance in Shift record
    ↓
Archive transaction records
    ↓
Update daily store performance dashboard
    ↓
Trigger end-of-day sync to central system 
    ↓
Generate reconciliation report for manager review
```

---

### 2.4 Use Cases and Actors
- System and Management
![alt text](artifact/diagram/use_case/system_and_management.png)
- Inventory and Product Management
![alt text](artifact/diagram/use_case/inventory_and_product_management.png)
- Store and POS Management
![alt text](artifact/diagram/use_case/store_and_pos_management.png)
- Loyalty Program
![alt text](artifact/diagram/use_case/loyalty_program.png)
- Reporting and Analytics
![alt text](artifact/diagram/use_case/reporting_and_analytics.png)



#### 2.4.1 Actors Definition

| Actor ID | Actor Name           | Description                                      | Key Responsibilities                                                           |
| -------- | -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| **AC01** | **Admin**            | System administrator with chain-wide authority   | User management, policy configuration, system maintenance, security management |
| **AC02** | **District Manager** | Oversees multiple stores and regional operations | Performance monitoring, compliance, multi-store reporting, staff management    |
| **AC03** | **Store Manager**    | Manages single store operations                  | Daily operations, inventory control, staff scheduling, local promotions        |
| **AC04** | **Cashier**          | Operates POS at checkout                         | Customer transactions, loyalty enrollment, payment processing                  |
| **AC05** | **Inventory Staff**  | Manages stock operations                         | Receiving, transfers, cycle counts, replenishment                              |
| **AC06** | **Loyalty Member**   | Enrolled customer                                | Browse rewards, redeem points, view transaction history                        |
| **AC07** | **System**           | Automated processes                              | Scheduled pricing adjustments, alerts, sync operations                         |

#### 2.4.2 Use Cases

| UC#      | Use Case Name                      | Actor                   | Description                                                  | Priority |
| -------- | ---------------------------------- | ----------------------- | ------------------------------------------------------------ | -------- |
| **UC01** | **Login**                          | All                     | User authentication via JWT                                  | HIGH     |
| **UC02** | **Manage Users**                   | Admin                   | Create, update, deactivate user accounts                     | HIGH     |
| **UC03** | **Configure Roles & Permissions**  | Admin                   | Define role capabilities and access levels                   | HIGH     |
| **UC04** | **Create/Update Store**            | Admin, DM               | Add new store location or update store details               | HIGH     |
| **UC05** | **View Store Dashboard**           | DM, SM, Cashier         | Real-time store performance metrics                          | HIGH     |
| **UC06** | **Create POS Transaction**         | Cashier, System         | Record sale with items, loyalty, promotions, payment         | CRITICAL |
| **UC07** | **Apply Loyalty Member**           | Cashier                 | Link loyalty member to transaction                           | HIGH     |
| **UC08** | **Calculate Loyalty Points**       | System                  | Award points based on transaction amount and tier            | HIGH     |
| **UC09** | **Redeem Loyalty Points**          | Cashier, Member         | Use points for discount at checkout                          | HIGH     |
| **UC10** | **Upgrade Loyalty Tier**           | System                  | Advance member tier based on annual spend                    | MEDIUM   |
| **UC11** | **Manage Promotion**               | Admin, DM, SM           | Create, activate, deactivate store-wide promotions           | HIGH     |
| **UC12** | **Apply Promotion to Transaction** | System                  | Calculate discount from active promotions                    | HIGH     |
| **UC13** | **Create Pricing Rule**            | Admin, DM               | Define dynamic pricing rules                                 | HIGH     |
| **UC14** | **Execute Dynamic Pricing**        | System                  | Recalculate prices based on rules (every 15 min)             | CRITICAL |
| **UC15** | **View Price History**             | Admin, SM               | Audit trail of price changes                                 | MEDIUM   |
| **UC16** | **Close Shift**                    | Cashier, SM             | End-of-shift reconciliation and reporting                    | HIGH     |
| **UC17** | **View Transaction History**       | SM, DM, Loyalty Member  | Search and filter past transactions                          | HIGH     |
| **UC18** | **Manage Product Catalog**         | Admin, SM               | Add, edit, delete products and categories                    | HIGH     |
| **UC19** | **Update Inventory Stock Level**   | Inventory Staff, System | Adjust stock quantities (receiving, cycle count, adjustment) | HIGH     |
| **UC20** | **Create Inter-store Transfer**    | Inventory Staff, SM     | Request inventory transfer between stores                    | MEDIUM   |
| **UC21** | **Approve Transfer**               | SM, DM                  | Authorize inventory transfer requests                        | MEDIUM   |
| **UC22** | **Generate Store Report**          | SM, DM                  | Create performance, sales, or inventory reports              | MEDIUM   |
| **UC23** | **Generate Chain Report**          | Admin, DM               | Create multi-store consolidated reports                      | MEDIUM   |
| **UC24** | **View Real-time Analytics**       | DM, Admin               | Live KPI dashboard across stores                             | HIGH     |
| **UC25** | **Set Low-stock Alert Threshold**  | Admin, SM               | Configure threshold for inventory alerts                     | MEDIUM   |
| **UC26** | **Receive Low-stock Notification** | Inventory Staff, SM     | Alert when product stock falls below threshold               | HIGH     |
| **UC27** | **Manage Complaints**              | SM, Admin               | Log, track, and resolve customer/staff complaints            | MEDIUM   |
| **UC28** | **Export Report**                  | SM, DM, Admin           | Export analytics data in CSV/PDF format                      | MEDIUM   |
| **UC29** | **A/B Test Pricing**               | Admin, DM               | Create and compare pricing strategies                        | MEDIUM   |
| **UC30** | **Rollback Price Change**          | Admin                   | Revert to previous pricing rule                              | MEDIUM   |

---

### 2.5 Security Matrix

#### Access Control by Role and Function

| Function                     | Admin | DM  | SM  | Cashier | Inv Staff | Loyalty Member |
| ---------------------------- | ----- | --- | --- | ------- | --------- | -------------- |
| **Login**                    | ✓     | ✓   | ✓   | ✓       | ✓         | ✓              |
| **Manage Users**             | ✓     |     |     |         |           |                |
| **Configure Roles**          | ✓     |     |     |         |           |                |
| **Create/Update Store**      | ✓     |     |     |         |           |                |
| **View Own Store Dashboard** | ✓     | ✓   | ✓   | ✓       | ✓         |                |
| **View Chain Dashboard**     | ✓     | ✓   |     |         |           |                |
| **Create POS Transaction**   |       |     |     | ✓       |           |                |
| **Void Transaction**         |       |     | ✓   | ✓\*     |           |                |
| **Apply Loyalty Member**     |       |     |     | ✓       |           |                |
| **Redeem Loyalty Points**    |       |     |     | ✓       |           |                |
| **View Transaction History** | ✓     | ✓   | ✓   |         |           | ✓\*\*          |
| **Manage Products**          | ✓     | ✓   | ✓   |         |           |                |
| **View Inventory**           | ✓     | ✓   | ✓   |         | ✓         |                |
| **Update Stock Levels**      |       |     |     |         | ✓         |                |
| **Create Transfer Request**  |       |     |     |         | ✓         |                |
| **Approve Transfer**         | ✓     | ✓   | ✓   |         |           |                |
| **Manage Promotions**        | ✓     | ✓   | ✓   |         |           |                |
| **Create Pricing Rules**     | ✓     | ✓   |     |         |           |                |
| **View Price History**       | ✓     | ✓   | ✓   |         |           |                |
| **Rollback Price**           | ✓     |     |     |         |           |                |
| **Generate Reports**         | ✓     | ✓   | ✓   |         |           |                |
| **Configure Alerts**         | ✓     | ✓   | ✓   |         |           |                |
| **Manage Complaints**        | ✓     | ✓   | ✓   |         |           |                |
| **Audit Logs**               | ✓     |     |     |         |           |                |
| **System Maintenance**       | ✓     |     |     |         |           |                |
| **View Own Loyalty Account** |       |     |     |         |           | ✓              |

\* Cashier can void only within grace period (e.g., 30 min)  
\*\* Member sees only own transactions

---

### 2.6 User Stories

#### Authentication & Access

- As an **Admin**, I want to manage user accounts (create, update, deactivate) so that I can control system access and security.
- As a **User**, I want to log in with username/password or SSO so that I can access the system securely.
- As a **User**, I want to reset my password if forgotten so that I can regain access to my account.
- As an **Admin**, I want to assign roles to users so that I can control what functions each user can perform.

#### Store & Organization Management

- As an **Admin**, I want to create and manage store locations so that I can organize the retail chain.
- As a **District Manager**, I want to view a dashboard showing all stores under my region so that I can monitor operations.
- As a **Store Manager**, I want to view and manage my store's performance metrics so that I can track daily operations.
- As a **Store Manager**, I want to view staff schedules and manage shifts so that I can coordinate staffing.

#### Point of Sale Operations

- As a **Cashier**, I want to ring up items into a transaction so that I can process customer purchases.
- As a **Cashier**, I want to apply a loyalty member to a transaction so that the customer can earn points.
- As a **Cashier**, I want to see the real-time price for each item (including dynamic pricing) so that I can process transactions accurately.
- As a **Cashier**, I want to process multiple payment methods (cash, card, loyalty points) so that I can accommodate customer preferences.
- As a **Cashier**, I want to void a recent transaction (within grace period) so that I can correct mistakes.
- As a **Cashier**, I want to close my shift and see a reconciliation summary so that I can verify my cash drawer.

#### Loyalty Program

- As a **Cashier**, I want to enroll a new customer into the loyalty program so that they can start earning points.
- As a **Loyalty Member**, I want to earn points on every purchase so that I can accumulate rewards.
- As a **Loyalty Member**, I want to see my current point balance and tier status so that I can plan rewards redemptions.
- As a **Loyalty Member**, I want to redeem points for discounts at checkout so that I can benefit from my loyalty.
- As the **System**, I want to automatically upgrade loyal members to higher tiers when they reach spend thresholds so that engagement increases.

#### Promotions & Discounts

- As a **District Manager**, I want to create chain-wide promotions so that I can run consistent marketing campaigns.
- As a **Store Manager**, I want to create store-specific promotions so that I can tailor offers to local demand.
- As the **System**, I want to automatically apply active promotions to qualifying transactions so that customers receive discounts without manual intervention.
- As an **Admin**, I want to set up A/B testing for promotional offers so that I can measure effectiveness.

#### Dynamic Pricing

- As an **Admin**, I want to create pricing rules based on demand, competition, and time-of-day so that I can optimize revenue.
- As the **System**, I want to recalculate prices every 15 minutes based on active rules so that prices stay competitive.
- As a **Store Manager**, I want to view the price history for a product so that I can audit pricing changes.
- As an **Admin**, I want to rollback a pricing rule if it's underperforming so that I can quickly correct course.

#### Inventory Management

- As **Inventory Staff**, I want to update stock levels when receiving shipments so that inventory records are accurate.
- As **Inventory Staff**, I want to create transfer requests between stores so that stock can be redistributed based on demand.
- As a **Store Manager**, I want to approve inventory transfers so that I control stock outflow.
- As the **System**, I want to generate low-stock alerts when inventory falls below thresholds so that staff can replenish.
- As a **Cashier**, I want to see available stock for an item so that I can inform customers about availability.

#### Reporting & Analytics

- As a **District Manager**, I want to view sales, profitability, and customer metrics across all stores so that I can identify trends.
- As a **Store Manager**, I want to generate daily/weekly/monthly sales reports so that I can monitor store performance.
- As an **Admin**, I want to export reports to CSV/PDF so that I can share data with stakeholders.
- As a **District Manager**, I want to set up custom alerts (e.g., low sales, high shrinkage) so that I'm notified of exceptions.

#### Complaints & Issues

- As a **Store Manager**, I want to log and track customer complaints so that I can resolve issues and improve service.
- As an **Admin**, I want to view a centralized complaint dashboard so that I can identify systemic issues.

---

### 2.7 Change Requirement

#### Planned Enhancements & Future Phases

| #   | Item Name                    | Change Description                                                            | Phase     | Priority | Status      |
| --- | ---------------------------- | ----------------------------------------------------------------------------- | --------- | -------- | ----------- |
| 1 | **Redis Clustering** | Implement Redis cluster for distributed caching to support 100+ store load | Phase 3 | HIGH | Completed |
| 2 | **PostgreSQL Replication** | Set up master-slave replication with automated failover for high availability | Phase 3 | CRITICAL | Completed |
| 3   | **Distributed Tracing**      | Integrate Jaeger/Datadog for observability across microservices               | Phase 3   | HIGH     | Planned     |
| 4   | **WAF & DDoS Protection**    | Deploy AWS Shield/WAF or CloudFlare for security                              | Phase 3   | HIGH     | Planned     |
| 5   | **Predictive Analytics**     | Add ML-based demand forecasting and inventory optimization                    | Phase 4   | MEDIUM   | Future      |
| 6   | **Mobile App (Cashier)**     | Native mobile app for iOS/Android cashiers (improves POS flexibility)         | Phase 3.5 | MEDIUM   | Future      |
| 7   | **Customer Mobile App**      | Consumer-facing app for loyalty, rewards, in-store navigation                 | Phase 4   | MEDIUM   | Future      |
| 8   | **Supplier Integration API** | Enable suppliers to check stock levels and auto-submit orders                 | Phase 4   | LOW      | Future      |
| 9   | **Multi-currency Support**   | Support transactions in multiple currencies for regional expansion            | Phase 4   | LOW      | Future      |
| 10  | **B2B Wholesale Portal**     | Separate portal for wholesale/corporate bulk purchasing                       | Phase 4   | LOW      | Future      |

---

## 3. Appendix

### 3.1 Glossary

| Term                   | Definition                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **SKU**                | Stock Keeping Unit; unique identifier for each product variant                      |
| **POS**                | Point of Sale; checkout system for transaction processing                           |
| **RBAC**               | Role-Based Access Control; permission model based on user roles                     |
| **JWT**                | JSON Web Token; stateless authentication mechanism                                  |
| **Loyalty Tier**       | Member classification (Standard/Silver/Gold) based on annual spend                  |
| **Points**             | Loyalty currency; earned on purchases, redeemed for discounts                       |
| **Promotion**          | Marketing campaign offering discounts or incentives                                 |
| **Pricing Rule**       | Business logic defining how prices are calculated (demand, time, competition-based) |
| **PointsRate**         | Multiplier determining points earned per transaction (e.g., 1 point per $1 spent)   |
| **Shrinkage**          | Inventory loss due to theft, damage, or admin error                                 |
| **Transaction**        | Customer purchase recorded at checkout                                              |
| **Shift**              | Work period for a cashier, tracked from start to close                              |
| **Transfer**           | Inter-store inventory movement                                                      |
| **Audit Log**          | System record of all user actions and data changes                                  |
| **SLA**                | Service Level Agreement; uptime and performance commitment (99.99%)                 |
| **Latency**            | Response time for a system operation (target: <100ms for pricing)                   |
| **Cache Invalidation** | Process of refreshing cached data when underlying data changes                      |
| **Failover**           | Automatic switchover to backup system upon primary failure                          |
| **A/B Testing**        | Experiment comparing two versions to measure effectiveness                          |

### 3.2 Open Issues

| #   | Issue                               | Impact                                                                                      | Status | Owner          | Target Resolution  |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------- | ------ | -------------- | ------------------ |
| 1   | **Phase 3 Infrastructure Capacity** | Need to validate Redis/PostgreSQL cluster capacity for 100+ stores                          | OPEN   | ITPM           | Phase 3 Planning   |
| 2   | **Pricing Rule Complexity**         | Complex rule combinations may impact performance; need optimization strategy                | OPEN   | Architecture   | Phase 3 Testing    |
| 3   | **Loyalty Member Data Privacy**     | GDPR/data privacy requirements for customer data; need compliance audit                     | OPEN   | Legal/Security | Pre-production     |
| 4   | **Supplier API Specifications**     | Pending clarification on supplier integration data format                                   | OPEN   | PM             | Phase 4 Planning   |
| 5   | **Multi-currency Strategy**         | Decision needed on currency conversion approach (real-time vs fixed rates)                  | OPEN   | Finance/PM     | Phase 4 Planning   |
| 6   | **Mobile App Backend**              | Backend API optimization needed for mobile cashier app; latency targets TBD                 | OPEN   | Architecture   | Phase 3.5 Design   |
| 7   | **Real-time Sync Protocol**         | WebSocket vs polling decision for POS terminal updates; performance trade-offs under review | OPEN   | Architecture   | Phase 3 Review     |
| 8   | **Disaster Recovery Runbook**       | DR procedures need formalization and testing before Phase 3 release                         | OPEN   | Operations     | Phase 3 Completion |

---

## End of BRD

**Document Version**: 1.2  
**Last Updated**: 2026-01-17  
**Confidentiality**: Internal Use  
**Distribution**: Development Team, Product Management, Stakeholders
