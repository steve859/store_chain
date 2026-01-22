import { Router } from 'express';
import { UserService } from './users.service';
import prisma from '../../db/prisma';

const router = Router();

// GET /api/v1/users/meta
router.get('/meta', async (_req, res) => {
  try {
    const [roles, stores] = await Promise.all([
      prisma.roles.findMany({ orderBy: { id: 'asc' } }),
      prisma.stores.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),
    ]);

    res.json({ roles, stores });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/v1/users
router.get('/', async (req, res) => {
  try {
    const users = await UserService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/v1/users/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const user = await UserService.getUserById(id);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// GET /api/v1/users/:id/stores
router.get('/:id/stores', async (req, res) => {
  try {
    const id = req.params.id;
    const stores = await UserService.getUserStores(id);
    res.json({ stores });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// PUT /api/v1/users/:id/stores
router.put('/:id/stores', async (req, res) => {
  try {
    const id = req.params.id;
    const { storeIds, primaryStoreId } = req.body ?? {};

    if (!Array.isArray(storeIds)) {
      return res.status(400).json({ error: 'storeIds must be an array of numbers' });
    }

    const updated = await UserService.setUserStores(id, { storeIds, primaryStoreId });
    res.json({ stores: updated });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// POST /api/v1/users
router.post('/', async (req, res) => {
  try {
    // Validate sơ bộ
    if (!req.body.email || !req.body.password || !req.body.roleId) {
      return res.status(400).json({ 
        error: 'Email, password, and roleId are required' 
      });
    }

    const newUser = await UserService.createUser(req.body);
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// PUT /api/v1/users/:id
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedUser = await UserService.updateUser(id, req.body);
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// DELETE /api/v1/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await UserService.deleteUser(id);
    res.json({ message: 'User deleted successfully (Soft Delete)' });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;