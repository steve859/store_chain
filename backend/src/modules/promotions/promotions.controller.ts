import { Request, Response } from 'express';
import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { PromotionService } from './promotions.service';

const promotionAuditFields = [
  'id',
  'code',
  'name',
  'type',
  'scope',
  'is_active',
  'start_date',
  'end_date',
  'usage_count',
  'value',
  'min_order_value',
  'max_discount',
];

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const toAuditValue = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object' && value !== null && 'toString' in value) return String(value);
  return value;
};

const getActorUserId = (req: Request) => {
  const userId = Number(toRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch (error) {
    console.error('Failed to write promotion audit log:', error);
  }
};

const safePromotionSnapshot = (promotion: unknown) => {
  const record = toRecord(promotion);

  return promotionAuditFields.reduce<Record<string, unknown>>((snapshot, field) => {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      snapshot[field] = toAuditValue(record[field]);
    }
    return snapshot;
  }, {});
};

const getStoreCodes = (promotion: unknown) => {
  const storeCodes = toRecord(promotion).store_codes;
  return Array.isArray(storeCodes) ? storeCodes : [];
};

const getPromotionMetadata = (promotion: unknown) => {
  const storeCodes = getStoreCodes(promotion);

  return {
    storeCodesPresent: storeCodes.length > 0,
    storeCodesCount: storeCodes.length,
  };
};

const getChangedFields = (before: unknown, after: unknown) => {
  const beforeRecord = toRecord(before);
  const afterRecord = toRecord(after);
  const fields = [...promotionAuditFields, 'store_codes'];

  return fields.filter((field) => JSON.stringify(toAuditValue(beforeRecord[field])) !== JSON.stringify(toAuditValue(afterRecord[field])));
};

export const PromotionsController = {
  getAllPromotions: async (_req: Request, res: Response) => {
    try {
      const promos = await PromotionService.getAllPromotions();
      res.json(promos);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getPromotionById: async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const promo = await PromotionService.getPromotionById(id);
      res.json(promo);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  },

  createPromotion: async (req: Request, res: Response) => {
    try {
      const newPromo = await PromotionService.createPromotion(req.body);
      await writeAuditLog({
        action: 'PROMOTION_CREATED',
        objectType: 'promotion',
        objectId: String(toRecord(newPromo).id),
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          after: safePromotionSnapshot(newPromo),
          metadata: getPromotionMetadata(newPromo),
        },
      });
      res.status(201).json(newPromo);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  updatePromotion: async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const beforePromo = await PromotionService.getPromotionById(id);
      const updatedPromo = await PromotionService.updatePromotion(id, req.body);
      await writeAuditLog({
        action: 'PROMOTION_UPDATED',
        objectType: 'promotion',
        objectId: String(id),
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          before: safePromotionSnapshot(beforePromo),
          after: safePromotionSnapshot(updatedPromo),
          metadata: {
            ...getPromotionMetadata(updatedPromo),
            changedFields: getChangedFields(beforePromo, updatedPromo),
          },
        },
      });
      res.json(updatedPromo);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  deletePromotion: async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const beforePromo = await PromotionService.getPromotionById(id);
      await PromotionService.deletePromotion(id);
      await writeAuditLog({
        action: 'PROMOTION_DELETED',
        objectType: 'promotion',
        objectId: String(id),
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          before: safePromotionSnapshot(beforePromo),
          metadata: {
            deleted: true,
          },
        },
      });
      res.json({ message: 'Promotion deleted successfully' });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  validatePromotion: async (req: Request, res: Response) => {
    try {
      const { code, orderTotal } = req.body;
      if (!code || orderTotal === undefined) {
        return res.status(400).json({ error: 'Code and orderTotal are required' });
      }
      const promo = await PromotionService.validateCode(code, orderTotal);
      return res.json({ valid: true, promotion: promo });
    } catch (error) {
      return res.status(400).json({ valid: false, error: (error as Error).message });
    }
  },
};
