import { Router } from 'express';
import { authenticateToken } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/rbac.middleware';
import { UsersController } from './users.controller';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRoles(['ADMIN']));

// GET /api/v1/users/meta
router.get('/meta', UsersController.getMeta);

// GET /api/v1/users
router.get('/', UsersController.getAllUsers);

// GET /api/v1/users/:id
router.get('/:id', UsersController.getUserById);

// GET /api/v1/users/:id/stores
router.get('/:id/stores', UsersController.getUserStores);

// PUT /api/v1/users/:id/stores
router.put('/:id/stores', UsersController.setUserStores);

// POST /api/v1/users
router.post('/', UsersController.createUser);

// PUT /api/v1/users/:id
router.put('/:id', UsersController.updateUser);

// DELETE /api/v1/users/:id
router.delete('/:id', UsersController.deleteUser);

export default router;
