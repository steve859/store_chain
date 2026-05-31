import { Request, Response } from 'express';
import { AuditLogsService } from '../audit_logs/audit_logs.service';
import { UserService } from './users.service';
import { UsersRepository } from './users.repository';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getActorUserId = (req: Request): number | undefined => {
  const userId = Number(asRecord(req.user).userId);
  return Number.isFinite(userId) ? userId : undefined;
};

const getAuditSource = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const safeUserSnapshot = (user: unknown) => {
  if (!user) return null;
  const row = asRecord(user);
  return {
    id: row.id,
    username: row.username ?? null,
    email: row.email ?? null,
    fullName: row.full_name ?? row.fullName ?? row.name ?? null,
    roleId: row.role_id ?? row.roleId ?? null,
    storeId: row.store_id ?? row.storeId ?? null,
    isActive: row.is_active ?? row.isActive ?? null,
  };
};

const safeStoreAssignmentsSnapshot = (stores: unknown[]) =>
  stores.map((store) => {
    const row = asRecord(store);
    return {
      storeId: row.store_id ?? row.storeId,
      roleId: row.role_id ?? row.roleId ?? null,
      isPrimary: Boolean(row.is_primary ?? row.isPrimary),
      isActive: Boolean(row.is_active ?? row.isActive ?? true),
    };
  });

const getSafeUserBeforeSnapshot = async (id: string) => {
  const userId = Number(id);
  if (!Number.isFinite(userId)) return null;

  try {
    const user = await UsersRepository.findById(userId);
    return safeUserSnapshot(user);
  } catch {
    return null;
  }
};

const getSafeStoreAssignmentsBeforeSnapshot = async (id: string) => {
  const userId = Number(id);
  if (!Number.isFinite(userId)) return [];

  try {
    const stores = await UsersRepository.findUserStoresForAudit(userId);
    return safeStoreAssignmentsSnapshot(stores);
  } catch {
    return [];
  }
};

const getChangedFields = (body: Record<string, unknown>) =>
  Object.keys(body).filter((field) => !['password', 'password_hash', 'token', 'secret'].includes(field));

const writeAuditLog = async (params: Parameters<typeof AuditLogsService.createLog>[0]) => {
  try {
    await AuditLogsService.createLog(params);
  } catch {
    // Audit logging is best-effort for this phase.
  }
};

export const UsersController = {
  getMeta: async (_req: Request, res: Response) => {
    try {
      const [roles, stores] = await Promise.all([UsersRepository.findRolesForMeta(), UsersRepository.findStoresForMeta()]);

      res.json({ roles, stores });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getAllUsers: async (_req: Request, res: Response) => {
    try {
      const users = await UserService.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  },

  getUserById: async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const user = await UserService.getUserById(id);
      res.json(user);
    } catch (error) {
      res.status(404).json({ error: (error as Error).message });
    }
  },

  getUserStores: async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const stores = await UserService.getUserStores(id);
      res.json({ stores });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  setUserStores: async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const { storeIds, primaryStoreId } = req.body ?? {};

      if (!Array.isArray(storeIds)) {
        return res.status(400).json({ error: 'storeIds must be an array of numbers' });
      }

      const before = await getSafeStoreAssignmentsBeforeSnapshot(id);
      const updated = await UserService.setUserStores(id, { storeIds, primaryStoreId });
      await writeAuditLog({
        action: 'USER_STORE_ASSIGNMENTS_UPDATED',
        objectType: 'user',
        objectId: id,
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          before,
          after: safeStoreAssignmentsSnapshot(updated as unknown[]),
          requestedStoreIds: storeIds,
          primaryStoreId: primaryStoreId ?? null,
        },
      });
      return res.json({ stores: updated });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  },

  createUser: async (req: Request, res: Response) => {
    try {
      // Validate sÆ¡ bá»™
      if (!req.body.email || !req.body.password || !req.body.roleId) {
        return res.status(400).json({
          error: 'Email, password, and roleId are required',
        });
      }

      const newUser = await UserService.createUser(req.body);
      await writeAuditLog({
        action: 'USER_CREATED',
        objectType: 'user',
        objectId: newUser?.id !== undefined && newUser?.id !== null ? String(newUser.id) : undefined,
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          targetUser: safeUserSnapshot(newUser),
          metadata: {
            requestedStoreIds: Array.isArray(req.body?.storeIds) ? req.body.storeIds : undefined,
            primaryStoreId: req.body?.primaryStoreId ?? null,
          },
        },
      });
      return res.status(201).json(newUser);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  },

  updateUser: async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const before = await getSafeUserBeforeSnapshot(id);
      const updatedUser = await UserService.updateUser(id, req.body);
      await writeAuditLog({
        action: 'USER_UPDATED',
        objectType: 'user',
        objectId: id,
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          before,
          after: safeUserSnapshot(updatedUser),
          changedFields: getChangedFields(req.body ?? {}),
          passwordChanged: req.body?.password !== undefined,
        },
      });
      res.json(updatedUser);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },

  deleteUser: async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const before = await getSafeUserBeforeSnapshot(id);
      const deactivated = await UserService.deleteUser(id);
      await writeAuditLog({
        action: 'USER_DEACTIVATED',
        objectType: 'user',
        objectId: id,
        userId: getActorUserId(req),
        payload: {
          result: 'success',
          source: getAuditSource(req),
          before,
          after: safeUserSnapshot(deactivated),
        },
      });
      res.json({ message: 'User deleted successfully (Soft Delete)' });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  },
};
