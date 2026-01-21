import { Router } from 'express';
import { UserService } from './users.service';

const router = Router();

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const users = await UserService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const user = await UserService.getUserById(id);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// POST /api/users
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

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedUser = await UserService.updateUser(id, req.body);
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// DELETE /api/users/:id
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