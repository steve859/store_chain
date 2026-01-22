# Store Chain (Backend + Frontend)

Hệ thống quản lý chuỗi cửa hàng (multi-store) gồm:
- **Backend**: Node.js + TypeScript + Express + Prisma + PostgreSQL (API + Swagger)
- **Frontend**: React + Vite (UI)

Tài liệu này hướng dẫn chạy **cho người mới**, chỉ cần làm theo từng bước.

## 1) Chuẩn bị (cài 1 lần)

Trên Windows, cài các phần mềm sau:
- **Git** (để tải source)
- **Node.js 20+** (khuyến nghị Node 20 LTS)
- **Docker Desktop** (để chạy PostgreSQL/Redis bằng Docker)
- (Tuỳ chọn) **VS Code**

## 2) Chạy nhanh (khuyến nghị): DB bằng Docker, BE+FE chạy local

### Bước A — Mở DB (PostgreSQL + Redis)

Mở PowerShell tại thư mục project `D:\Code\store_chain`, chạy:

```powershell
docker compose up -d postgres redis pgadmin
```

Kiểm tra nhanh:
- PostgreSQL: `localhost:5432`
- pgAdmin: `http://localhost:5050`

### Bước B — Chạy Backend API

Mở **Terminal 1**:

```powershell
cd .\backend
npm install
```

Tạo file env cho backend:
- Copy `backend/.env.example` → `backend/.env`
- Đảm bảo `DATABASE_URL` trỏ về Postgres docker:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/store_chain
JWT_SECRET=your-dev-secret
PORT=3000
```

Chạy migrate + seed (lần đầu rất nên làm):

```powershell
npx prisma migrate deploy --schema prisma/schema.prisma
npm run seed
```

Chạy backend:

```powershell
npm run dev
```

Kiểm tra backend:
- Health: `http://localhost:3000/health`
- Swagger UI: `http://localhost:3000/api-docs`

### Bước C — Chạy Frontend

Mở **Terminal 2**:

```powershell
cd .\frontend
npm install
npm run dev
```

Vite sẽ in ra URL kiểu như:
- `http://localhost:5173` (nếu port bận sẽ tự nhảy sang `5174`, `5175`...)

Frontend đã cấu hình proxy `/api/v1` và `/socket.io` về backend `http://localhost:3000` trong `frontend/vite.config.ts`.

### Bước D — Đăng nhập thử

Sau khi seed, có sẵn tài khoản demo:
- `admin@storechain.com` / `admin123`
- `manager01@storechain.com` / `manager123`
- `storemgr01@storechain.com` / `storemgr123`
- `cashier01@storechain.com` / `cashier123`
- `inventory01@storechain.com` / `inventory123`

## 3) Cách chạy bằng Docker (tuỳ chọn)

Chế độ này chạy **backend trong container**. Lưu ý: vẫn cần chạy **frontend** local (vì compose hiện chưa có service frontend).

Tại thư mục root:

```powershell
docker compose up -d --build
```

Sau đó chạy migrate + seed trong container `api`:

```powershell
docker compose exec api npx prisma migrate deploy --schema prisma/schema.prisma
docker compose exec api npm run seed
```

Backend sẽ ở `http://localhost:3000`.

## 4) Lỗi thường gặp (Troubleshooting)

### A) Frontend báo `ERR_CONNECTION_REFUSED` khi login
- Kiểm tra backend có đang chạy `http://localhost:3000/health` không.
- Nếu bạn vừa đổi `frontend/.env`, phải **tắt và chạy lại** `npm run dev` (Vite chỉ đọc `.env` lúc start).

### B) Backend báo `DATABASE_URL is not set`
- Bạn chưa tạo `backend/.env` hoặc thiếu biến `DATABASE_URL`.
- Đảm bảo Postgres đang chạy (`docker compose up -d postgres`).

### C) Port 3000/5173 bị chiếm
- Backend: đổi `PORT` trong `backend/.env` (ví dụ `3001`).
- Frontend: Vite tự đổi port; chỉ cần mở đúng URL mà Vite in ra.

### D) Migrate/Seed lỗi
- Thường do DB chưa chạy hoặc `DATABASE_URL` sai.
- Thử chạy lại: `npx prisma migrate deploy --schema prisma/schema.prisma`.

---

Nếu bạn muốn mình thêm script “chạy 1 lệnh bật cả backend+frontend” (dùng `concurrently`) hoặc update README trong `backend/` và `frontend/` để trỏ về tài liệu này, mình làm tiếp được.
