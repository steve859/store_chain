import prisma from '../../db/prisma';

// DTO Input
interface CreatePromotionDto {
  code: string;
  name: string;
  type: string; // e.g. 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: number;      // Frontend gửi number, DB lưu Decimal
  startDate: string | Date;
  endDate: string | Date;
}

interface UpdatePromotionDto {
  code?: string;
  name?: string;
  type?: string;
  value?: number;
  startDate?: string | Date;
  endDate?: string | Date;
  isActive?: boolean;
}

export const PromotionService = {
  // 1. Lấy danh sách
  getAllPromotions: async () => {
    return prisma.promotions.findMany({
      orderBy: { created_at: 'desc' }
    });
  },

  // 2. Lấy chi tiết
  getPromotionById: async (id: number) => {
    const promo = await prisma.promotions.findUnique({ where: { id } });
    if (!promo) throw new Error('Promotion not found');
    return promo;
  },

  // 3. TẠO KHUYẾN MÃI (Nhiều logic validate)
  createPromotion: async (data: CreatePromotionDto) => {
    // A. Validate Code trùng
    const existingCode = await prisma.promotions.findUnique({
      where: { code: data.code }
    });
    if (existingCode) throw new Error('Promotion code already exists.');

    // B. Validate Ngày tháng
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (start >= end) {
      throw new Error('Start date must be before end date.');
    }

    // C. Validate Giá trị hợp lệ
    if (data.value <= 0) {
      throw new Error('Discount value must be greater than 0.');
    }
    if (data.type === 'PERCENTAGE' && data.value > 100) {
      throw new Error('Percentage discount cannot exceed 100%.');
    }

    return prisma.promotions.create({
      data: {
        code: data.code,
        name: data.name,
        type: data.type,
        value: data.value,
        start_at: start,
        end_at: end,
        active: true,
      }
    });
  },

  // 4. CẬP NHẬT
  updatePromotion: async (id: number, data: UpdatePromotionDto) => {
    const promo = await prisma.promotions.findUnique({ where: { id } });
    if (!promo) throw new Error('Promotion not found');

    // Nếu sửa code, phải check trùng
    if (data.code && data.code !== promo.code) {
      const duplicate = await prisma.promotions.findUnique({
        where: { code: data.code }
      });
      if (duplicate) throw new Error('Promotion code already exists.');
    }

    // Nếu sửa ngày, phải check logic ngày
    const start = data.startDate ? new Date(data.startDate) : promo.start_at;
    const end = data.endDate ? new Date(data.endDate) : promo.end_at;

    if (!start || !end) {
      throw new Error('Start date and end date are required.');
    }

    if (start >= end) {
      throw new Error('Start date must be before end date.');
    }

    return prisma.promotions.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        start_at: start,
        end_at: end,
        ...(data.isActive !== undefined ? { active: data.isActive } : {}),
      }
    });
  },

  // 5. XÓA (Check xem đã dùng chưa - Tạm thời cho xóa hoặc Soft Delete tùy bạn)
  // Ở đây tôi làm xóa cứng cho đơn giản, sau này có bảng 'Order' thì check ràng buộc sau
  deletePromotion: async (id: number) => {
    return prisma.promotions.delete({
      where: { id }
    });
  },

  // 6. Helper: Kiểm tra mã có hợp lệ không (Dùng cho máy POS sau này)
  validateCode: async (code: string, orderTotal: number) => {
    void orderTotal;
    const promo = await prisma.promotions.findUnique({ where: { code } });
    
    if (!promo) throw new Error('Invalid coupon code.');
    if (!promo.active) throw new Error('This promotion is inactive.');
    
    const now = new Date();
    if ((promo.start_at && now < promo.start_at) || (promo.end_at && now > promo.end_at)) {
      throw new Error('This promotion is expired or not yet started.');
    }

    return promo;
  }
};