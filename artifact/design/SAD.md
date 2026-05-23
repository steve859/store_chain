# SAD

_Source file: `SAD_Store_Chain_Revised_Theo_ADD_Template.docx`_

Store Chain Management System

Software Architecture Document (SAD)

Revised according to ADD and SAD Flight Booking Template

| Document Information | Value |
| --- | --- |
| Content Owner | Team |
| Document Number | SAD-SCMS-002 |
| Release / Revision | 2.0 |
| Release / Revision Date | 2026-05-24 |
| Project | Store Chain Management System |
| Source Alignment | ADD_Store_Chain_Revised_By_ASR.docx and corrected ASR workbook |

# Revision and Sign Off Sheet

## Change Record

| Author | Version | Change reference | Date |
| --- | --- | --- | --- |
| Team | 1.0 | Initial Store Chain SAD | 2026-05-14 |
| Team | 2.0 | Revised to follow Flight Booking SAD template and align with revised ADD/ASR | 2026-05-24 |

## Reviewers

| Name | Company | Version | Position | Date |
| --- | --- | --- | --- | --- |

# Table of Contents

1. Tổng quan về giải pháp

1.1. Mục tiêu của giải pháp

1.2. Phạm vi của hệ thống

1.3. Các bên liên quan chính

1.4. Bối cảnh kinh doanh và kỹ thuật

2. Kiến trúc tổng thể

2.1. Mô hình kiến trúc

2.2. Các thành phần chính và quan hệ

3. Các quyết định kiến trúc

3.1. Các quyết định quan trọng và lý do

3.2. Các ràng buộc kỹ thuật

3.3. Các nguyên tắc thiết kế

4. Kiến trúc logic

4.1. Các module chính

4.2. Luồng dữ liệu và xử lý

5. Kiến trúc vật lý

5.1. Tổng quan triển khai

5.2. Thành phần sử dụng

6. Bảo mật

6.1. Xác thực

6.2. Phân quyền

6.3. Bảo vệ API và dịch vụ

6.4. Mã hóa dữ liệu

6.5. Bảo vệ tài nguyên hạ tầng

6.6. Audit logging

7. Hiệu năng và khả năng mở rộng

7.1. Đảm bảo hiệu năng

7.2. Phương án mở rộng

7.3. Độ sẵn sàng và độ tin cậy

8. Rủi ro và phương án giảm thiểu

9. Traceability với ADD/ASR

# 1. Tổng quan về giải pháp.

## 1.1. Mục tiêu của giải pháp.

Mục tiêu cốt lõi của Store Chain Management System là xây dựng một nền tảng quản lý chuỗi cửa hàng bán lẻ tập trung, hỗ trợ vận hành nhiều cửa hàng, xử lý POS, quản lý tồn kho, khuyến mãi, loyalty, báo cáo và kiểm soát truy cập theo vai trò.

- Tối ưu quy trình vận hành cửa hàng: bán hàng tại POS, quản lý ca, quản lý giao dịch và xuất hóa đơn/biên nhận.

- Đảm bảo dữ liệu tồn kho, chuyển kho, pricing, promotion và loyalty được cập nhật nhất quán giữa các module.

- Cung cấp dashboard, báo cáo và analytics gần thời gian thực cho Store Manager, District Manager và Admin.

- Đảm bảo các yêu cầu chất lượng từ ADD: bảo mật, hiệu năng, khả dụng, tính dễ sửa đổi, tính toàn vẹn dữ liệu và auditability.

- Hỗ trợ mở rộng cho nhiều cửa hàng, nhiều terminal POS và tối thiểu 5,000 người dùng đồng thời theo ASR/ADD.

## 1.2. Phạm vi của hệ thống.

In-Scope (Những gì có trong phạm vi dự án):

- Đăng nhập, quản lý người dùng, cấu hình vai trò và phân quyền RBAC.

- Quản lý cửa hàng, dashboard theo store/region/chain và phạm vi truy cập.

- POS transaction: quét sản phẩm, áp dụng loyalty, promotion, thanh toán, giảm tồn kho và tạo receipt.

- Loyalty program: tính điểm, đổi điểm, nâng hạng, lưu lịch sử điểm.

- Promotion và dynamic pricing: tạo rule, áp dụng promotion, thực thi pricing, xem lịch sử giá, A/B testing và rollback giá.

- Quản lý product catalog, inventory stock, chuyển kho liên cửa hàng và phê duyệt transfer.

- Báo cáo store/chain, real-time analytics, export PDF/XLSX/CSV.

- Low-stock alert, complaint management, audit log và system settings.

Out-of-Scope (Những gì không trong phạm vi hiện tại):

- Tích hợp payment gateway online hoàn chỉnh; tài liệu chỉ thiết kế sẵn webhook/idempotency cho pha tương lai.

- Warehouse Management System chuyên sâu, demand forecasting bằng AI, hoặc ERP/accounting integration đầy đủ.

- Mobile native app; hệ thống hiện ưu tiên web frontend ReactJS.

## 1.3. Các bên liên quan chính.

| Stakeholder | Mối quan tâm chính |
| --- | --- |
| Business Owner | Bao phủ nghiệp vụ chuỗi cửa hàng, giảm rủi ro vận hành, theo dõi doanh thu và hiệu quả khuyến mãi. |
| Admin | Quản lý người dùng, vai trò, phân quyền, cấu hình hệ thống, audit và bảo mật. |
| District Manager | Xem dashboard chuỗi/khu vực, báo cáo tổng hợp, quản lý store và promotion/pricing theo phạm vi. |
| Store Manager | Theo dõi bán hàng, tồn kho, transfer, ca bán hàng, complaint và báo cáo cửa hàng. |
| Cashier | Checkout nhanh, giao diện POS đơn giản, xử lý lỗi rõ ràng, downtime thấp. |
| Inventory Staff | Cập nhật tồn kho, tạo transfer, nhận cảnh báo low-stock, kiểm soát stock movement. |
| Loyalty Member | Theo dõi điểm, redeem points, transaction history và complaint. |
| Developer/DevOps | Modularity, deployability, monitoring, rollback, recovery, performance tuning. |
| Auditor | Traceability, audit log, dữ liệu nhạy cảm, kiểm soát truy cập và lịch sử thay đổi. |

## 1.4. Bối cảnh kinh doanh và kỹ thuật.

Bối cảnh kinh doanh: Hệ thống phục vụ mô hình bán lẻ nhiều cửa hàng, nơi dữ liệu sản phẩm, tồn kho, giá, khuyến mãi, loyalty và báo cáo cần được quản lý thống nhất nhưng vẫn có phạm vi theo từng cửa hàng hoặc khu vực. Kiến trúc cần bảo vệ dữ liệu, đảm bảo POS nhanh và duy trì hoạt động liên tục trong giờ bán hàng.

Bối cảnh kỹ thuật: Theo ADD đã chỉnh, hệ thống sử dụng ReactJS cho frontend, Node.js/ExpressJS cho backend, PostgreSQL cho dữ liệu chính, Redis cho cache/job queue/PubSub, REST API, WebSocket khi cần realtime và Docker cho triển khai.

| Thành phần công nghệ | Vai trò trong hệ thống | Lý do lựa chọn |
| --- | --- | --- |
| ReactJS | Xây dựng giao diện web role-based | Phù hợp SPA, component reuse, dễ tạo POS/dashboard tương tác. |
| Node.js + ExpressJS | Backend REST API, middleware, domain module services | Nhẹ, phù hợp I/O, dễ tổ chức modular monolith và REST API. |
| PostgreSQL | Primary relational database | Đảm bảo ACID cho POS, inventory, loyalty, pricing và reports. |
| Redis | Cache, job queue, Pub/Sub, session/ephemeral data | Tăng hiệu năng catalog/pricing, xử lý notification/background job và realtime events. |
| WebSocket | Dashboard update, POS price feed, notification chọn lọc | Hỗ trợ cập nhật gần thời gian thực cho store-scoped rooms. |
| Docker | Đóng gói và triển khai | Tách biệt môi trường, hỗ trợ local dev và production packaging. |
| Prometheus/Grafana hoặc tương đương | Monitoring/alerting | Theo dõi latency, error rate, health check và sự cố availability. |

# 2. Kiến trúc tổng thể.

## 2.1. Mô hình kiến trúc.

Kiến trúc chính được đề xuất là modular monolith backend có ranh giới domain rõ ràng, kết hợp REST API, PostgreSQL transaction, Redis cache/job queue/PubSub và WebSocket cho realtime. Cách tiếp cận này phù hợp với ADD vì giữ được tính dễ sửa đổi theo module, giảm phức tạp vận hành so với microservice đầy đủ, đồng thời vẫn cho phép scale stateless API nodes.

- Frontend ReactJS giao tiếp với backend qua REST API dưới /api/v1 và WebSocket khi cần realtime.

- Backend ExpressJS được chia thành các domain modules: Auth, Users, Stores, POS, Inventory, Pricing, Promotions, Loyalty, Reports, Complaints, Audit Logs, Settings.

- PostgreSQL đảm bảo transaction cho các nghiệp vụ nhiều bước như checkout, transfer approval, loyalty redemption và price rollback.

- Redis phục vụ catalog cache, active promotion/pricing rule cache, job queue cho low-stock notification/report generation và Pub/Sub cho dashboard/POS updates.

- Load balancer và stateless API nodes hỗ trợ mở rộng ngang; database replication, Redis cluster và backup/DR hỗ trợ availability.

## 2.2. Các thành phần chính và quan hệ.

| Thành phần | Chức năng chính | Giao tiếp / Quan hệ |
| --- | --- | --- |
| Frontend ReactJS | Role-based UI, POS screen, dashboards, reports, forms | REST /api/v1, WebSocket store-scoped events. |
| Auth & RBAC Module | Login, JWT, role/permission, session expiry, failed login monitoring | Dùng bởi mọi protected route và frontend role layout. |
| Store & Dashboard Module | Store CRUD, store scope, dashboard KPI | Đọc transaction, inventory, reports; phân quyền theo store/region. |
| POS & Transaction Module | Checkout, payment recording, receipt, close shift, transaction history | Gọi Inventory, Promotion, Pricing, Loyalty; commit bằng PostgreSQL transaction. |
| Inventory & Transfer Module | Stock update, stock movement, low-stock threshold, inter-store transfer approval | Gọi Notification job, Audit Log, Reports. |
| Pricing & Promotion Module | Dynamic pricing, promotion eligibility, A/B testing, price history, rollback | Cache active rules ở Redis, publish price updates qua WebSocket/PubSub. |
| Loyalty Module | Calculate/redeem points, tier upgrade, loyalty ledger | Tham gia POS transaction và background jobs. |
| Reports & Analytics Module | Store/chain reports, realtime analytics, export PDF/XLSX/CSV | Đọc dữ liệu đã scope, hỗ trợ async job cho report nặng. |
| Complaints Module | Submit/handle complaint, resolution history | Ghi audit, gửi notification cho complaint owner. |
| Audit Log Module | Append-only trace cho sensitive operations | Được gọi bởi Auth, Users, Pricing, Inventory, Transfers, Reports, Complaints. |
| PostgreSQL | Lưu dữ liệu transactional và master data | Truy cập qua repositories/services; dùng transaction và read replica. |
| Redis | Cache, queue, Pub/Sub, ephemeral session/token data | Giảm tải DB, xử lý job và realtime fan-out. |

# 3. Các quyết định kiến trúc.

## 3.1. Các quyết định quan trọng và lý do.

| ID Quyết định | Tuyên bố quyết định | Lý do liên kết với ADD/ASR | Trade-off chính |
| --- | --- | --- | --- |
| AD-001 | Áp dụng modular monolith với domain module rõ ràng | ADD yêu cầu modifiability: pricing, promotion, loyalty, inventory rule thay đổi cục bộ; phù hợp quy mô đồ án và giảm độ phức tạp vận hành. | Không độc lập deploy từng service như microservice; cần discipline về module boundary. |
| AD-002 | REST API chuẩn hóa dưới /api/v1 | SRS/ADD yêu cầu RESTful architecture, dễ tích hợp frontend và tài liệu hóa API. | Cần versioning và backward compatibility khi API thay đổi. |
| AD-003 | JWT + RBAC + store-scoped authorization | Đáp ứng security: 100% protected endpoints yêu cầu JWT và role/store scope. | Token revocation cần cơ chế hỗ trợ nếu muốn thu hồi tức thời. |
| AD-004 | PostgreSQL làm primary database với transaction boundary | Đảm bảo consistency cho checkout, inventory, loyalty, transfer và rollback. | Cần thiết kế index và transaction cẩn thận để tránh lock lâu. |
| AD-005 | Redis cho cache, job queue và Pub/Sub | Đáp ứng performance/realtime/background job: catalog cache, price updates, low-stock notification. | Redis failure cần fallback, retry và monitoring. |
| AD-006 | WebSocket cho realtime dashboard/POS price feed | ADD yêu cầu dashboard updates, POS price synchronization và selected notifications. | Cần store-scoped room để tránh rò rỉ dữ liệu giữa cửa hàng. |
| AD-007 | Audit log append-only cho sensitive operations | Đáp ứng auditability và investigation cho user permission, stock, pricing, transfer, report export, complaint. | Tăng dung lượng lưu trữ và cần chính sách retention/search. |
| AD-008 | Rolling deployment và backward-compatible migration | Đáp ứng zero-downtime update và availability targets trong ADD. | Migration phải được thiết kế kỹ, có thể cần triển khai nhiều bước. |

## 3.2. Các ràng buộc kỹ thuật (Technical Constraints).

- Frontend bắt buộc dùng ReactJS; backend dùng Node.js và ExpressJS.

- PostgreSQL là database chính; Redis dùng cho cache, queues và Pub/Sub.

- API tuân thủ RESTful architecture và được version dưới /api/v1.

- Real-time communication dùng WebSocket cho dashboard update, POS price feed và notification khi cần.

- Docker được dùng cho môi trường local và production packaging.

- Security bắt buộc: JWT, RBAC, store-scoped authorization, HTTPS/TLS, encrypted password, rate limiting và audit logging.

- Availability mục tiêu 99.99% production; cần replication, failover, backup, monitoring/alerting và DR runbook.

- Performance: POS transaction <= 2 giây, dashboard <= 3 giây, dynamic pricing latency < 100ms per item batch khi khả thi, hỗ trợ 5,000 concurrent users.

## 3.3. Các nguyên tắc thiết kế (Design Principles).

- Separation of Concerns: mỗi domain module chịu trách nhiệm rõ ràng, không trộn logic POS, Inventory, Pricing, Reports.

- High Cohesion & Loose Coupling: service interface rõ ràng giữa các module, tránh truy cập dữ liệu chéo không kiểm soát.

- Security by Design: mọi endpoint protected kiểm tra JWT/RBAC/store scope; dữ liệu nhạy cảm mã hóa và audit log đầy đủ.

- Design for Failure: timeout, retry, circuit breaker, fallback khi Redis/external integration lỗi.

- Data Integrity First: các workflow ảnh hưởng nhiều entity dùng database transaction và idempotency key khi cần.

- Observable by Default: expose /health, /metrics, structured logs và alert cho latency/error/availability.

- Configuration over Code: thresholds, loyalty tiers, promotion/pricing parameters lưu trong settings/rule tables khi phù hợp.

- Backward Compatibility: API và migration cần hỗ trợ rolling deployment và rollback.

# 4. Kiến trúc logic.

## 4.1. Các Module chính.

| Module | Use Case liên quan | Trách nhiệm | Dữ liệu chính |
| --- | --- | --- | --- |
| Auth, Users, Roles | UC01-UC03 | Login, user CRUD, role/permission config, JWT, RBAC, failed login monitoring. | users, roles, permissions, sessions, login_attempts |
| Stores & Dashboard | UC04-UC05 | Create/update store, dashboard scope, KPI retrieval, inventory/sales summaries. | stores, store_assignments, dashboard_snapshots |
| POS & Transactions | UC06, UC07, UC16, UC17 | Checkout, loyalty link, close shift, transaction history, receipt generation. | transactions, transaction_items, payments, receipts, shifts |
| Loyalty | UC08-UC10 | Calculate points, redeem points, tier upgrade and loyalty ledger. | loyalty_members, loyalty_transactions, tier_history, policies |
| Promotions | UC11-UC12 | Promotion CRUD, eligibility, best benefit selection, discount calculation. | promotions, promotion_rules |
| Dynamic Pricing | UC13-UC15, UC29-UC30 | Pricing rules, scheduled execution, price history, A/B tests, rollback. | pricing_rules, price_history, pricing_experiments |
| Products & Inventory | UC18-UC19, UC25-UC26 | Product catalog, stock adjustment, low-stock threshold and notification. | products, categories, skus, inventories, stock_movements, alert_rules |
| Transfers | UC20-UC21 | Create transfer request, approve/reject, move stock atomically. | transfers, transfer_items, approvals |
| Reports & Analytics | UC22-UC24, UC28 | Store/chain report, realtime analytics, export PDF/XLSX/CSV. | reports, report_metadata, export_files, analytics_snapshots |
| Complaints & Governance | UC27 + audit | Complaint handling, resolution history, audit log and settings. | complaints, complaint_status_history, audit_logs, settings |

## 4.2. Luồng dữ liệu và xử lý.

### 4.2.1. POS Checkout

1. Cashier quét barcode; frontend thêm item vào cart và gọi /api/v1/pos/checkout.

2. Auth middleware xác thực JWT, RBAC và store scope.

3. POS service lấy giá hiện hành từ Redis/PostgreSQL, kiểm tra tồn kho, gọi Promotion/Pricing/Loyalty service.

4. PostgreSQL transaction tạo transaction/payment/receipt, trừ tồn kho, cập nhật loyalty ledger và ghi audit log.

5. Sau commit, hệ thống enqueue low-stock check job và emit inventory update qua WebSocket store room.

### 4.2.2. Dynamic Pricing Execution

1. Scheduler kích hoạt pricing rule đang active.

2. Pricing engine đọc demand/inventory/rule parameters, tính new price và kiểm tra min/max guardrail.

3. Nếu hợp lệ, ghi price_history, cập nhật product price và publish price update đến POS clients.

4. Nếu bị reject, ghi audit log PRICE_REJECTED.

### 4.2.3. Inter-store Transfer Approval

1. Inventory Staff tạo transfer request với source/destination store và danh sách items.

2. Store Manager hoặc District Manager xem chi tiết và quyết định approve/reject.

3. Khi approve, hệ thống kiểm tra stock và dùng transaction để trừ source, cộng destination, cập nhật transfer status.

4. Notification gửi cho requester; audit log ghi actor, decision và stock movement.

### 4.2.4. Low-stock Notification

1. Inventory monitoring job so sánh inventory.qty với alert threshold.

2. Khi qty <= threshold, tạo low-stock event và đưa vào Redis job queue.

3. Notification service gửi thông báo cho Inventory Staff theo store.

4. Nếu gửi thất bại, retry theo cấu hình; persistent failure được ghi audit/alert.

### 4.2.5. Report Export

1. User chọn report và format PDF/XLSX/CSV.

2. Report service kiểm tra role/store scope và filter/date range.

3. Nếu report nặng, enqueue job; nếu nhẹ, render trực tiếp.

4. File export được lưu kèm metadata và chỉ user có quyền mới tải được.

### 4.2.6. Login và Authorization

1. User gửi username/password.

2. Auth service validate input, kiểm tra user status, so sánh password hash và tạo JWT.

3. Frontend nhận role/scope để render dashboard/menu phù hợp.

4. Mọi request tiếp theo đều qua JWT middleware và RBAC/store-scope enforcement.

# 5. Kiến trúc vật lý.

## 5.1. Tổng quan triển khai.

Hệ thống hỗ trợ triển khai local bằng Docker Compose và production bằng các API node stateless sau load balancer. PostgreSQL và Redis không được public ra Internet; frontend giao tiếp với backend qua HTTPS. Observability được triển khai qua health check, metrics, centralized logs và alerting.

- Local development: React dev server, Express API, PostgreSQL và Redis chạy bằng Docker Compose.

- Production: WAF/DDoS protection phía trước Load Balancer; API nodes stateless có thể scale ngang.

- Database: PostgreSQL primary + read replica/failover; backup định kỳ, RPO/RTO theo ADD.

- Redis cluster: cache, queue, Pub/Sub và WebSocket adapter.

- Monitoring: /health, /metrics, log tập trung, dashboard và alert cho lỗi/latency.

## 5.2. Thành phần sử dụng.

| Thành phần | Công nghệ/Dịch vụ | Vai trò |
| --- | --- | --- |
| Frontend hosting | Static host/CDN hoặc web server | Phân phối React build, giảm latency cho assets. |
| Security perimeter | HTTPS/TLS, WAF, DDoS protection, rate limiting | Bảo vệ endpoint public và giới hạn lạm dụng. |
| Load Balancer | Nginx/Cloud LB | Điều phối traffic đến API nodes, health check routing. |
| Backend API | Node.js + ExpressJS Docker containers | Xử lý REST API, middleware, domain services. |
| Realtime | WebSocket service/Socket.IO hoặc tương đương | Store-scoped room cho dashboard/price/notification events. |
| Database | PostgreSQL primary + replica | Lưu transactional/master data, đảm bảo ACID và read scaling. |
| Caching/Queue/PubSub | Redis cluster | Cache catalog/pricing, queue notification/report jobs, Pub/Sub realtime. |
| Monitoring | Prometheus/Grafana hoặc tương đương | Scrape metrics, dashboard, alert latency/error/availability. |
| Logging | Centralized JSON log store | Lưu log 90 ngày hoặc theo policy; hỗ trợ điều tra sự cố. |
| CI/CD | GitHub Actions hoặc tương đương | Build, test, dependency/CVE scan, deploy/rollback. |
| Containerization | Docker/Docker Compose | Đóng gói và tạo môi trường nhất quán. |

# 6. Bảo mật.

## 6.1. Xác thực (Authenticate).

Người dùng cố gắng đăng nhập hoặc truy cập hệ thống. Auth module validate input, kiểm tra trạng thái tài khoản, so sánh mật khẩu đã hash với salt, tạo JWT có thời hạn, ghi log login success/failure và theo dõi failed-login rate. Response measure: 100% protected endpoint yêu cầu JWT; login xử lý trong mục tiêu hiệu năng; tất cả login attempts được ghi log.

## 6.2. Phân quyền (Authorization).

RBAC và store-scoped authorization được áp dụng trên backend cho Admin, District Manager, Store Manager, Cashier, Inventory Staff và Loyalty Member. Frontend chỉ render module phù hợp role nhưng backend vẫn là nơi enforcement cuối cùng. Response measure: 100% unauthorized access bị chặn và log; permission change ghi audit log.

## 6.3. Bảo vệ API và dịch vụ.

Tất cả API production dùng HTTPS/TLS. Middleware áp dụng validation/sanitization, rate limiting, CORS, request logging và error handling. Endpoint nhạy cảm như pricing rollback, transfer approval, report export phải kiểm tra role/scope và audit. Webhook payment tương lai phải verify signature và idempotency key.

## 6.4. Mã hóa dữ liệu.

Password được hash bằng thuật toán mạnh có salt. PII và dữ liệu nhạy cảm được mã hóa at rest theo chính sách. API keys/secrets không nằm trong source code, được quản lý bằng secret manager hoặc cơ chế tương đương. Backup và export file cần quyền truy cập phù hợp.

## 6.5. Bảo vệ tài nguyên hạ tầng.

Database và Redis chỉ mở trong private network. Admin/monitoring consoles được giới hạn IP/role. Không commit secrets. Server/container image được scan CVE. Health/metrics endpoint được bảo vệ phù hợp để tránh lộ thông tin nhạy cảm.

## 6.6. Audit logging.

Các thao tác nhạy cảm gồm quản lý user/role, store update, stock adjustment, transfer approval, pricing change, rollback, report export và complaint resolution phải tạo audit log append-only với actor, action, entity, timestamp, old/new value, result và request source.

| Vai trò | Trách nhiệm chính | Ví dụ quyền hạn cụ thể |
| --- | --- | --- |
| Admin | Quản trị toàn hệ thống | Manage Users, Configure Roles, Store Management, Pricing Rollback, Reports, Audit Logs. |
| District Manager | Quản lý theo khu vực/chuỗi | Dashboard khu vực, Promotion/Pricing, Chain Report, Transfer Approval. |
| Store Manager | Quản lý cửa hàng | Store Dashboard, Close Shift, Inventory, Transfer Approval, Complaints, Store Report. |
| Cashier | Bán hàng tại POS | Create POS Transaction, Apply Loyalty, Redeem Points, View Transaction History theo scope. |
| Inventory Staff | Quản lý tồn kho | Update Stock, Create Transfer, Receive Low-stock Notification. |
| Loyalty Member | Tương tác khách hàng | View history/points, redeem points theo policy, submit complaint. |

# 7. Hiệu năng và khả năng mở rộng.

## 7.1. Đảm bảo hiệu năng.

- Redis cache cho catalog, active promotion/pricing rules và dashboard data có tần suất đọc cao.

- Index PostgreSQL trên SKU, barcode, product name, store_id, transaction date, status và các khóa ngoại chính.

- Pagination cho product search, transaction history, audit log và report listing.

- Background job cho report nặng, notification và các tác vụ không cần trả lời đồng bộ.

- Giữ POS critical path ngắn; promotion/pricing/loyalty calculation được tối ưu để checkout <= 2 giây under normal load.

- Prometheus-compatible metrics theo dõi latency P95, error rate, queue depth, DB connection pool và cache hit rate.

## 7.2. Phương án mở rộng.

- Mở rộng ngang API nodes vì backend stateless; load balancer phân phối traffic.

- PostgreSQL read replica phục vụ report/read-heavy workloads; primary xử lý transaction writes.

- Redis cluster để tăng khả năng chịu tải cache/queue/PubSub.

- Tách worker pool cho report generation, notification và low-stock monitoring để không ảnh hưởng request path.

- Backpressure/rate limiting cho report export lớn hoặc API có nguy cơ bị lạm dụng.

## 7.3. Độ sẵn sàng và độ tin cậy.

- Production uptime target 99.99% theo ADD/ASR, với full HA setup.

- MTTR mục tiêu < 30 phút; RPO < 1 giờ; RTO < 4 giờ cho disaster recovery.

- Health checks /health cho load balancer; metrics /metrics cho monitoring.

- Automated backup, replication, failover procedure và DR runbook được kiểm thử định kỳ.

- Retry và circuit breaker cho integration/external dependencies; lỗi được log và alert.

# 8. Rủi ro và phương án giảm thiểu.

| Rủi ro | Mô tả | Ảnh hưởng | Giảm thiểu | Xử lý khi xảy ra |
| --- | --- | --- | --- | --- |
| Redis không khả dụng | Mất cache, queue hoặc Pub/Sub làm chậm POS/dashboard/notification. | Cao | Redis cluster, TTL hợp lý, fallback đọc DB, monitor queue depth. | Fallback sang DB, tạm dừng job không critical, alert DevOps, khôi phục Redis. |
| PostgreSQL lỗi hoặc mất kết nối | Core transaction không thể ghi/đọc ổn định. | Rất cao | Replication, backup, connection pool, failover test. | Failover sang replica, khôi phục snapshot, kiểm tra data consistency. |
| POS checkout chậm trong giờ cao điểm | Checkout vượt 2 giây ảnh hưởng cashier và khách hàng. | Cao | Cache catalog/rules, tối ưu index, tách background job, load test. | Tăng API nodes/workers, giảm report jobs, theo dõi bottleneck. |
| Sai lệch tồn kho hoặc loyalty balance | Transaction lỗi giữa POS, Inventory, Loyalty gây dữ liệu không nhất quán. | Rất cao | PostgreSQL transactions, stock validation, idempotency, audit log. | Chạy reconciliation, rollback/compensating transaction, điều tra audit log. |
| Rò rỉ JWT hoặc lạm dụng quyền | Người dùng trái phép truy cập dữ liệu store/report. | Cao | Token expiry, HTTPS, RBAC/store scope, audit, monitoring failed access. | Thu hồi session/token nếu có, rotate secrets, điều tra log, vá lỗi scope. |
| Dynamic pricing áp giá sai | Rule lỗi hoặc rollback không đồng bộ đến POS. | Cao | Guardrail min/max price, price history, approval/audit, PubSub sync. | Rollback price, publish update lại, thông báo affected stores, audit incident. |
| Report/analytics không chính xác | Báo cáo lệch do filter/sync hoặc quyền truy cập sai. | Trung bình-Cao | Controlled report service, scope checks, metadata, warning khi sync incomplete. | Regenerate report, sửa aggregation, thông báo người dùng nếu report đã export sai. |
| Deployment gây downtime | Migration hoặc release lỗi ảnh hưởng cửa hàng đang hoạt động. | Cao | Rolling deployment, backward-compatible migration, health checks, rollback. | Rollback version, pause migrations, restore backup nếu cần. |
| Low-stock notification không gửi | Inventory Staff không nhận cảnh báo replenishment. | Trung bình | Queue retry, audit failed notification, monitoring provider. | Retry thủ công/tự động, alert manager, kiểm tra notification provider. |

# 9. Traceability với ADD/ASR.

Bảng sau cho thấy SAD sau chỉnh sửa đã bám theo các quality attributes và architectural representation trong ADD đã chỉnh theo ASR.

| ADD/ASR concern | SAD coverage | Ghi chú |
| --- | --- | --- |
| Security: Authentication, Authorization, Data Protection, Audit Logging | Section 3.2, 6.1-6.6 | JWT, RBAC, store scope, HTTPS/TLS, encrypted data, append-only audit. |
| Performance: POS <= 2s, Dashboard <= 3s, Pricing <100ms | Section 2, 4.2, 7.1 | Cache, index, async jobs, optimized POS critical path. |
| Scalability: 5,000 concurrent users | Section 2.1, 5.1, 7.2 | Stateless API nodes, LB, Redis, read replicas. |
| Usability: POS/inventory/report workflows | Section 1.1, 4.2, 6 role table | Role-based UI, validation, clear messages. |
| Interoperability: scanner, report export, future payment gateway | Section 2.2, 4.2, 5.2, 6.3 | Barcode input, PDF/XLSX/CSV, webhook design. |
| Modifiability: pricing/promotion/loyalty/rules | Section 3.1, 3.3, 4.1 | Domain modules, rule/config tables, low-impact changes. |
| Availability/Reliability: failover, backups, monitoring | Section 5, 7.3, 8 | Health checks, metrics, replication, RPO/RTO, DR runbook. |
| Data Integrity: POS, inventory, loyalty, transfer, rollback | Section 3.1, 4.2, 8 | PostgreSQL transactions, idempotency, audit and reconciliation. |
