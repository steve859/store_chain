import { Request, Response, NextFunction } from 'express';
import { InvoicesService } from './invoices.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const isAdminRequest = (req: Request) => {
  const role = String(asRecord(req.user).role ?? '');
  return role.toLowerCase() === 'admin';
};

export const InvoicesController = {
  listInvoices: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q ?? '').trim();
      const take = req.query.take ? Math.min(Number(req.query.take), 200) : 50;
      const skip = req.query.skip ? Number(req.query.skip) : 0;

      const queryStoreId = req.query.storeId ? Number(req.query.storeId) : NaN;
      const activeStoreId = req.activeStoreId !== undefined ? Number(req.activeStoreId) : NaN;

      const result = await InvoicesService.listInvoices({
        q,
        take,
        skip,
        isAdmin: isAdminRequest(req),
        queryStoreId,
        activeStoreId,
      });

      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  getInvoiceDetail: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoiceId = Number(req.params.id);
      if (!Number.isFinite(invoiceId)) {
        return res.status(400).json({ error: 'Invalid invoice id' });
      }

      const result = await InvoicesService.getInvoiceDetail({
        invoiceId,
        isAdmin: isAdminRequest(req),
        activeStoreId: Number(req.activeStoreId),
      });

      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (result.status === 'forbidden') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      return res.json(result.data);
    } catch (err) {
      return next(err);
    }
  },
};
