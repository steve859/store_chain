# SRS

_Source file: `Completed_Store_Chain_SRS_With_Pseudocode_Business_Rules.docx`_

SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

Store Chain Management System

Version 1.5 - Completed with Yes/No Activity Diagrams and Pseudocode Business Rules

# Revision and Sign Off Sheet

| Author | Version | Change Reference | Date |
| --- | --- | --- | --- |
| Team | 1.0 | Finalize original SRS document | 16/05/2026 |
| Team | 1.1 | Align SRS with enhanced BRD | 23/05/2026 |
| Team | 1.2 | Add Activities Flow and Business Rules for use cases | 23/05/2026 |
| Team | 1.4 | Convert Activities Flow into Yes/No decision diagrams | 23/05/2026 |
| Team | 1.5 | Rewrite Business Rules in pseudocode style similar to template | 23/05/2026 |

# 1. Introduction

## 1.1 Purpose

This document serves as the Software Requirements Specification for the Store Chain Management System project. It defines the functional requirements, non-functional requirements, activity flows, business rules, and supporting information required for implementation and testing.

## 1.2 Scope

The Store Chain Management System is a web-based multi-store retail management platform supporting store management, POS operations, inventory management, dynamic pricing, promotions, loyalty programs, reporting, analytics, and complaint management.

## 1.3 Intended Audiences and Document Organization

- Development team: implement features based on functional requirements, activity diagrams, and business rules.

- Testing team: prepare test cases from use case descriptions, alternative flows, and business rules.

- Business stakeholders: confirm that software requirements satisfy business requirements.

- Project managers and architects: use the document to plan delivery, integration, and deployment.

# 2. Functional Requirements

## 2.1 Use Case Description

### UC01: Login

| Name | Login |
| --- | --- |
| Description | Authenticate users into the system. |
| Actor | Admin, District Manager, Store Manager, Cashier, Inventory Staff, Loyalty Member |
| Trigger | User selects the login function. |
| Pre-condition | User account exists and is active. |
| Post-condition | User accesses a dashboard according to assigned role. |
| Priority | High |

#### Activities Flow

Figure 1: Yes/No Activity Flow Diagram - UC01 Login

#### Alternative / Exception Flow

- No branch: Show disabled account message.

- No branch: Show invalid login message.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (3) | BR011 | Validate Rules:<br>INPUT [username], [password]<br>IF [username] IS NULL OR [password] IS NULL THEN<br>    SHOW MSG02<br>ELSE<br>    [user] = UserRepository.findByUsername([username])<br>    IF [user] == NULL THEN SHOW MSG04<br>    ELSE IF [user.status] != ACTIVE THEN SHOW MSG03<br>    ELSE IF hash([password]) != [user.password] THEN SHOW MSG04<br>    ELSE generateJWT([user.id], [user.role]) |
| (4) | BR012 | Session Rules:<br>IF authentication == SUCCESS THEN<br>    [session.createdAt] = currentDateTime<br>    [session.expiredAt] = currentDateTime + SESSION_TIMEOUT<br>    save([session])<br>    WRITE AuditLog(action = LOGIN, actor = [user.id]) |
| (5) | BR013 | Redirect Rules:<br>SWITCH ([user.role])<br>    CASE Admin: redirectTo(AdminDashboard)<br>    CASE DistrictManager: redirectTo(ChainDashboard)<br>    CASE StoreManager: redirectTo(StoreDashboard)<br>    CASE Cashier: redirectTo(POSScreen)<br>    CASE InventoryStaff: redirectTo(InventoryScreen)<br>    DEFAULT: redirectTo(MemberDashboard) |

### UC02: Manage Users

| Name | Manage Users |
| --- | --- |
| Description | Create, update, deactivate, or remove user accounts. |
| Actor | Admin |
| Trigger | Admin accesses user management module. |
| Pre-condition | Admin is authenticated and has user management permission. |
| Post-condition | User account information is updated successfully. |
| Priority | High |

#### Activities Flow

Figure 2: Yes/No Activity Flow Diagram - UC02 Manage Users

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show validation error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (2) | BR021 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] != Admin THEN<br>    SHOW MSG03<br>    STOP PROCESS<br>ELSE load(UserManagementScreen) |
| (4) | BR022 | Validate Rules:<br>INPUT [username], [email], [role], [status], [storeId]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF UserRepository.existsByUsername([username]) THEN SHOW MSG05<br>IF UserRepository.existsByEmail([email]) THEN SHOW MSG05<br>IF RoleRepository.exists([role]) == FALSE THEN SHOW MSG05 |
| (5) | BR023 | Saving Rules:<br>IF operation == CREATE THEN<br>    [user.id] = autoGenerate()<br>    [user.password] = generateTemporaryPassword()<br>    [user.status] = ACTIVE<br>    UserRepository.save([user])<br>ELSE IF operation == UPDATE THEN<br>    [user] = UserRepository.findById([userId])<br>    update([user], request.body)<br>ELSE IF operation == DELETE THEN<br>    [user.status] = DISABLED<br>WRITE AuditLog(action = MANAGE_USER)<br>SHOW MSG01 |

### UC03: Configure Roles and Permissions

| Name | Configure Roles and Permissions |
| --- | --- |
| Description | Configure RBAC roles and permissions. |
| Actor | Admin |
| Trigger | Admin opens RBAC configuration module. |
| Pre-condition | Admin is authenticated. |
| Post-condition | Role and permission configuration is updated. |
| Priority | High |

#### Activities Flow

Figure 3: Yes/No Activity Flow Diagram - UC03 Configure Roles and Permissions

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Reject permission setting.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (2) | BR031 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] != Admin THEN SHOW MSG03<br>ELSE load(RBACConfigurationScreen) |
| (3) | BR032 | Configuration Rules:<br>INPUT [roleId], [permissionList]<br>[role] = RoleRepository.findById([roleId])<br>IF [role] == NULL THEN SHOW MSG05<br>IF [permissionList] IS EMPTY THEN SHOW MSG02<br>FOR EACH [permission] IN [permissionList]:<br>    IF PermissionRepository.exists([permission]) == FALSE THEN SHOW MSG05 |
| (5) | BR033 | Saving Rules:<br>IF validation == SUCCESS THEN<br>    RolePermissionRepository.deleteByRole([roleId])<br>    FOR EACH [permission] IN [permissionList]:<br>        RolePermissionRepository.save([roleId], [permission])<br>    WRITE AuditLog(action = UPDATE_ROLE_PERMISSION)<br>    SHOW MSG01 |

### UC04: Create or Update Store

| Name | Create or Update Store |
| --- | --- |
| Description | Create or update store information. |
| Actor | Admin, District Manager |
| Trigger | User accesses store management module. |
| Pre-condition | Authorized user is authenticated. |
| Post-condition | Store information is stored successfully. |
| Priority | High |

#### Activities Flow

Figure 4: Yes/No Activity Flow Diagram - UC04 Create or Update Store

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Highlight missing fields.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (2) | BR041 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, DistrictManager] THEN SHOW MSG03<br>ELSE load(StoreForm) |
| (3) | BR042 | Validate Rules:<br>INPUT [storeName], [address], [district], [managerId], [status]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF StoreRepository.existsByNameAndAddress([storeName], [address]) THEN SHOW MSG05<br>IF [managerId] IS NOT NULL AND UserRepository.findById([managerId]) == NULL THEN SHOW MSG05 |
| (4) | BR043 | Saving Rules:<br>IF [storeId] == NULL THEN<br>    [store.id] = autoGenerate()<br>    [store.createdAt] = currentDateTime<br>    StoreRepository.save([store])<br>ELSE<br>    [store] = StoreRepository.findById([storeId])<br>    update([store], request.body)<br>WRITE AuditLog(action = SAVE_STORE)<br>SHOW MSG01 |

### UC05: View Store Dashboard

| Name | View Store Dashboard |
| --- | --- |
| Description | View store performance dashboard. |
| Actor | Admin, District Manager, Store Manager |
| Trigger | User opens dashboard module. |
| Pre-condition | User is authenticated and has dashboard permission. |
| Post-condition | Dashboard information is displayed. |
| Priority | High |

#### Activities Flow

Figure 5: Yes/No Activity Flow Diagram - UC05 View Store Dashboard

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show retrieval error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (2) | BR051 | Access Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, DistrictManager, StoreManager] THEN SHOW MSG03<br>ELSE determineDashboardScope([currentUser.role], [currentUser.storeId]) |
| (3) | BR052 | Load Data Rules:<br>[kpi] = ReportService.getKPI(scope, dateRange)<br>[inventoryAlerts] = InventoryService.getLowStock(scope)<br>[salesSummary] = TransactionService.getSalesSummary(scope)<br>IF anyDataSourceUnavailable THEN SHOW MSG06 |
| (4) | BR053 | Display Rules:<br>IF [kpi] IS EMPTY THEN showEmptyDashboardMessage()<br>ELSE renderDashboard([kpi], [inventoryAlerts], [salesSummary])<br>refreshDashboardEvery(CONFIG.dashboardRefreshInterval) |

### UC06: Create POS Transaction

| Name | Create POS Transaction |
| --- | --- |
| Description | Process customer purchase at POS. |
| Actor | Cashier |
| Trigger | Customer initiates checkout. |
| Pre-condition | Cashier is logged into POS system and shift is active. |
| Post-condition | Transaction is stored and inventory is updated. |
| Priority | High |

#### Activities Flow

Figure 6: Yes/No Activity Flow Diagram - UC06 Create POS Transaction

#### Alternative / Exception Flow

- No branch: Show product error.

- No branch: Retry payment.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR061 | Product Scanning Rules:<br>FOR EACH [barcode] IN scannedItems:<br>    [product] = ProductRepository.findByBarcode([barcode])<br>    IF [product] == NULL THEN SHOW MSG05<br>    IF InventoryService.availableQty([product.id], [storeId]) <= 0 THEN SHOW MSG05<br>    addToCart([product]) |
| (4) | BR062 | Calculation Rules:<br>[subtotal] = SUM(cart.lineItem.price * cart.lineItem.quantity)<br>[promotionDiscount] = PromotionService.calculate(cart)<br>[loyaltyDiscount] = LoyaltyService.calculateRedemption(member, cart)<br>[total] = subtotal - promotionDiscount - loyaltyDiscount<br>IF [total] < 0 THEN [total] = 0 |
| (6) | BR063 | Payment and Saving Rules:<br>IF PaymentService.pay([method], [total]) == SUCCESS THEN<br>    [transaction.id] = autoGenerate()<br>    TransactionRepository.save([transaction])<br>    InventoryService.decreaseStock(cart)<br>    ReceiptService.generate([transaction])<br>    SHOW MSG01<br>ELSE SHOW MSG10 |

### UC07: Apply Loyalty Member

| Name | Apply Loyalty Member |
| --- | --- |
| Description | Link loyalty member account to transaction. |
| Actor | Cashier |
| Trigger | Customer provides loyalty information during checkout. |
| Pre-condition | Loyalty member account exists. |
| Post-condition | Loyalty account is linked to transaction. |
| Priority | High |

#### Activities Flow

Figure 7: Yes/No Activity Flow Diagram - UC07 Apply Loyalty Member

#### Alternative / Exception Flow

- No branch: Continue without loyalty.

- No branch: Show inactive member.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (2) | BR071 | Lookup Rules:<br>INPUT [memberCode] OR [phoneNumber]<br>IF input IS NULL THEN continueWithoutLoyalty()<br>[member] = LoyaltyRepository.findByCodeOrPhone(input)<br>IF [member] == NULL THEN SHOW MSG05 |
| (3) | BR072 | Validate Rules:<br>IF [member.status] != ACTIVE THEN<br>    SHOW MSG05<br>    continueWithoutLoyalty()<br>ELSE display([member.name], [member.tier], [member.points]) |
| (4) | BR073 | Link Rules:<br>IF validation == SUCCESS THEN<br>    [transaction.loyaltyMemberId] = [member.id]<br>    [transaction.loyaltyTier] = [member.tier]<br>    recalculateEligibleBenefits([transaction]) |

### UC08: Calculate Loyalty Points

| Name | Calculate Loyalty Points |
| --- | --- |
| Description | Calculate points after transaction completion. |
| Actor | System |
| Trigger | Transaction is finalized. |
| Pre-condition | Transaction is completed and linked to loyalty member. |
| Post-condition | Loyalty balance and history are updated. |
| Priority | High |

#### Activities Flow

Figure 8: Yes/No Activity Flow Diagram - UC08 Calculate Loyalty Points

#### Alternative / Exception Flow

- No branch: Skip point calculation.

- No branch: Log and retry later.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR081 | Eligibility Rules:<br>IF [transaction.status] != COMPLETED THEN STOP PROCESS<br>IF [transaction.loyaltyMemberId] == NULL THEN STOP PROCESS<br>IF [transaction.totalAmount] <= 0 THEN STOP PROCESS |
| (2) | BR082 | Point Calculation Rules:<br>[policy] = LoyaltyPolicyRepository.getActivePolicy()<br>IF [policy] == NULL THEN LOG error AND STOP PROCESS<br>[basePoint] = floor([transaction.totalAmount] / [policy.amountPerPoint])<br>[tierMultiplier] = [policy].getMultiplier([member.tier])<br>[earnedPoint] = [basePoint] * [tierMultiplier] |
| (3) | BR083 | Update Rules:<br>[member.points] = [member.points] + [earnedPoint]<br>LoyaltyHistoryRepository.save(memberId, transactionId, earnedPoint, EARN)<br>LoyaltyRepository.save([member])<br>SHOW updatedBalance |

### UC09: Redeem Loyalty Points

| Name | Redeem Loyalty Points |
| --- | --- |
| Description | Redeem points for discount. |
| Actor | Cashier, Loyalty Member |
| Trigger | Customer requests redemption. |
| Pre-condition | Member has sufficient points and transaction is active. |
| Post-condition | Points are deducted and discount is applied. |
| Priority | High |

#### Activities Flow

Figure 9: Yes/No Activity Flow Diagram - UC09 Redeem Loyalty Points

#### Alternative / Exception Flow

- No branch: Show insufficient points.

- No branch: Reject redemption.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (2) | BR091 | Balance Rules:<br>[member] = LoyaltyRepository.findById([memberId])<br>IF [member] == NULL OR [member.status] != ACTIVE THEN SHOW MSG05<br>IF [redeemPoint] <= 0 THEN SHOW MSG05<br>IF [member.points] < [redeemPoint] THEN SHOW MSG05 |
| (4) | BR092 | Redemption Rules:<br>[policy] = LoyaltyPolicyRepository.getActivePolicy()<br>[discount] = [redeemPoint] * [policy.pointValue]<br>IF [discount] > [transaction.totalAmount] THEN<br>    [discount] = [transaction.totalAmount]<br>applyDiscount([transaction], [discount]) |
| (6) | BR093 | Deduction Rules:<br>IF userConfirmsRedemption == TRUE THEN<br>    [member.points] = [member.points] - [redeemPoint]<br>    LoyaltyHistoryRepository.save(memberId, transactionId, redeemPoint, REDEEM)<br>    updateTransactionTotal([transaction])<br>    SHOW MSG01 |

### UC10: Upgrade Loyalty Tier

| Name | Upgrade Loyalty Tier |
| --- | --- |
| Description | Upgrade loyalty tier automatically. |
| Actor | System |
| Trigger | Spending or point threshold is reached. |
| Pre-condition | Loyalty member exists and has transaction history. |
| Post-condition | Member tier is updated if threshold is reached. |
| Priority | High |

#### Activities Flow

Figure 10: Yes/No Activity Flow Diagram - UC10 Upgrade Loyalty Tier

#### Alternative / Exception Flow

- No branch: Keep current tier.

- No branch: Log policy issue.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR101 | Evaluation Rules:<br>[member] = LoyaltyRepository.findById([memberId])<br>[policy] = LoyaltyTierPolicyRepository.getActivePolicy()<br>IF [member] == NULL OR [policy] == NULL THEN STOP PROCESS |
| (2) | BR102 | Tier Rules:<br>[spending] = TransactionRepository.sumCompletedAmount([member.id], policy.period)<br>[newTier] = policy.findTierBySpending([spending])<br>IF [newTier.rank] <= [member.currentTier.rank] THEN STOP PROCESS |
| (3) | BR103 | Update Rules:<br>[member.currentTier] = [newTier]<br>[member.tierUpdatedAt] = currentDateTime<br>LoyaltyTierHistoryRepository.save([member.id], [newTier])<br>NotificationService.notifyTierUpgrade([member]) |

### UC11: Manage Promotion

| Name | Manage Promotion |
| --- | --- |
| Description | Manage promotional campaigns. |
| Actor | Admin, District Manager, Store Manager |
| Trigger | User accesses promotion management module. |
| Pre-condition | Authorized user is authenticated. |
| Post-condition | Promotion is stored or updated. |
| Priority | Medium |

#### Activities Flow

Figure 11: Yes/No Activity Flow Diagram - UC11 Manage Promotion

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show conflict warning.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR111 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, DistrictManager, StoreManager] THEN SHOW MSG03<br>ELSE load(PromotionForm) |
| (3) | BR112 | Validate Rules:<br>INPUT [promotionName], [discountType], [discountValue], [startDate], [endDate], [targetProducts]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF [startDate] >= [endDate] THEN SHOW MSG05<br>IF [discountValue] <= 0 THEN SHOW MSG05<br>IF conflictsWithExistingPromotion(INPUT) THEN SHOW MSG05 |
| (4) | BR113 | Saving Rules:<br>IF [promotionId] == NULL THEN createPromotion(INPUT)<br>ELSE updatePromotion([promotionId], INPUT)<br>PromotionScheduler.activateWhen([startDate])<br>WRITE AuditLog(action = SAVE_PROMOTION)<br>SHOW MSG01 |

### UC12: Apply Promotion to Transaction

| Name | Apply Promotion to Transaction |
| --- | --- |
| Description | Automatically apply eligible promotions to POS transaction. |
| Actor | System |
| Trigger | POS transaction is processed. |
| Pre-condition | Active promotions exist. |
| Post-condition | Applicable promotions are applied. |
| Priority | Medium |

#### Activities Flow

Figure 12: Yes/No Activity Flow Diagram - UC12 Apply Promotion to Transaction

#### Alternative / Exception Flow

- No branch: Continue no discount.

- No branch: No promotion applied.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR121 | Retrieve Rules:<br>[promotions] = PromotionRepository.findActive(currentDateTime, storeId)<br>IF [promotions] IS EMPTY THEN return zeroDiscount |
| (2) | BR122 | Eligibility Rules:<br>FOR EACH [promotion] IN [promotions]:<br>    IF promotion.appliesTo([transaction.items]) == TRUE THEN<br>        addToEligiblePromotionList([promotion])<br>IF eligiblePromotionList IS EMPTY THEN return zeroDiscount |
| (3) | BR123 | Discount Rules:<br>[bestPromotion] = selectBestBenefit(eligiblePromotionList)<br>[discount] = calculateDiscount([bestPromotion], [transaction])<br>[transaction.discountAmount] = [discount]<br>[transaction.totalAmount] = [transaction.subtotal] - [discount] |

### UC13: Create Pricing Rule

| Name | Create Pricing Rule |
| --- | --- |
| Description | Create dynamic pricing rules. |
| Actor | Admin, District Manager |
| Trigger | User accesses pricing rule module. |
| Pre-condition | Authorized user is authenticated. |
| Post-condition | Pricing rule is stored. |
| Priority | Medium |

#### Activities Flow

Figure 13: Yes/No Activity Flow Diagram - UC13 Create Pricing Rule

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show validation error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR131 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, DistrictManager] THEN SHOW MSG03<br>ELSE load(PricingRuleForm) |
| (3) | BR132 | Validate Rules:<br>INPUT [ruleName], [condition], [adjustmentType], [adjustmentValue], [targetProducts], [schedule]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF [adjustmentValue] <= 0 THEN SHOW MSG05<br>IF [targetProducts] IS EMPTY THEN SHOW MSG05<br>IF invalidConditionSyntax([condition]) THEN SHOW MSG05 |
| (4) | BR133 | Saving Rules:<br>[rule.status] = ACTIVE<br>[rule.createdBy] = currentUser.id<br>PricingRuleRepository.save([rule])<br>PricingScheduler.register([rule.schedule])<br>WRITE AuditLog(action = CREATE_PRICING_RULE)<br>SHOW MSG01 |

### UC14: Execute Dynamic Pricing

| Name | Execute Dynamic Pricing |
| --- | --- |
| Description | Execute dynamic pricing and update prices automatically. |
| Actor | System |
| Trigger | Scheduled pricing execution starts. |
| Pre-condition | Pricing rules are configured. |
| Post-condition | Product prices are updated. |
| Priority | Medium |

#### Activities Flow

Figure 14: Yes/No Activity Flow Diagram - UC14 Execute Dynamic Pricing

#### Alternative / Exception Flow

- No branch: Skip execution.

- No branch: Reject and log issue.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR141 | Execution Rules:<br>[rules] = PricingRuleRepository.findActiveRules(currentDateTime)<br>IF [rules] IS EMPTY THEN STOP PROCESS<br>FOR EACH [rule] IN [rules]:<br>    executeRule([rule]) |
| (2) | BR142 | Calculation Rules:<br>[demand] = AnalyticsService.getDemand(rule.targetProducts)<br>[inventory] = InventoryService.getStock(rule.targetProducts)<br>[newPrice] = PricingEngine.calculate(rule, demand, inventory)<br>IF [newPrice] < [minimumPrice] OR [newPrice] > [maximumPrice] THEN rejectPrice() |
| (5) | BR143 | Update Rules:<br>IF priceValidation == SUCCESS THEN<br>    PriceHistoryRepository.save(oldPrice, newPrice, rule.id)<br>    ProductPriceRepository.update([productId], [newPrice])<br>    POSSyncService.publishPriceUpdate([productId], [newPrice])<br>ELSE WRITE AuditLog(action = PRICE_REJECTED) |

### UC15: View Price History

| Name | View Price History |
| --- | --- |
| Description | Review historical pricing data. |
| Actor | Admin, District Manager, Store Manager |
| Trigger | User opens price history module. |
| Pre-condition | Pricing history exists. |
| Post-condition | Historical pricing information is displayed. |
| Priority | Medium |

#### Activities Flow

Figure 15: Yes/No Activity Flow Diagram - UC15 View Price History

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show empty result.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR151 | Search Rules:<br>INPUT [productId], [fromDate], [toDate]<br>IF [productId] IS NULL THEN SHOW MSG02<br>IF [fromDate] > [toDate] THEN SHOW MSG05 |
| (2) | BR152 | Retrieve Rules:<br>[history] = PriceHistoryRepository.findByProductAndDateRange([productId], [fromDate], [toDate])<br>IF [history] IS EMPTY THEN showEmptyResult() |
| (3) | BR153 | Display Rules:<br>SORT [history] BY changedAt DESC<br>DISPLAY [oldPrice], [newPrice], [changedBy], [reason], [changedAt] |

### UC16: Close Shift

| Name | Close Shift |
| --- | --- |
| Description | Reconcile cashier shift. |
| Actor | Cashier, Store Manager |
| Trigger | Cashier initiates shift closing. |
| Pre-condition | Cashier shift is active. |
| Post-condition | Shift report is generated. |
| Priority | Medium |

#### Activities Flow

Figure 16: Yes/No Activity Flow Diagram - UC16 Close Shift

#### Alternative / Exception Flow

- No branch: Show no active shift.

- No branch: Manager reviews variance.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR161 | Shift Rules:<br>[shift] = ShiftRepository.findActiveShift([cashierId])<br>IF [shift] == NULL THEN SHOW MSG05<br>ELSE loadShiftClosingScreen([shift]) |
| (2) | BR162 | Reconciliation Rules:<br>[systemTotal] = TransactionRepository.sumByShift([shift.id])<br>[cashInput] = request.body.cashBalance<br>[variance] = [cashInput] - [systemTotal.cashAmount]<br>IF abs([variance]) > CONFIG.allowedVariance THEN requireManagerReview() |
| (5) | BR163 | Closing Rules:<br>IF varianceApproved OR varianceWithinLimit THEN<br>    [shift.status] = CLOSED<br>    [shift.closedAt] = currentDateTime<br>    ShiftReportRepository.save([shift], [systemTotal], [variance])<br>    DashboardService.updateDailyPerformance()<br>    SHOW MSG01 |

### UC17: View Transaction History

| Name | View Transaction History |
| --- | --- |
| Description | Search and review transactions. |
| Actor | Store Manager, Cashier, Loyalty Member |
| Trigger | User accesses transaction history module. |
| Pre-condition | Transaction records exist. |
| Post-condition | Transaction history is displayed. |
| Priority | Medium |

#### Activities Flow

Figure 17: Yes/No Activity Flow Diagram - UC17 View Transaction History

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show empty result.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR171 | Search Rules:<br>INPUT [storeId], [cashierId], [memberId], [dateRange], [status]<br>[currentUser] = getUserFromJWT()<br>[scope] = determineTransactionScope([currentUser]) |
| (2) | BR172 | Retrieve Rules:<br>[transactions] = TransactionRepository.search(INPUT, scope)<br>IF [transactions] IS EMPTY THEN showEmptyResult()<br>ELSE paginate([transactions], pageSize = 20) |
| (3) | BR173 | Display Rules:<br>FOR EACH [transaction] IN [transactions]:<br>    DISPLAY [transactionNo], [date], [cashier], [store], [total], [paymentStatus]<br>IF userSelectsDetail THEN loadTransactionDetail([transaction.id]) |

### UC18: Manage Product Catalog

| Name | Manage Product Catalog |
| --- | --- |
| Description | Manage products, categories, and SKU data. |
| Actor | Admin, Store Manager, Inventory Staff |
| Trigger | User accesses product management module. |
| Pre-condition | Authorized user is authenticated. |
| Post-condition | Product catalog is updated. |
| Priority | Medium |

#### Activities Flow

Figure 18: Yes/No Activity Flow Diagram - UC18 Manage Product Catalog

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show validation error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR181 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, StoreManager, InventoryStaff] THEN SHOW MSG03<br>ELSE load(ProductCatalogScreen) |
| (3) | BR182 | Validate Rules:<br>INPUT [sku], [productName], [categoryId], [brandId], [basePrice], [barcode]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF ProductRepository.existsBySKU([sku]) THEN SHOW MSG05<br>IF [basePrice] < 0 THEN SHOW MSG05<br>IF CategoryRepository.findById([categoryId]) == NULL THEN SHOW MSG05 |
| (4) | BR183 | Saving Rules:<br>IF [productId] == NULL THEN createProduct(INPUT)<br>ELSE updateProduct([productId], INPUT)<br>WRITE AuditLog(action = SAVE_PRODUCT)<br>SHOW MSG01 |

### UC19: Update Inventory Stock Level

| Name | Update Inventory Stock Level |
| --- | --- |
| Description | Update inventory quantity. |
| Actor | Inventory Staff |
| Trigger | Inventory adjustment occurs. |
| Pre-condition | Product inventory exists. |
| Post-condition | Inventory quantity is updated. |
| Priority | Medium |

#### Activities Flow

Figure 19: Yes/No Activity Flow Diagram - UC19 Update Inventory Stock Level

#### Alternative / Exception Flow

- No branch: Show not found.

- No branch: Show invalid quantity.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR191 | Inventory Lookup Rules:<br>[inventory] = InventoryRepository.findByStoreAndProduct([storeId], [productId])<br>IF [inventory] == NULL THEN SHOW MSG05<br>ELSE loadAdjustmentForm([inventory]) |
| (3) | BR192 | Validate Rules:<br>INPUT [adjustmentType], [quantity], [reason]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF [quantity] < 0 THEN SHOW MSG05<br>IF [adjustmentType] == DECREASE AND [inventory.qty] < [quantity] THEN SHOW MSG05 |
| (4) | BR193 | Update Rules:<br>IF [adjustmentType] == INCREASE THEN [inventory.qty] += [quantity]<br>ELSE IF [adjustmentType] == DECREASE THEN [inventory.qty] -= [quantity]<br>InventoryMovementRepository.save([inventory], [quantity], [reason])<br>InventoryRepository.save([inventory])<br>SHOW MSG01 |

### UC20: Create Inter-store Transfer

| Name | Create Inter-store Transfer |
| --- | --- |
| Description | Create inventory transfer request. |
| Actor | Inventory Staff |
| Trigger | Replenishment requirement occurs. |
| Pre-condition | Source inventory is available. |
| Post-condition | Transfer request is created. |
| Priority | Medium |

#### Activities Flow

Figure 20: Yes/No Activity Flow Diagram - UC20 Create Inter-store Transfer

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Highlight missing fields.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR201 | Transfer Request Rules:<br>INPUT [sourceStoreId], [destinationStoreId], [items]<br>IF [sourceStoreId] == [destinationStoreId] THEN SHOW MSG05<br>IF [items] IS EMPTY THEN SHOW MSG02 |
| (4) | BR202 | Stock Validation Rules:<br>FOR EACH [item] IN [items]:<br>    [available] = InventoryService.availableQty(sourceStoreId, item.productId)<br>    IF [available] < [item.quantity] THEN SHOW MSG05 AND STOP PROCESS |
| (5) | BR203 | Saving Rules:<br>[transfer.id] = autoGenerate()<br>[transfer.status] = PENDING_APPROVAL<br>[transfer.createdBy] = currentUser.id<br>TransferRepository.save([transfer])<br>NotificationService.notifyApprover([transfer])<br>SHOW MSG01 |

### UC21: Approve Transfer

| Name | Approve Transfer |
| --- | --- |
| Description | Approve or reject transfer requests. |
| Actor | Store Manager, District Manager |
| Trigger | Manager reviews transfer request. |
| Pre-condition | Transfer request exists. |
| Post-condition | Transfer status is updated. |
| Priority | Medium |

#### Activities Flow

Figure 21: Yes/No Activity Flow Diagram - UC21 Approve Transfer

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Mark rejected.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR211 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [StoreManager, DistrictManager] THEN SHOW MSG03<br>ELSE loadTransferDetail([transferId]) |
| (3) | BR212 | Decision Rules:<br>[transfer] = TransferRepository.findById([transferId])<br>IF [transfer] == NULL THEN SHOW MSG05<br>IF [transfer.status] != PENDING_APPROVAL THEN SHOW MSG05<br>IF decision NOT IN [APPROVE, REJECT] THEN SHOW MSG05 |
| (4) | BR213 | Update Rules:<br>IF decision == APPROVE THEN<br>    [transfer.status] = APPROVED<br>    InventoryService.moveStock(transfer.items)<br>ELSE<br>    [transfer.status] = REJECTED<br>TransferRepository.save([transfer])<br>NotificationService.notifyRequester([transfer])<br>SHOW MSG01 |

### UC22: Generate Store Report

| Name | Generate Store Report |
| --- | --- |
| Description | Generate store-level operational report. |
| Actor | Store Manager |
| Trigger | Manager requests store report. |
| Pre-condition | Store data exists. |
| Post-condition | Store report is generated. |
| Priority | Medium |

#### Activities Flow

Figure 22: Yes/No Activity Flow Diagram - UC22 Generate Store Report

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show generation error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR221 | Input Rules:<br>INPUT [storeId], [reportType], [fromDate], [toDate]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF [fromDate] > [toDate] THEN SHOW MSG05 |
| (2) | BR222 | Data Rules:<br>[data] = ReportService.collectStoreData([storeId], [reportType], [dateRange])<br>IF [data] IS EMPTY THEN showEmptyReport()<br>ELSE generateReportModel([data]) |
| (3) | BR223 | Output Rules:<br>[report] = ReportRenderer.render([reportModel])<br>ReportRepository.save([report])<br>DISPLAY [report.summary]<br>SHOW MSG01 |

### UC23: Generate Chain Report

| Name | Generate Chain Report |
| --- | --- |
| Description | Generate consolidated multi-store report. |
| Actor | Admin, District Manager |
| Trigger | User requests consolidated report. |
| Pre-condition | Multi-store data exists. |
| Post-condition | Chain report is generated. |
| Priority | Medium |

#### Activities Flow

Figure 23: Yes/No Activity Flow Diagram - UC23 Generate Chain Report

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show generation error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR231 | Scope Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, DistrictManager] THEN SHOW MSG03<br>[scope] = getChainScope([currentUser]) |
| (2) | BR232 | Aggregation Rules:<br>FOR EACH [store] IN [scope.stores]:<br>    [storeData] = ReportService.collectStoreData([store], [dateRange])<br>    append([storeData], [chainData])<br>IF synchronizationIncomplete THEN showWarningMessage() |
| (4) | BR233 | Report Rules:<br>[report] = ReportService.generateConsolidatedReport([chainData])<br>ReportRepository.save([report])<br>DISPLAY [report.analyticsSummary]<br>SHOW MSG01 |

### UC24: View Real-time Analytics

| Name | View Real-time Analytics |
| --- | --- |
| Description | Monitor live analytics dashboard. |
| Actor | Admin, District Manager |
| Trigger | User opens analytics dashboard. |
| Pre-condition | Analytics service is active. |
| Post-condition | Real-time analytics are displayed. |
| Priority | Medium |

#### Activities Flow

Figure 24: Yes/No Activity Flow Diagram - UC24 View Real-time Analytics

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show retrieval error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR241 | Access Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, DistrictManager] THEN SHOW MSG03<br>ELSE openAnalyticsDashboard() |
| (2) | BR242 | Streaming Rules:<br>metrics = AnalyticsService.subscribe(scope)<br>IF AnalyticsService.status != AVAILABLE THEN SHOW MSG06<br>ELSE updateDashboard(metrics) |
| (3) | BR243 | Refresh Rules:<br>WHILE dashboardIsOpen:<br>    RECEIVE metricsEvent<br>    updateChart(metricsEvent)<br>    IF event.type == ALERT THEN highlightAlert(event) |

### UC25: Set Low-stock Alert Threshold

| Name | Set Low-stock Alert Threshold |
| --- | --- |
| Description | Configure low-stock threshold. |
| Actor | Admin, Store Manager |
| Trigger | User configures alert settings. |
| Pre-condition | Product inventory exists. |
| Post-condition | Threshold is stored. |
| Priority | Medium |

#### Activities Flow

Figure 25: Yes/No Activity Flow Diagram - UC25 Set Low-stock Alert Threshold

#### Alternative / Exception Flow

- No branch: Show permission denied.

- No branch: Show validation error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR251 | Permission Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, StoreManager] THEN SHOW MSG03<br>ELSE loadThresholdConfiguration() |
| (2) | BR252 | Validate Rules:<br>INPUT [productId], [storeId], [thresholdQty]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF [thresholdQty] < 0 THEN SHOW MSG05<br>IF ProductRepository.findById([productId]) == NULL THEN SHOW MSG05 |
| (4) | BR253 | Saving Rules:<br>[alertRule] = AlertRuleRepository.findOrCreate([productId], [storeId])<br>[alertRule.thresholdQty] = [thresholdQty]<br>[alertRule.status] = ACTIVE<br>AlertRuleRepository.save([alertRule])<br>SHOW MSG01 |

### UC26: Receive Low-stock Notification

| Name | Receive Low-stock Notification |
| --- | --- |
| Description | Receive low-stock notification. |
| Actor | Inventory Staff, System |
| Trigger | Inventory falls below threshold. |
| Pre-condition | Threshold is configured. |
| Post-condition | Notification is delivered. |
| Priority | Medium |

#### Activities Flow

Figure 26: Yes/No Activity Flow Diagram - UC26 Receive Low-stock Notification

#### Alternative / Exception Flow

- No branch: Continue monitoring.

- No branch: Retry and log.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR261 | Monitoring Rules:<br>FOR EACH [inventory] IN InventoryRepository.findAllActive():<br>    [threshold] = AlertRuleRepository.findByInventory([inventory])<br>    IF [inventory.qty] <= [threshold.qty] THEN generateLowStockEvent([inventory]) |
| (3) | BR262 | Notification Rules:<br>[event] = LowStockEvent<br>[receivers] = UserRepository.findInventoryStaffByStore(event.storeId)<br>FOR EACH [receiver] IN [receivers]:<br>    NotificationService.send(receiver, event.message) |
| (5) | BR263 | Retry Rules:<br>IF NotificationService.sendStatus == FAILED THEN<br>    retry(max = 3)<br>    IF stillFailed THEN WRITE AuditLog(action = NOTIFICATION_FAILED) |

### UC27: Manage Complaints

| Name | Manage Complaints |
| --- | --- |
| Description | Submit and handle complaints. |
| Actor | Admin, Store Manager, Loyalty Member |
| Trigger | Customer or staff creates complaint. |
| Pre-condition | Complaint information is submitted. |
| Post-condition | Complaint status is updated. |
| Priority | Medium |

#### Activities Flow

Figure 27: Yes/No Activity Flow Diagram - UC27 Manage Complaints

#### Alternative / Exception Flow

- No branch: Request details.

- No branch: Keep pending.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR271 | Create Complaint Rules:<br>INPUT [subject], [description], [proof], [createdBy]<br>IF [subject] IS NULL OR [description] IS NULL THEN SHOW MSG02<br>[complaint.status] = OPEN<br>ComplaintRepository.save([complaint]) |
| (3) | BR272 | Handling Rules:<br>[currentUser] = getUserFromJWT()<br>IF [currentUser.role] NOT IN [Admin, StoreManager] THEN SHOW MSG03<br>[complaint] = ComplaintRepository.findById([complaintId])<br>IF [complaint] == NULL THEN SHOW MSG05 |
| (4) | BR273 | Resolution Rules:<br>INPUT [resolutionNote], [newStatus]<br>IF [newStatus] NOT IN [IN_PROGRESS, RESOLVED, REJECTED] THEN SHOW MSG05<br>[complaint.status] = [newStatus]<br>[complaint.resolutionNote] = [resolutionNote]<br>ComplaintRepository.save([complaint])<br>NotificationService.notifyComplaintOwner([complaint]) |

### UC28: Export Report

| Name | Export Report |
| --- | --- |
| Description | Export generated reports. |
| Actor | Admin, District Manager, Store Manager |
| Trigger | User selects export function. |
| Pre-condition | Report has been generated. |
| Post-condition | Report file is exported. |
| Priority | Medium |

#### Activities Flow

Figure 28: Yes/No Activity Flow Diagram - UC28 Export Report

#### Alternative / Exception Flow

- No branch: Show missing report.

- No branch: Show export error.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR281 | Format Rules:<br>INPUT [reportId], [format]<br>IF [format] NOT IN [PDF, XLSX, CSV] THEN SHOW MSG05<br>[report] = ReportRepository.findById([reportId])<br>IF [report] == NULL THEN SHOW MSG05 |
| (2) | BR282 | Export Rules:<br>SWITCH ([format])<br>    CASE PDF: [file] = PdfExporter.export([report])<br>    CASE XLSX: [file] = ExcelExporter.export([report])<br>    CASE CSV: [file] = CsvExporter.export([report]) |
| (3) | BR283 | Download Rules:<br>IF [file] == NULL THEN SHOW MSG06<br>ELSE<br>    [downloadUrl] = FileStorage.saveAndGenerateUrl([file])<br>    DISPLAY [downloadUrl]<br>    SHOW MSG08 |

### UC29: A/B Test Pricing

| Name | A/B Test Pricing |
| --- | --- |
| Description | Compare pricing strategies. |
| Actor | Admin, District Manager |
| Trigger | User initiates pricing experiment. |
| Pre-condition | Pricing strategies are configured. |
| Post-condition | Experiment result is recorded. |
| Priority | Medium |

#### Activities Flow

Figure 29: Yes/No Activity Flow Diagram - UC29 A/B Test Pricing

#### Alternative / Exception Flow

- No branch: Show config error.

- No branch: Show incomplete data.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR291 | Experiment Setup Rules:<br>INPUT [productList], [variantA], [variantB], [startDate], [endDate]<br>IF requiredFieldsAreBlank(INPUT) THEN SHOW MSG02<br>IF [startDate] >= [endDate] THEN SHOW MSG05<br>IF [variantA.price] == [variantB.price] THEN SHOW MSG05 |
| (3) | BR292 | Execution Rules:<br>FOR EACH [product] IN [productList]:<br>    assignTrafficSplit(product, variantA, variantB)<br>    PricingExperimentRepository.saveAssignment(product)<br>collectSalesDataUntil([endDate]) |
| (5) | BR293 | Analysis Rules:<br>[result] = AnalyticsService.compareRevenue(variantA, variantB)<br>IF [result.sampleSize] < CONFIG.minSampleSize THEN showIncompleteAnalysis()<br>ELSE generateExperimentReport([result]) |

### UC30: Rollback Price Change

| Name | Rollback Price Change |
| --- | --- |
| Description | Restore previous product price. |
| Actor | Admin |
| Trigger | Admin initiates rollback operation. |
| Pre-condition | Historical pricing data exists. |
| Post-condition | Previous price is restored. |
| Priority | Medium |

#### Activities Flow

Figure 30: Yes/No Activity Flow Diagram - UC30 Rollback Price Change

#### Alternative / Exception Flow

- No branch: Show rollback error.

- No branch: Cancel operation.

- When an exception occurs, the system displays the appropriate message and allows the actor to correct input, retry, or cancel the operation.

#### Business Rules

| Activity | BR Code | Description |
| --- | --- | --- |
| (1) | BR301 | History Rules:<br>INPUT [productId], [priceVersionId]<br>[history] = PriceHistoryRepository.findById([priceVersionId])<br>IF [history] == NULL THEN SHOW MSG05<br>IF [history.productId] != [productId] THEN SHOW MSG05 |
| (3) | BR302 | Confirm Rules:<br>SHOW confirmRollbackMessage([history.oldPrice])<br>IF userClicksCancel THEN STOP PROCESS<br>ELSE continueRollback() |
| (4) | BR303 | Rollback Rules:<br>ProductPriceRepository.update([productId], [history.oldPrice])<br>PriceHistoryRepository.save(currentPrice, history.oldPrice, reason = ROLLBACK)<br>POSSyncService.publishPriceUpdate([productId], [history.oldPrice])<br>WRITE AuditLog(action = ROLLBACK_PRICE)<br>SHOW MSG01 |

## 2.2 List Description

List descriptions shall define data fields, filters, sorting options, pagination rules, and available actions for each major list screen, including users, stores, products, inventory, transactions, promotions, pricing rules, transfers, reports, and complaints.

## 2.3 View Description

View descriptions shall define screen layout, input fields, display fields, validation behavior, buttons, navigation, and error messages for each major module.

# 3. Non-functional Requirements

## 3.1 User Access and Security

- The system shall support JWT authentication.

- The system shall support role-based access control (RBAC).

- Passwords must be encrypted before storage.

- Sensitive operations such as price changes, inventory adjustments, transfers, and user permission changes must be recorded in audit logs.

- Sessions shall expire automatically after inactivity.

- The system shall support HTTPS communication.

- APIs shall support rate limiting and monitoring for failed login attempts.

## 3.2 Performance Requirements

- The system shall support at least 5,000 concurrent users.

- POS transaction processing shall complete within 2 seconds under normal load.

- Dashboard loading time shall not exceed 3 seconds for standard reports.

- Dynamic pricing calculation latency shall be below 100 milliseconds per item batch where feasible.

- Inventory synchronization shall occur in near real-time.

## 3.3 Availability and Reliability

- The platform shall target 99.99% uptime for production operation.

- Database replication and failover mechanisms shall be implemented.

- The system shall support automated backup and disaster recovery.

- Monitoring systems shall detect failures and notify administrators automatically.

## 3.4 Implementation Requirements

- Frontend shall use ReactJS.

- Backend shall use Node.js and ExpressJS.

- Database shall use PostgreSQL.

- Redis shall be used for caching.

- APIs shall follow RESTful architecture.

- Real-time communication shall use WebSocket technology where required.

- Docker shall be used for deployment.

# 4. Appendixes

## 4.1 Glossary

| Term | Definition |
| --- | --- |
| SRS | Software Requirements Specification |
| BRD | Business Requirements Document |
| UC | Use Case |
| BR | Business Rule |
| POS | Point-of-Sale |
| SKU | Stock Keeping Unit |
| JWT | JSON Web Token |
| RBAC | Role-Based Access Control |
| Dynamic Pricing | Automatic product price adjustment based on rules and operational data |
| Inventory Transfer | Movement of inventory between stores |
| Audit Log | Record of important system or user activities |

## 4.2 Messages

| Message Code | Message Content | Button |
| --- | --- | --- |
| MSG01 | Operation completed successfully. |  |
| MSG02 | You need to fill in all required fields. |  |
| MSG03 | You do not have permission to perform this action. |  |
| MSG04 | Invalid username or password. |  |
| MSG05 | Data validation failed. Please check your input. |  |
| MSG06 | System service is temporarily unavailable. Please try again later. |  |
| MSG07 | Are you certain with this decision? | OK/Cancel |
| MSG08 | Report exported successfully. |  |
| MSG09 | Inventory stock is below threshold. |  |
| MSG10 | Payment failed. Please retry another payment method. |  |

## 4.3 Issues List

1. Finalize payment gateway integration.

1. Confirm reporting BI tool.

1. Define disaster recovery policy.

1. Validate production infrastructure sizing.

1. Confirm real-time synchronization mechanism.
