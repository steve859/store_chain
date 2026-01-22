import { JwtPayload } from 'jsonwebtoken';
import type { AuthUserPayload } from './auth';

declare global {
  namespace Express {
    interface Request {
      user?: string | AuthUserPayload;
      activeStoreId?: number | null;
    }
  }
}

