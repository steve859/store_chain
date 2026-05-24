import { Request, Response, NextFunction } from 'express';
import { ProductsService, parseDateOptional, toDecimal } from './products.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorUserId = (req: Request): number | undefined => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getEffectiveUserId = (req: Request): number | null => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : null;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const parsePagination = (req: Request) => ({
  take: req.query.take ? Math.min(Number(req.query.take), 200) : 50,
  skip: req.query.skip ? Number(req.query.skip) : 0,
});

export const ProductsController = {
  listProducts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const { take, skip } = parsePagination(req);
      const result = await ProductsService.listProducts({ q, take, skip });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getCatalog: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const q = String(req.query.q ?? '').trim();
      const barcode = String(req.query.barcode ?? '').trim();
      const { take, skip } = parsePagination(req);

      if (!Number.isFinite(storeId)) {
        return res.status(400).json({ error: 'Active store is required' });
      }

      const result = await ProductsService.getCatalog({ q, barcode, take, skip, storeId });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getVariantPrices: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const variantId = req.query.variantId !== undefined ? Number(req.query.variantId) : null;
      const { take, skip } = parsePagination(req);

      const result = await ProductsService.getVariantPrices({ storeId, variantId, take, skip });
      if (result.status === 'invalid') {
        return res.status(400).json({ error: 'store and variantId are required' });
      }

      return res.json(result.data);
    } catch (err) {
      return next(err);
    }
  },

  setVariantPrice: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const variantId = Number(req.body?.variantId);
      const price = toDecimal(req.body?.price);
      const startAt = parseDateOptional(req.body?.startAt) ?? new Date();

      const result = await ProductsService.setVariantPrice(
        { storeId, variantId, price, startAt, userId: getEffectiveUserId(req) },
        { userId: getActorUserId(req), source: getAuditSource(req) },
      );

      if (result.status === 'invalid') {
        return res.status(400).json({ error: 'variantId is required' });
      }

      return res.status(201).json({ price: result.price });
    } catch (err) {
      return next(err);
    }
  },

  closeVariantPrice: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const variantId = Number(req.body?.variantId);
      const endAt = parseDateOptional(req.body?.endAt) ?? new Date();

      const result = await ProductsService.closeVariantPrice(
        { storeId, variantId, endAt, userId: getEffectiveUserId(req) },
        { userId: getActorUserId(req), source: getAuditSource(req) },
      );

      if (result.status === 'invalid') {
        return res.status(400).json({ error: 'variantId is required' });
      }

      return res.json({ price: result.price });
    } catch (err) {
      return next(err);
    }
  },

  getProductById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'Invalid product id' });
      }

      const product = await ProductsService.getProductById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.json({ product });
    } catch (err) {
      return next(err);
    }
  },

  createProduct: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = body.name !== undefined && body.name !== null ? String(body.name).trim() : '';
      const unit = body.unit !== undefined && body.unit !== null ? String(body.unit).trim() : '';

      if (!name || !unit) {
        return res.status(400).json({ error: 'name and unit are required' });
      }

      const created = await ProductsService.createProduct(body);
      return res.status(201).json({ product: created });
    } catch (err) {
      return next(err);
    }
  },

  updateProduct: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'Invalid product id' });
      }

      const updated = await ProductsService.updateProduct(productId, (req.body ?? {}) as Record<string, unknown>);
      return res.json({ product: updated });
    } catch (err) {
      return next(err);
    }
  },

  createVariant: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'Invalid product id' });
      }

      const created = await ProductsService.createVariant(productId, (req.body ?? {}) as Record<string, unknown>);
      return res.status(201).json({ variant: created });
    } catch (err) {
      return next(err);
    }
  },

  updateVariant: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const variantId = Number(req.params.variantId);
      if (!Number.isFinite(variantId)) {
        return res.status(400).json({ error: 'Invalid variant id' });
      }

      const updated = await ProductsService.updateVariant(variantId, (req.body ?? {}) as Record<string, unknown>);
      return res.json({ variant: updated });
    } catch (err) {
      return next(err);
    }
  },
};
