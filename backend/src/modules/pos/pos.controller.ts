import { NextFunction, Request, Response } from 'express';
import { PosService } from './pos.service';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActor = (req: Request) => {
  const user = asRecord(req.user);
  const userId = Number(user.userId);
  return {
    userId: Number.isFinite(userId) ? userId : undefined,
    source: {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
    },
  };
};

const getTokenUserId = (req: Request) => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : null;
};

const resolveCashierId = (req: Request, ...bodyKeys: string[]) => {
  const fromToken = getTokenUserId(req);
  if (Number.isFinite(fromToken)) return fromToken;
  const body = asRecord(req.body);
  for (const key of bodyKeys) {
    const value = PosService.toNumber(body[key]);
    if (value !== null) return value;
  }
  return null;
};

const getBody = (req: Request) => asRecord(req.body);

const sendMappedResult = (res: Response, result: { status: string; body?: unknown }) => {
  if (result.status === 'bad_request') return res.status(400).json(result.body);
  if (result.status === 'not_found') return res.status(404).json(result.body);
  if (result.status === 'conflict') return res.status(409).json(result.body);
  if (result.status === 'forbidden') return res.status(403).json(result.body);
  return null;
};

export const PosController = {
  openShift: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const openedBy = resolveCashierId(req, 'openedBy', 'cashierId');
      const openingCash = PosService.toNumber(req.body?.openingCash) ?? 0;
      const note = req.body?.note ? String(req.body.note) : null;
      const result = await PosService.openShift({ storeId: Number(req.activeStoreId), openedBy, openingCash, note });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.status(201).json({ shift: result.shift });
    } catch (err) {
      return next(err);
    }
  },

  closeShift: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const closedBy = resolveCashierId(req, 'closedBy', 'cashierId');
      const closingCash = PosService.toNumber(req.body?.closingCash);
      const note = req.body?.note ? String(req.body.note) : null;
      const result = await PosService.closeShift({
        storeId: Number(req.activeStoreId),
        closedBy,
        closingCash,
        note,
        actor: getActor(req),
      });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.status(201).json(result.body);
    } catch (err) {
      return next(err);
    }
  },

  getCurrentShift: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PosService.getCurrentShift(Number(req.activeStoreId));
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  },

  createCashMovement: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = getBody(req);
      const result = await PosService.createCashMovement({
        storeId: Number(req.activeStoreId),
        type: body.type ? String(body.type) : '',
        amount: PosService.toNumber(body.amount),
        reason: body.reason ? String(body.reason) : null,
        createdBy: getTokenUserId(req),
        actor: getActor(req),
      });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.status(201).json(result.body);
    } catch (err) {
      return next(err);
    }
  },

  listShiftCashMovements: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PosService.listCashMovements(Number(req.activeStoreId), Number(req.params.id));
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.json({ items: result.items });
    } catch (err) {
      return next(err);
    }
  },

  lookupInventory: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PosService.lookupInventory({
        storeId: Number(req.activeStoreId),
        barcode: String(req.query.barcode ?? '').trim(),
        variantId: req.query.variantId ? Number(req.query.variantId) : NaN,
      });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.json({ variant: result.variant, inventory: result.inventory });
    } catch (err) {
      return next(err);
    }
  },

  getReceipt: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoiceId = Number(req.params.id);
      if (!Number.isFinite(invoiceId)) {
        return res.status(400).json({ error: 'Invalid invoice id' });
      }
      const result = await PosService.getReceipt({ invoiceId, activeStoreId: Number(req.activeStoreId) });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.json(result.body);
    } catch (err) {
      return next(err);
    }
  },

  checkout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PosService.checkout({
        storeId: Number(req.activeStoreId),
        cashierId: resolveCashierId(req, 'cashierId'),
        body: getBody(req),
        actor: getActor(req),
      });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.status(201).json({ invoice: result.invoice });
    } catch (err) {
      return next(err);
    }
  },

  hold: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PosService.hold({
        storeId: Number(req.activeStoreId),
        cashierId: resolveCashierId(req, 'cashierId'),
        body: getBody(req),
      });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.status(201).json({ invoice: result.invoice });
    } catch (err) {
      return next(err);
    }
  },

  resumeCheckout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PosService.resumeCheckout({
        invoiceId: Number(req.params.id),
        paymentMethod: req.body?.paymentMethod,
        activeStoreId: Number(req.activeStoreId),
      });
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.json({ invoice: result.invoice });
    } catch (err) {
      return next(err);
    }
  },

  refund: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PosService.refund({
        storeId: Number(req.activeStoreId),
        cashierId: resolveCashierId(req, 'cashierId'),
        body: getBody(req),
        actor: getActor(req),
      });
      if (result.status === 'error') {
        return res.status(result.result.status).json(result.result.body);
      }
      const mapped = sendMappedResult(res, result);
      if (mapped) return mapped;
      return res.status(201).json({ refund: result.refund });
    } catch (err) {
      return next(err);
    }
  },
};
