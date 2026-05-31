import { NextFunction, Request, Response } from 'express';
import { ReturnsService } from './returns.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorContext = (req: Request) => {
  const user = asRecord(req.user);
  const userId = Number(user.userId);
  return {
    userId: Number.isFinite(userId) ? userId : null,
    role: String(user.role ?? '').toLowerCase(),
    auditSource: {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
    },
  };
};

const getBody = (req: Request) => asRecord(req.body);

export const ReturnsController = {
  listInvoices: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const from = req.query.from ? new Date(String(req.query.from)) : null;
      const to = req.query.to ? new Date(String(req.query.to)) : null;
      const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
      const skip = req.query.skip ? Number(req.query.skip) : 0;

      if (from && Number.isNaN(from.getTime())) {
        return res.status(400).json({ error: 'Invalid from date' });
      }
      if (to && Number.isNaN(to.getTime())) {
        return res.status(400).json({ error: 'Invalid to date' });
      }

      const result = await ReturnsService.listInvoices({ storeId, from, to, take, skip });
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getInvoiceForReturn: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const invoiceId = Number(req.params.id);
      if (!Number.isFinite(storeId) || !Number.isFinite(invoiceId)) {
        return res.status(400).json({ error: 'Invalid store/invoice id' });
      }

      const result = await ReturnsService.getInvoiceForReturn({ storeId, invoiceId });
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (result.status === 'forbidden') {
        return res.status(403).json(result.body);
      }

      return res.json({ invoice: result.invoice, items: result.items });
    } catch (err) {
      return next(err);
    }
  },

  createReturn: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ReturnsService.createReturn({
        storeId: Number(req.activeStoreId),
        body: getBody(req),
        actor: getActorContext(req),
      });

      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }
      if (result.status === 'error') {
        return res.status(result.result.status).json(result.result.body);
      }

      return res.status(201).json(result.result);
    } catch (err) {
      return next(err);
    }
  },

  listReturns: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ReturnsService.listReturns({
        storeId: Number(req.activeStoreId),
        take: req.query.take ? Math.min(Number(req.query.take), 200) : 50,
        skip: req.query.skip ? Number(req.query.skip) : 0,
        q: String(req.query.q ?? '').trim(),
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getReturnDetail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = Number(req.activeStoreId);
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid return id' });
      }

      const result = await ReturnsService.getReturnDetail({ storeId, id });
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Return not found' });
      }

      return res.json({ return: result.item });
    } catch (err) {
      return next(err);
    }
  },

  createManagerRefund: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ReturnsService.createManagerRefund({
        storeId: Number(req.activeStoreId),
        body: getBody(req),
        actor: getActorContext(req),
      });

      if (result.status === 'bad_request') {
        return res.status(400).json(result.body);
      }
      if (result.status === 'error') {
        return res.status(result.result.status).json(result.result.body);
      }

      return res.status(201).json({ refund: result.refund });
    } catch (err) {
      return next(err);
    }
  },
};
