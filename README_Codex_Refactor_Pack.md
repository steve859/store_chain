# Codex Refactor Pack — Store Chain Management System

Bộ tài liệu này dùng để đưa vào repo trước khi yêu cầu Codex refactor code theo tài liệu kiến trúc.

## Cách đặt vào repo

Đặt các file ở đúng vị trí sau:

```text
<repo-root>/AGENTS.md
<repo-root>/PLANS.md
<repo-root>/docs/codex/architecture-target.md
<repo-root>/docs/codex/module-map.md
<repo-root>/docs/codex/api-route-map.md
<repo-root>/docs/codex/refactor-plan.md
<repo-root>/docs/codex/refactor-checklist.md
<repo-root>/docs/codex/test-verification.md
<repo-root>/docs/codex/codex-prompts.md
<repo-root>/docs/codex/repo-info-needed.md
<repo-root>/docs/codex/do-not-change.md
```

Nên đặt thêm các tài liệu gốc nếu có:

```text
<repo-root>/docs/architecture/SAD_Store_Chain_Revised_Theo_ADD_Template.docx
<repo-root>/docs/architecture/ADD_Store_Chain_Revised_By_ASR.docx
<repo-root>/docs/architecture/ASR_checked_corrected_with_SRS.xlsx
<repo-root>/docs/requirements/Completed_Store_Chain_SRS_With_Pseudocode_Business_Rules.docx
```

## Thứ tự dùng với Codex

1. Mở repo bằng VS Code/Codex đúng thư mục gốc có `.git`.
2. Đưa `AGENTS.md` vào root để Codex tự đọc quy tắc dự án.
3. Prompt đầu tiên: yêu cầu Codex chỉ phân tích repo, chưa sửa code.
4. Sau khi có báo cáo, yêu cầu refactor từng phase trong `docs/codex/refactor-plan.md`.
5. Sau mỗi phase, yêu cầu Codex chạy test/lint/build và ghi lại thay đổi.

## Mục tiêu refactor

Căn code theo kiến trúc Store Chain Management System:

- Frontend: ReactJS, role-based layouts.
- Backend: Node.js/ExpressJS, REST API `/api/v1`.
- Database: PostgreSQL.
- Cache/Queue/PubSub: Redis.
- Real-time: WebSocket.
- Deployment: Docker.
- Module hóa theo domain: Auth, Users, Stores, POS, Loyalty, Promotions, Pricing, Inventory, Transfers, Reports, Complaints, Audit Logs, Settings.

## Lưu ý quan trọng

Không yêu cầu Codex “refactor toàn bộ dự án” trong một prompt. Hãy chia nhỏ theo phase, vì refactor kiến trúc dễ làm hỏng build nếu sửa quá nhiều file cùng lúc.
