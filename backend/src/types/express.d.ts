import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload; // Hoặc định nghĩa interface User cụ thể
    }
  }
}