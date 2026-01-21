import { Router, Request, Response } from 'express';
import { ReportsService } from './reports.service';
import { authenticateToken } from '../../middlewares/auth.middleware'; // Sửa path nếu cần
import { authorizeRoles } from '../../middlewares/rbac.middleware';   // Sửa path nếu cần

const router = Router();

router.use(authenticateToken);

// Helper để parse ngày tháng từ query param
const parseDates = (req: Request) => {
  const { from, to } = req.query;
  // Dashboard thường hiển thị theo "tháng hiện tại", nên mặc định lấy từ đầu tháng đến hiện tại.
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = from ? new Date(from as string) : startOfMonth;
  const endDate = to ? new Date(to as string) : now;
  return { startDate, endDate };
};

// Helper để xác định storeId
// - Nếu là Admin: Cho phép truyền storeId qua query (để Admin lọc từng store)
// - Nếu là Manager: Bắt buộc dùng storeId của chính user đó (không được xem store khác)
const getContextStoreId = (req: Request): number | undefined => {
  const user = (req as any).user; // Lấy từ middleware auth
  const queryStoreId = req.query.storeId ? parseInt(req.query.storeId as string) : undefined;

  if (user.role === 'ADMIN') {
    return queryStoreId; // Admin được quyền chọn store hoặc null (xem tất cả)
  }
  
  // Nếu là Store Manager/Cashier, ép buộc xem store của mình
  const userStoreId = user?.storeId ?? user?.store_id;
  const parsed = userStoreId === null || userStoreId === undefined ? undefined : Number(userStoreId);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * GET /api/reports/dashboard
 * Tổng hợp các chỉ số chính
 */
router.get('/dashboard', authorizeRoles(['ADMIN', 'STORE_MANAGER']), async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = parseDates(req);
    const storeId = getContextStoreId(req);

    const data = await ReportsService.getDashboardStats({ storeId, startDate, endDate });
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/reports/revenue-chart
 * Dữ liệu biểu đồ đường
 */
router.get('/revenue-chart', authorizeRoles(['ADMIN', 'STORE_MANAGER']), async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = parseDates(req);
    const storeId = getContextStoreId(req);

    const data = await ReportsService.getRevenueChart({ storeId, startDate, endDate });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/reports/top-products
 * Dữ liệu top sản phẩm bán chạy
 */
router.get('/top-products', authorizeRoles(['ADMIN', 'STORE_MANAGER']), async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = parseDates(req);
    const storeId = getContextStoreId(req);

    const data = await ReportsService.getTopSellingProducts({ storeId, startDate, endDate });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;