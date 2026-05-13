# Business Requirements Document (BRD)

Store Chain Management System
Version 1.0
Date: 2026-05-11

## Revision History

| Date       | Version | Author | Change Description                      |
| ---------- | ------- | ------ | --------------------------------------- |
| 2026-05-11 | 1.0     | TBD    | Initial BRD aligned to repository scope |

## Approval

| Date | Version | Approver Name | Position          |
| ---- | ------- | ------------- | ----------------- |
| TBD  | 1.0     | TBD           | Application Owner |
| TBD  | 1.0     | TBD           | ITPM              |

## Table of Contents

1. Objective and Scope
2. Business Requirement
   2.1 Application Overview
   2.2 Domain Model
   2.2.1 Diagram
   2.2.2 Domain Objects Description
   2.3 Workflow
   2.4 Use Cases and Actors
   2.4.1 Diagram
   2.4.2 Description of Actors
   2.4.3 Description of Use Cases
   2.5 Security Matrix
   2.6 User Story
   2.7 Change Requirement
3. Appendix
   3.1 Glossary
   3.2 Open Issues

# 1. Objective and Scope

This document defines the business requirements for the Store Chain Management System. It provides the operational scope, core business capabilities, and actors for a multi-store retail chain. It is used for requirements confirmation and business sign-off.

Scope includes: products, pricing, inventory, procurement, inter-store transfers, POS sales, returns, promotions, complaints, reports, audit logs, and system settings. Out of scope: consumer marketplace, public classifieds, and customer-to-customer trading.

# 2. Business Requirement

## 2.1 Application Overview

The system is a web-based platform for managing a retail chain. It provides a centralized view of stores, inventory, POS operations, and reporting. Store staff operate day-to-day functions (sales, receiving, adjustments), while managers and admins manage configuration, approvals, and oversight.

Key business outcomes:

- Standardized operations across stores.
- Real-time visibility into stock and sales.
- Controlled access based on roles and store scope.

## 2.2 Domain Model

### 2.2.1 Diagram

TBD. The domain model diagram will be derived from the database schema and confirmed with business stakeholders.

### 2.2.2 Domain Objects Description

| #   | Object Name      | Object Description                                          |
| --- | ---------------- | ----------------------------------------------------------- |
| 1   | Store            | Physical store location with identity, address, and status. |
| 2   | User             | Staff account with role and store assignments.              |
| 3   | Role             | Permission group for access control.                        |
| 4   | Product          | Master product definition.                                  |
| 5   | Product Variant  | Sellable SKU with barcode and pricing.                      |
| 6   | Category         | Product categorization hierarchy.                           |
| 7   | Brand            | Product brand metadata.                                     |
| 8   | Inventory        | Stock on hand per store and variant.                        |
| 9   | Stock Lot        | Lot and expiry tracking for received stock.                 |
| 10  | Stock Movement   | Immutable ledger for inventory changes.                     |
| 11  | Supplier         | Vendor information for procurement.                         |
| 12  | Purchase Order   | Order to supplier with items and status.                    |
| 13  | Purchase Receipt | Record of received goods.                                   |
| 14  | Transfer         | Stock movement between stores.                              |
| 15  | POS Shift        | Cashier shift with opening and closing cash.                |
| 16  | Cash Movement    | Cash in/out during a shift.                                 |
| 17  | Invoice          | Sales transaction record.                                   |
| 18  | Invoice Item     | Line items for a sale.                                      |
| 19  | Return           | Refund transaction linked to invoices.                      |
| 20  | Promotion        | Discount rule and validity window.                          |
| 21  | Complaint        | Customer complaint record with status.                      |
| 22  | Audit Log        | Trace of critical actions for compliance.                   |
| 23  | Settings         | System configuration grouped by category.                   |
| 24  | Customer         | Optional customer record for invoices and returns.          |

## 2.3 Workflow

High-level operational workflow:

1. Admin configures stores, users, and catalog.
2. Store staff receive goods and maintain inventory.
3. Cashiers open shifts and perform POS sales.
4. Inventory updates and stock movements are recorded automatically.
5. Managers review reports, handle complaints, and close out shifts.

## 2.4 Use Cases and Actors

### 2.4.1 Diagram

TBD. The use case diagram will be created from the agreed use cases below.

### 2.4.2 Description of Actors

| #   | Actor Name    | Definition                                              |
| --- | ------------- | ------------------------------------------------------- |
| 1   | Admin         | Manages system configuration, stores, users, and audit. |
| 2   | Store Manager | Oversees store operations, inventory, and approvals.    |
| 3   | Employee      | Performs inventory receiving and operational tasks.     |
| 4   | Cashier       | Executes POS sales, returns, and shift operations.      |
| 5   | Auditor/Owner | Reviews reports and audit logs.                         |

### 2.4.3 Description of Use Cases

| #   | Use Case Name                | Definition                                        |
| --- | ---------------------------- | ------------------------------------------------- |
| 1   | Sign In                      | User logs in to access system features.           |
| 2   | Manage Users                 | Admin creates, updates, and deactivates users.    |
| 3   | Manage Stores                | Admin maintains store profiles and status.        |
| 4   | Manage Products              | Create and update products and variants.          |
| 5   | Manage Categories and Brands | Maintain catalog classification.                  |
| 6   | Set Store Pricing            | Define store-specific prices and effective dates. |
| 7   | View Store Catalog           | View store-specific catalog with stock.           |
| 8   | Adjust Inventory             | Add, remove, or correct stock levels.             |
| 9   | Create Purchase Order        | Create PO for supplier.                           |
| 10  | Receive Purchase Order       | Record received quantities and lots.              |
| 11  | Transfer Stock               | Create, dispatch, and receive transfers.          |
| 12  | Open or Close Shift          | Manage cashier shifts.                            |
| 13  | POS Checkout                 | Sell items and generate invoices.                 |
| 14  | Hold or Resume Cart          | Pause and resume a transaction.                   |
| 15  | Return and Refund            | Process returns and restock items.                |
| 16  | Manage Promotions            | Create and validate discounts.                    |
| 17  | Handle Complaints            | Record and update complaint status.               |
| 18  | View Reports                 | View sales, inventory, and dashboard reports.     |
| 19  | View Audit Logs              | Review critical actions and changes.              |
| 20  | Manage Settings              | Update system configuration.                      |
| 21  | Maintenance Tasks            | Perform cleanup and backup operations.            |

## 2.5 Security Matrix

Legend: X = allowed, - = not allowed

| Function                 | Admin | Store Manager | Employee | Cashier | Auditor/Owner |
| ------------------------ | ----- | ------------- | -------- | ------- | ------------- |
| Sign In                  | X     | X             | X        | X       | X             |
| Manage Users             | X     | -             | -        | -       | -             |
| Manage Stores            | X     | -             | -        | -       | -             |
| Manage Products          | X     | X             | -        | -       | -             |
| Manage Categories/Brands | X     | X             | -        | -       | -             |
| Set Store Pricing        | X     | X             | -        | -       | -             |
| View Store Catalog       | X     | X             | X        | X       | X             |
| Adjust Inventory         | X     | X             | X        | -       | -             |
| Create Purchase Order    | X     | X             | X        | -       | -             |
| Receive Purchase Order   | X     | X             | X        | -       | -             |
| Transfer Stock           | X     | X             | X        | -       | -             |
| Open or Close Shift      | X     | X             | -        | X       | -             |
| POS Checkout             | X     | -             | -        | X       | -             |
| Hold or Resume Cart      | X     | -             | -        | X       | -             |
| Return and Refund        | X     | X             | -        | X       | -             |
| Manage Promotions        | X     | X             | -        | -       | -             |
| Handle Complaints        | X     | X             | X        | X       | -             |
| View Reports             | X     | X             | -        | -       | X             |
| View Audit Logs          | X     | -             | -        | -       | X             |
| Manage Settings          | X     | -             | -        | -       | -             |
| Maintenance Tasks        | X     | -             | -        | -       | -             |

## 2.6 User Story

- As an admin, I want to manage users and roles so that access is controlled.
- As a store manager, I want to track inventory so that stockouts are prevented.
- As an employee, I want to receive purchase orders so that inventory is updated accurately.
- As a cashier, I want to complete POS checkout quickly so that customer lines move faster.
- As a cashier, I want to process returns so that customer issues are resolved.
- As an auditor, I want to view audit logs so that changes are traceable.
- As a manager, I want reports so that I can monitor store performance.

## 2.7 Change Requirement

| #   | Item Name | Change Description |
| --- | --------- | ------------------ |
| 1   | TBD       | TBD                |
| 2   | TBD       | TBD                |

# 3. Appendix

## 3.1 Glossary

| Term | Description                    |
| ---- | ------------------------------ |
| BRD  | Business Requirements Document |
| POS  | Point of Sale                  |
| SKU  | Stock Keeping Unit             |
| RBAC | Role-Based Access Control      |

## 3.2 Open Issues

- Confirm performance targets and SLA expectations.
- Confirm device integrations (barcode scanner, receipt printer).
- Finalize role-permission matrix with business owners.
