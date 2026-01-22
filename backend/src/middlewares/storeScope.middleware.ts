import { NextFunction, Request, Response } from 'express';
import type { AuthUserPayload } from '../types/auth';

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const getAllowedStoreIds = (user: AuthUserPayload): number[] => {
  const storeIds = Array.isArray(user.storeIds) ? user.storeIds.filter((x) => Number.isFinite(x)) : [];
  const legacy = user.storeId !== undefined && user.storeId !== null ? [Number(user.storeId)] : [];
  return Array.from(new Set([...storeIds, ...legacy].filter((x) => Number.isFinite(x))));
};

export const resolveActiveStore = (req: Request, _res: Response, next: NextFunction) => {
  const user = (req.user && typeof req.user === 'object' ? (req.user as AuthUserPayload) : null);
  if (!user) {
    req.activeStoreId = null;
    return next();
  }

  const fromHeader = toNumber(req.header('x-store-id'));
  const fromQuery = toNumber((req.query as any)?.storeId);
  const fromBody = toNumber((req.body as any)?.storeId);
  const candidate = fromHeader ?? fromQuery ?? fromBody;

  const allowed = getAllowedStoreIds(user);
  const fallback =
    (user.primaryStoreId !== undefined && user.primaryStoreId !== null ? Number(user.primaryStoreId) : null) ??
    (user.storeId !== undefined && user.storeId !== null ? Number(user.storeId) : null) ??
    (allowed.length > 0 ? allowed[0] : null);

  // Admin can operate without store constraint in some endpoints;
  // still set activeStoreId when provided.
  if ((user.role ?? '').toLowerCase() === 'admin') {
    req.activeStoreId = candidate ?? fallback;
    return next();
  }

  if (candidate !== null && !allowed.includes(candidate)) {
    req.activeStoreId = null;
    return next(new Error('Forbidden: store scope is not allowed'));
  }

  req.activeStoreId = candidate ?? fallback;
  return next();
};

export const requireActiveStore = (req: Request, res: Response, next: NextFunction) => {
  if (!req.activeStoreId) {
    return res.status(400).json({ error: 'storeId is required (active store not resolved)' });
  }
  return next();
};

export const requireActiveStoreUnlessAdmin = (req: Request, res: Response, next: NextFunction) => {
  const role = req.user && typeof req.user === 'object' ? String((req.user as any).role ?? '') : '';
  if (role.toLowerCase() === 'admin') {
    return next();
  }
  return requireActiveStore(req, res, next);
};
