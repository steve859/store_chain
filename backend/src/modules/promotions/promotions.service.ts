import prisma from '../../db/prisma';
import { DiscountType } from '../../generated/prisma';

// DTO Input
interface CreatePromotionDto {
  code: string;
  name: string;
  type: DiscountType | string; // e.g. 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: number;      // Frontend gửi number, DB lưu Decimal
  minOrder?: number;
  maxDiscount?: number | null;
  scope?: 'all' | 'stores';
  stores?: string[];
  startDate: string | Date;
  endDate: string | Date;
}

interface UpdatePromotionDto {
  code?: string;
  name?: string;
  type?: DiscountType | string;
  value?: number;
  minOrder?: number;
  maxDiscount?: number | null;
  scope?: 'all' | 'stores';
  stores?: string[];
  startDate?: string | Date;
  endDate?: string | Date;
  isActive?: boolean;
  usageCount?: number;
}

const normalizeScope = (scope: unknown): 'all' | 'stores' => {
  const s = String(scope ?? 'all').toLowerCase();
  return s === 'stores' ? 'stores' : 'all';
};

const normalizeDiscountType = (type: unknown): DiscountType => {
  const t = String(type ?? '').toUpperCase();
  if (t === 'FIXED_AMOUNT') return DiscountType.FIXED_AMOUNT;
  return DiscountType.PERCENTAGE;
};

const normalizeStoreCodes = (stores: unknown): string[] => {
  if (!Array.isArray(stores)) return [];
  return stores
    .map((s) => String(s ?? '').trim())
    .filter((s) => s.length > 0);
};

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
    const discountType = normalizeDiscountType(data.type);
    if (discountType === DiscountType.PERCENTAGE && data.value > 100) {
      throw new Error('Percentage discount cannot exceed 100%.');
    }

    // D. Validate min/max/scope
    const minOrder = data.minOrder !== undefined && data.minOrder !== null ? Number(data.minOrder) : 0;
    if (!Number.isFinite(minOrder) || minOrder < 0) {
      throw new Error('minOrder must be a non-negative number.');
    }

    const maxDiscount = data.maxDiscount !== undefined ? data.maxDiscount : null;
    if (maxDiscount !== null && maxDiscount !== undefined) {
      const md = Number(maxDiscount);
      if (!Number.isFinite(md) || md < 0) {
        throw new Error('maxDiscount must be a non-negative number.');
      }
    }

    const scope = normalizeScope(data.scope);
    const storeCodes = normalizeStoreCodes(data.stores);
    if (scope === 'stores' && storeCodes.length === 0) {
      throw new Error('stores is required when scope is stores.');
    }

    return prisma.promotions.create({
      data: {
        code: data.code,
        name: data.name,
        type: discountType,
        value: data.value,
        min_order_value: minOrder,
        max_discount: maxDiscount === null || maxDiscount === undefined ? null : Number(maxDiscount),
        start_date: start,
        end_date: end,
        is_active: true,
        scope,
        store_codes: storeCodes,
        updated_at: new Date(),
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
    const start = data.startDate ? new Date(data.startDate) : promo.start_date;
    const end = data.endDate ? new Date(data.endDate) : promo.end_date;

    if (!start || !end) {
      throw new Error('Start date and end date are required.');
    }

    if (start >= end) {
      throw new Error('Start date must be before end date.');
    }

    const scope = data.scope !== undefined ? normalizeScope(data.scope) : normalizeScope(promo.scope);
    const storeCodes = data.stores !== undefined ? normalizeStoreCodes(data.stores) : (promo.store_codes ?? []);
    if (scope === 'stores' && storeCodes.length === 0) {
      throw new Error('stores is required when scope is stores.');
    }

    if (data.minOrder !== undefined) {
      const minOrder = Number(data.minOrder);
      if (!Number.isFinite(minOrder) || minOrder < 0) {
        throw new Error('minOrder must be a non-negative number.');
      }
    }

    if (data.maxDiscount !== undefined && data.maxDiscount !== null) {
      const md = Number(data.maxDiscount);
      if (!Number.isFinite(md) || md < 0) {
        throw new Error('maxDiscount must be a non-negative number.');
      }
    }

    if (data.usageCount !== undefined) {
      const uc = Number(data.usageCount);
      if (!Number.isFinite(uc) || uc < 0) {
        throw new Error('usageCount must be a non-negative number.');
      }
    }

    return prisma.promotions.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: normalizeDiscountType(data.type) } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.minOrder !== undefined ? { min_order_value: Number(data.minOrder) } : {}),
        ...(data.maxDiscount !== undefined
          ? { max_discount: data.maxDiscount === null ? null : Number(data.maxDiscount) }
          : {}),
        start_date: start,
        end_date: end,
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
        scope,
        store_codes: storeCodes,
        ...(data.usageCount !== undefined ? { usage_count: Number(data.usageCount) } : {}),
        updated_at: new Date(),
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
    const promo = await prisma.promotions.findUnique({ where: { code } });
    
    if (!promo) throw new Error('Invalid coupon code.');
    if (!promo.is_active) throw new Error('This promotion is inactive.');
    
    const now = new Date();
    if ((promo.start_date && now < promo.start_date) || (promo.end_date && now > promo.end_date)) {
      throw new Error('This promotion is expired or not yet started.');
    }

    const minOrder = Number(promo.min_order_value ?? 0);
    if (Number.isFinite(minOrder) && orderTotal < minOrder) {
      throw new Error('Order total does not meet the minimum requirement.');
    }

    return promo;
  }
};