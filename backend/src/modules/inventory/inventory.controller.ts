import { NextFunction, Request, Response } from 'express';
import { InventoryService } from './inventory.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getUserContext = (req: Request) => {
  const user = asRecord(req.user);
  const userId = Number(user.userId);
  return {
    role: String(user.role ?? ''),
    userId: Number.isFinite(userId) ? userId : undefined,
  };
};

const isAdminRequest = (req: Request) => getUserContext(req).role.toLowerCase() === 'admin';

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const getBody = (req: Request) => asRecord(req.body);

export const InventoryController = {
  listAdjustments: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await InventoryService.listAdjustments({
        isAdmin: isAdminRequest(req),
        activeStoreId: Number(req.activeStoreId),
        queryStoreId: req.query.storeId ? Number(req.query.storeId) : undefined,
        q: String(req.query.q ?? '').trim(),
        take: req.query.take ? Math.min(Number(req.query.take), 200) : 50,
        skip: req.query.skip ? Number(req.query.skip) : 0,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  listInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await InventoryService.listInventory({
        isAdmin: isAdminRequest(req),
        activeStoreId: Number(req.activeStoreId),
        queryStoreId: req.query.storeId ? Number(req.query.storeId) : undefined,
        take: req.query.take ? Math.min(Number(req.query.take), 200) : 50,
        skip: req.query.skip ? Number(req.query.skip) : 0,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getActiveStoreVariantInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const variantId = Number(req.params.variantId);
      if (!Number.isFinite(storeId) || !Number.isFinite(variantId)) {
        return res.status(400).json({ error: 'Invalid variantId' });
      }

      const result = await InventoryService.getVariantInventory(storeId, variantId);
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Inventory not found' });
      }

      return res.json({ inventory: result.inventory });
    } catch (err) {
      return next(err);
    }
  },

  getStoreVariantInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.params.storeId);
      const variantId = Number(req.params.variantId);
      if (!Number.isFinite(storeId) || !Number.isFinite(variantId)) {
        return res.status(400).json({ error: 'Invalid storeId/variantId' });
      }

      const access = InventoryService.checkLegacyStoreAccess({
        storeId,
        activeStoreId: Number(req.activeStoreId),
        role: getUserContext(req).role,
      });
      if (access.status === 'forbidden') {
        return res.status(403).json(access.body);
      }

      const result = await InventoryService.getVariantInventory(storeId, variantId);
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Inventory not found' });
      }

      return res.json({ inventory: result.inventory });
    } catch (err) {
      return next(err);
    }
  },

  lookupActiveStoreInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const barcode = String(req.query.barcode ?? '').trim();
      if (!Number.isFinite(storeId) || !barcode) {
        return res.status(400).json({ error: 'Invalid barcode' });
      }

      const result = await InventoryService.lookupInventory(storeId, barcode);
      if (result.status === 'variant_not_found') {
        return res.status(404).json({ error: 'Variant not found' });
      }

      return res.json({ variant: result.variant, inventory: result.inventory });
    } catch (err) {
      return next(err);
    }
  },

  lookupStoreInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.params.storeId);
      const barcode = String(req.query.barcode ?? '').trim();
      if (!Number.isFinite(storeId) || !barcode) {
        return res.status(400).json({ error: 'Invalid storeId/barcode' });
      }

      const access = InventoryService.checkLegacyStoreAccess({
        storeId,
        activeStoreId: Number(req.activeStoreId),
        role: getUserContext(req).role,
      });
      if (access.status === 'forbidden') {
        return res.status(403).json(access.body);
      }

      const result = await InventoryService.lookupInventory(storeId, barcode);
      if (result.status === 'variant_not_found') {
        return res.status(404).json({ error: 'Variant not found' });
      }

      return res.json({ variant: result.variant, inventory: result.inventory });
    } catch (err) {
      return next(err);
    }
  },

  receiveInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await InventoryService.receiveInventory({
        body: getBody(req),
        activeStoreId: Number(req.activeStoreId),
        context: {
          source: getAuditSource(req),
          user: getUserContext(req),
        },
      });

      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }

      return res.status(201).json(result.result);
    } catch (err) {
      return next(err);
    }
  },

  adjustInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await InventoryService.adjustInventory({
        body: getBody(req),
        activeStoreId: Number(req.activeStoreId),
        context: {
          source: getAuditSource(req),
          user: getUserContext(req),
        },
      });

      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }

      return res.status(201).json(result.result);
    } catch (err) {
      return next(err);
    }
  },
};
