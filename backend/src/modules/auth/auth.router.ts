import { Router } from 'express';
import * as authService from './auth.service';
import { authenticateToken } from '../../middlewares/auth.middleware';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await authService.login(email, password);
    res.json(result);
  } catch (error: unknown) { // <--- Sửa 'any' thành 'unknown'
    // Kiểm tra xem error có phải là một Instance của Error không
    if (error instanceof Error) {
      // Trả về 401 nếu lỗi do user/pass
      if (error.message === 'User not found' || error.message === 'Invalid credentials') {
        return res.status(401).json({ message: error.message });
      }
    }
    
    // Ném lỗi ra cho middleware xử lý lỗi chung (errorHandler)
    next(error);
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const payload = req.user && typeof req.user === 'object' ? (req.user as any) : null;
    const userId = Number(payload?.userId);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await authService.me(userId);
    return res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;