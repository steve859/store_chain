import { NextFunction, Request, Response } from 'express';
import { OrdersService } from './orders.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getUserContext = (req: Request) => {
  const user = asRecord(req.user);
  const userId = Number(user.userId);
  return {
    role: String(user.role ?? ''),
    userId: Number.isFinite(userId) ? userId : null,
  };
};

const getBody = (req: Request) => asRecord(req.body);

export const OrdersController = {
  listOrders: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = req.activeStoreId ?? undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
      const q = String(req.query.q ?? '').trim();
      const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
      const skip = req.query.skip ? Number(req.query.skip) : 0;

      const result = await OrdersService.listOrders({ storeId, status, supplierId, q, take, skip });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getOrderDetail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }

      const result = await OrdersService.getOrderDetail({
        id,
        activeStoreId: Number(req.activeStoreId),
        user: getUserContext(req),
      });

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.json({ order: result.order });
    } catch (err) {
      return next(err);
    }
  },

  createOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await OrdersService.createOrder({
        activeStoreId: Number(req.activeStoreId),
        user: getUserContext(req),
        body: getBody(req),
      });

      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }

      return res.status(201).json({ order: result.order });
    } catch (err) {
      return next(err);
    }
  },

  updateOrderStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const status = String(req.body?.status ?? '').trim();
      if (!Number.isFinite(id) || !status) {
        return res.status(400).json({ error: 'Invalid id/status' });
      }

      const allowed = new Set(['draft', 'submitted', 'approved', 'cancelled', 'received']);
      if (!allowed.has(status)) {
        return res.status(400).json({ error: 'Unsupported status' });
      }

      const result = await OrdersService.updateOrderStatus({
        id,
        status,
        activeStoreId: Number(req.activeStoreId),
        user: getUserContext(req),
      });

      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.json({ order: result.order });
    } catch (err) {
      return next(err);
    }
  },

  receiveOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }

      const result = await OrdersService.receiveOrder({
        id,
        activeStoreId: Number(req.activeStoreId),
        user: getUserContext(req),
        body: getBody(req),
      });

      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }

      return res.status(201).json(result.result);
    } catch (err) {
      return next(err);
    }
  },

  deleteDraftOrder: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }

      const result = await OrdersService.deleteDraftOrder({
        id,
        activeStoreId: Number(req.activeStoreId),
        user: getUserContext(req),
      });

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.json({ order: result.order });
    } catch (err) {
      return next(err);
    }
  },
};
