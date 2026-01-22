import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUserPayload } from '../types/auth';
import { resolveActiveStore } from './storeScope.middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  // Format: "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded !== 'object' || decoded === null) {
      return res.status(403).json({ message: 'Invalid token payload' });
    }

    const payload = decoded as Record<string, unknown>;
    const userId = Number(payload.userId);

    if (!Number.isFinite(userId)) {
      return res.status(403).json({ message: 'Invalid token payload' });
    }

    const authUser: AuthUserPayload = {
      userId,
      email: (payload.email as string | null | undefined) ?? null,
      role: (payload.role as string | null | undefined) ?? null,
      storeId: (payload.storeId as number | null | undefined) ?? null,
      storeIds: Array.isArray(payload.storeIds)
        ? (payload.storeIds as unknown[]).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
        : undefined,
      primaryStoreId: (payload.primaryStoreId as number | null | undefined) ?? null,
    };

    req.user = authUser;
    return resolveActiveStore(req, res, next);
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};