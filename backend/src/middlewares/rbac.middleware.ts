import { Request, Response, NextFunction } from 'express';

/**
 * Middleware kiểm tra Role.
 * Sử dụng sau authenticateToken.
 * @param allowedRoles Danh sách các role được phép truy cập (vd: ['admin', 'manager'])
 */
export const authorizeRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || typeof req.user === 'string') {
      return res.status(401).json({ message: 'Unauthorized: User not identified' });
    }

    // Role của user hiện tại (lấy từ JWT payload)
    const userRole = req.user.role;
    const normUserRole = userRole ? String(userRole).toLowerCase() : '';
    const normAllowed = allowedRoles.map((r) => String(r).toLowerCase());

    if (!normUserRole || !normAllowed.includes(normUserRole)) {
      return res.status(403).json({ 
        message: `Forbidden: You do not have permission. Required: ${allowedRoles.join(' or ')}` 
      });
    }

    next();
  };
};