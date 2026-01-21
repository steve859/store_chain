import prisma from '../../db/prisma'; // Import instance Prisma dùng chung

interface ReportParams {
  storeId?: number; // Nếu Admin xem thì có thể null (xem tất cả), Manager thì bắt buộc
  startDate?: Date;
  endDate?: Date;
}

export const ReportsService = {
  // 1. Lấy tổng quan (Dashboard Summary Cards)
  getDashboardStats: async ({ storeId, startDate, endDate }: ReportParams) => {
    const now = new Date();
    const effectiveEndDate = endDate ?? now;

    // Nếu không truyền startDate/endDate từ router, mặc định theo tháng hiện tại
    const effectiveStartDate =
      startDate ?? new Date(effectiveEndDate.getFullYear(), effectiveEndDate.getMonth(), 1);

    const monthStart = effectiveStartDate;
    const monthEnd = effectiveEndDate;

    const dayStart = new Date(
      effectiveEndDate.getFullYear(),
      effectiveEndDate.getMonth(),
      effectiveEndDate.getDate(),
      0,
      0,
      0,
      0
    );
    const dayEnd = new Date(
      effectiveEndDate.getFullYear(),
      effectiveEndDate.getMonth(),
      effectiveEndDate.getDate(),
      23,
      59,
      59,
      999
    );

    const invoiceWhereMonth: any = {
      ...(storeId ? { store_id: storeId } : {}),
      created_at: { gte: monthStart, lte: monthEnd },
    };

    const invoiceWhereToday: any = {
      ...(storeId ? { store_id: storeId } : {}),
      created_at: { gte: dayStart, lte: dayEnd },
    };

    // Tổng doanh thu + số đơn trong tháng
    const revenueAgg = await prisma.invoices.aggregate({
      _sum: { total: true },
      _count: { id: true },
      where: invoiceWhereMonth,
    });

    // Low stock: tạm dùng ngưỡng < 10 (có thể nâng cấp sang min_stock theo variant sau)
    const lowStockCount = await prisma.inventories.count({
      where: {
        ...(storeId ? { store_id: storeId } : {}),
        quantity: { lt: 10 },
      },
    });

    // Line items để tính số lượng bán, top product, profit
    const lineItemsMonth = await prisma.invoice_items.findMany({
      where: {
        invoices: invoiceWhereMonth,
      },
      select: {
        quantity: true,
        unit_price: true,
        unit_cost: true,
        product_variants: {
          select: {
            cost_price: true,
            products: { select: { id: true, name: true } },
          },
        },
      },
    });

    const lineItemsToday = await prisma.invoice_items.findMany({
      where: {
        invoices: invoiceWhereToday,
      },
      select: {
        quantity: true,
      },
    });

    const productsSoldThisMonth = lineItemsMonth.reduce((sum, li) => sum + Number(li.quantity), 0);
    const productsSoldToday = lineItemsToday.reduce((sum, li) => sum + Number(li.quantity), 0);

    // Profit: (unit_price - unit_cost) * qty; fallback unit_cost -> variant.cost_price -> 0
    const profitThisMonth = lineItemsMonth.reduce((sum, li) => {
      const qty = Number(li.quantity);
      const unitPrice = Number(li.unit_price);
      const unitCost =
        li.unit_cost !== null && li.unit_cost !== undefined
          ? Number(li.unit_cost)
          : li.product_variants?.cost_price !== null && li.product_variants?.cost_price !== undefined
            ? Number(li.product_variants.cost_price)
            : 0;
      return sum + (unitPrice - unitCost) * qty;
    }, 0);

    // Top product theo số lượng bán trong tháng
    const productCount: Record<string, { name: string; quantity: number }> = {};
    for (const li of lineItemsMonth) {
      const product = li.product_variants?.products;
      if (!product?.id) continue;
      const key = String(product.id);
      if (!productCount[key]) {
        productCount[key] = { name: product.name, quantity: 0 };
      }
      productCount[key].quantity += Number(li.quantity);
    }
    const topProduct = Object.values(productCount).sort((a, b) => b.quantity - a.quantity)[0]?.name ?? 'N/A';

    // Top store theo tổng số lượng bán trong tháng
    const invoicesMonthWithItems = await prisma.invoices.findMany({
      where: invoiceWhereMonth,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        invoice_number: true,
        created_at: true,
        total: true,
        store_id: true,
        stores: { select: { name: true } },
        invoice_items: {
          select: {
            quantity: true,
            product_variants: { select: { products: { select: { name: true } } } },
          },
        },
      },
    });

    const storeCount: Record<string, { name: string; quantity: number }> = {};
    for (const inv of invoicesMonthWithItems) {
      const storeName = inv.stores?.name ?? 'Unknown';
      const key = String(inv.store_id ?? storeName);
      if (!storeCount[key]) storeCount[key] = { name: storeName, quantity: 0 };
      const invQty = inv.invoice_items.reduce((s, it) => s + Number(it.quantity), 0);
      storeCount[key].quantity += invQty;
    }
    const topStore = Object.values(storeCount).sort((a, b) => b.quantity - a.quantity)[0]?.name ?? 'N/A';

    // Recent orders: lấy 6 hóa đơn gần nhất (trong tháng) để hiển thị bảng
    const recentOrders = invoicesMonthWithItems.slice(0, 6).map(inv => {
      const items = inv.invoice_items.reduce((s, it) => s + Number(it.quantity), 0);
      const firstProduct =
        inv.invoice_items.find(it => it.product_variants?.products?.name)?.product_variants?.products?.name ??
        'N/A';

      return {
        id: inv.invoice_number ?? `INV-${inv.id}`,
        date: inv.created_at ? inv.created_at.toISOString().slice(0, 10) : null,
        store: inv.stores?.name ?? 'Unknown',
        product: firstProduct,
        items,
        amount: Number(inv.total ?? 0),
      };
    });

    return {
      // Backward compatible fields (nếu FE/BE khác đang dùng)
      totalRevenue: Number(revenueAgg._sum.total ?? 0),
      totalOrders: revenueAgg._count.id ?? 0,
      lowStockAlerts: lowStockCount,

      // Fields phù hợp dashboard FE hiện tại
      profitThisMonth,
      productsSoldToday,
      productsSoldThisMonth,
      ordersThisMonth: revenueAgg._count.id ?? 0,
      topProduct,
      topStore,
      recentOrders,
    };
  },

  // 2. Biểu đồ doanh thu theo thời gian (Line Chart)
  getRevenueChart: async ({ storeId, startDate, endDate }: ReportParams) => {
    const now = new Date();
    const effectiveEndDate = endDate ?? now;
    const effectiveStartDate =
      startDate ?? new Date(effectiveEndDate.getFullYear(), effectiveEndDate.getMonth(), 1);

    const where: any = {
      ...(storeId ? { store_id: storeId } : {}),
      created_at: { gte: effectiveStartDate, lte: effectiveEndDate },
    };

    const invoices = await prisma.invoices.findMany({
      where,
      select: { created_at: true, total: true },
      orderBy: { created_at: 'asc' },
    });

    const chartData: Record<string, number> = {};
    for (const inv of invoices) {
      if (!inv.created_at) continue;
      const dateKey = inv.created_at.toISOString().split('T')[0];
      chartData[dateKey] = (chartData[dateKey] || 0) + Number(inv.total ?? 0);
    }

    return Object.entries(chartData).map(([date, revenue]) => ({ date, revenue }));
  },

  // 3. Top sản phẩm bán chạy (Pie/Bar Chart)
  getTopSellingProducts: async ({ storeId, startDate, endDate }: ReportParams) => {
    const now = new Date();
    const effectiveEndDate = endDate ?? now;
    const effectiveStartDate =
      startDate ?? new Date(effectiveEndDate.getFullYear(), effectiveEndDate.getMonth(), 1);

    const invoiceWhere: any = {
      ...(storeId ? { store_id: storeId } : {}),
      created_at: { gte: effectiveStartDate, lte: effectiveEndDate },
    };

    const lineItems = await prisma.invoice_items.findMany({
      where: {
        invoices: invoiceWhere,
      },
      select: {
        quantity: true,
        line_total: true,
        product_variants: {
          select: {
            products: { select: { id: true, name: true } },
          },
        },
      },
    });

    const productStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
    for (const item of lineItems) {
      const product = item.product_variants?.products;
      if (!product?.id) continue;

      const pid = String(product.id);
      if (!productStats[pid]) {
        productStats[pid] = { name: product.name, quantity: 0, revenue: 0 };
      }

      productStats[pid].quantity += Number(item.quantity);
      productStats[pid].revenue += Number(item.line_total ?? 0);
    }

    return Object.values(productStats)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }
};