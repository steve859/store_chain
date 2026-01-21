import { Request, Response, NextFunction } from 'express';

// Mở rộng type Request để TypeScript không báo lỗi
// (User đã được decode từ auth.middleware)
interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
    storeId?: string | null;
  };
}

/**
 * Middleware kiểm tra Role.
 * Sử dụng sau authenticateToken.
 * @param allowedRoles Danh sách các role được phép truy cập (vd: ['admin', 'manager'])
 */
export const authorizeRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      return res.status(401).json({ message: 'Unauthorized: User not identified' });
    }

    // Role của user hiện tại (lấy từ JWT payload)
    const userRole = authReq.user.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: `Forbidden: You do not have permission. Required: ${allowedRoles.join(' or ')}` 
      });
    }

    next();
  };
};