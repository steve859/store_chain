import { Request, Response, NextFunction } from 'express';
import type { IOServer } from '../events/socket';

declare global {
  namespace Express {
    interface Request {
      io?: IOServer;
    }
  }
}

export const ioMiddleware = (io: IOServer) => {
  return (_req: Request, res: Response, next: NextFunction) => {
    _req.io = io;
    next();
  };
};
