import { NextFunction, Request, Response } from 'express';
import { StoreService } from './stores.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorUserId = (req: Request): number | undefined => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

export const StoresController = {
  listStores: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
      const skip = req.query.skip ? Number(req.query.skip) : 0;
      const includeStats = String(req.query.includeStats ?? '').toLowerCase();
      const wantsStats = includeStats === '1' || includeStats === 'true' || includeStats === 'yes';

      const result = await StoreService.listStores({ q, take, skip, wantsStats });
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },

  getStoreById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.params.id);
      if (!Number.isFinite(storeId)) {
        return res.status(400).json({ error: 'Invalid store id' });
      }

      const store = await StoreService.getStoreById(storeId);
      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      return res.json({ store });
    } catch (err) {
      next(err);
    }
  },

  getStoreOverview: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.params.id);
      if (!Number.isFinite(storeId)) {
        return res.status(400).json({ error: 'Invalid store id' });
      }

      const result = await StoreService.getStoreOverview(storeId);
      if (!result.store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      return res.json(result);
    } catch (err) {
      next(err);
    }
  },

  createStore: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const name = body.name !== undefined && body.name !== null ? String(body.name).trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const created = await StoreService.createStore(body, getActorUserId(req), getAuditSource(req));
      return res.status(201).json({ store: created });
    } catch (err) {
      next(err);
    }
  },

  updateStore: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.params.id);
      if (!Number.isFinite(storeId)) {
        return res.status(400).json({ error: 'Invalid store id' });
      }

      const updated = await StoreService.updateStore(storeId, (req.body ?? {}) as Record<string, unknown>, getActorUserId(req), getAuditSource(req));
      return res.json({ store: updated });
    } catch (err) {
      next(err);
    }
  },

  deactivateStore: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.params.id);
      if (!Number.isFinite(storeId)) {
        return res.status(400).json({ error: 'Invalid store id' });
      }

      const updated = await StoreService.deactivateStore(storeId, getActorUserId(req), getAuditSource(req));
      return res.json({ store: updated });
    } catch (err) {
      next(err);
    }
  },
};
