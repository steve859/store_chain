import { NextFunction, Request, Response } from 'express';
import { TransfersService } from './transfers.service';

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

const getContext = (req: Request) => ({
  user: getUserContext(req),
  source: {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  },
  activeStoreId: Number(req.activeStoreId),
});

const getBody = (req: Request) => asRecord(req.body);

export const TransfersController = {
  listTransfers: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await TransfersService.listTransfers({
        query: req.query as Record<string, unknown>,
        context: getContext(req),
      });

      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.json(result.data);
    } catch (err) {
      return next(err);
    }
  },

  getTransferDetail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid transfer id' });
      }

      const result = await TransfersService.getTransferDetail({ id, context: getContext(req) });
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Transfer not found' });
      }
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.json({ transfer: result.transfer });
    } catch (err) {
      return next(err);
    }
  },

  createTransfer: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await TransfersService.createTransfer({ body: getBody(req), context: getContext(req) });
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }
      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }

      return res.status(201).json({ transfer: result.transfer });
    } catch (err) {
      return next(err);
    }
  },

  dispatchTransfer: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid transfer id' });
      }

      const result = await TransfersService.dispatchTransfer({ id, body: getBody(req), context: getContext(req) });
      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.status(201).json({ transfer: result.transfer });
    } catch (err) {
      return next(err);
    }
  },

  receiveTransfer: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid transfer id' });
      }

      const result = await TransfersService.receiveTransfer({ id, body: getBody(req), context: getContext(req) });
      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.status(201).json({ transfer: result.transfer });
    } catch (err) {
      return next(err);
    }
  },

  cancelTransfer: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid transfer id' });
      }

      const result = await TransfersService.cancelTransfer({ id, context: getContext(req) });
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.status(201).json({ transfer: result.transfer });
    } catch (err) {
      return next(err);
    }
  },
};
