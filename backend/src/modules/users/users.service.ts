import bcrypt from 'bcrypt';

import prisma from '../../db/prisma';
import type { Prisma } from '../../generated/prisma';

// DTO cho tạo mới
interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  roleId: number;
  storeId?: number | null;
  storeIds?: number[];
  primaryStoreId?: number | null;
  username?: string;
}

// DTO cho cập nhật
// BỎ isActive khỏi đây
interface UpdateUserDto {
  email?: string;
  name?: string;
  password?: string;
  roleId?: number;
  storeId?: number | null;
  storeIds?: number[];
  primaryStoreId?: number | null;
  username?: string;
  isActive?: boolean;
}

const normalizeStoreIds = (data: { storeId?: number | null; storeIds?: number[]; primaryStoreId?: number | null }) => {
  const storeIdsFromArray = Array.isArray(data.storeIds)
    ? data.storeIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  const legacy = data.storeId !== undefined && data.storeId !== null ? [Number(data.storeId)] : [];
  const storeIds = Array.from(new Set([...storeIdsFromArray, ...legacy].filter((x) => Number.isFinite(x) && x > 0)));

  const primaryStoreIdRaw =
    data.primaryStoreId !== undefined && data.primaryStoreId !== null
      ? Number(data.primaryStoreId)
      : data.storeId !== undefined && data.storeId !== null
        ? Number(data.storeId)
        : null;

  const primaryStoreId = primaryStoreIdRaw !== null && Number.isFinite(primaryStoreIdRaw) ? primaryStoreIdRaw : null;

  return { storeIds, primaryStoreId };
};

const syncUserStores = async (
  tx: Prisma.TransactionClient,
  userId: number,
  input: { storeIds: number[]; primaryStoreId: number | null; roleId?: number | null }
) => {
  const storeIds = input.storeIds;

  if (storeIds.length === 0) {
    await tx.user_stores.deleteMany({ where: { user_id: userId } });
    return;
  }

  const storesCount = await tx.stores.count({ where: { id: { in: storeIds } } });
  if (storesCount !== storeIds.length) {
    throw new Error('One or more storeIds not found');
  }

  const primary = input.primaryStoreId && storeIds.includes(input.primaryStoreId) ? input.primaryStoreId : storeIds[0];

  await tx.user_stores.deleteMany({ where: { user_id: userId, store_id: { notIn: storeIds } } });

  for (const storeId of storeIds) {
    await tx.user_stores.upsert({
      where: { user_id_store_id: { user_id: userId, store_id: storeId } },
      create: {
        user_id: userId,
        store_id: storeId,
        role_id: input.roleId ?? null,
        is_primary: storeId === primary,
        is_active: true,
      },
      update: {
        role_id: input.roleId ?? undefined,
        is_primary: storeId === primary,
        is_active: true,
        updated_at: new Date(),
      },
    });
  }
};

export const UserService = {
  // 1. Lấy danh sách Users
  getAllUsers: async () => {
    const users = await prisma.users.findMany({
      include: {
        roles: true,
        stores: true,
        user_stores: {
          include: { stores: true, roles: true },
          orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
        },
      },
      orderBy: { id: 'desc' },
    });

    return users.map(({ password_hash, ...rest }) => rest);
  },

  // 2. Lấy chi tiết 1 User
  getUserById: async (id: string) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: {
        roles: true,
        stores: true,
        user_stores: {
          include: { stores: true, roles: true },
          orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
        },
      },
    });

    if (!user) throw new Error('User not found');

    const { password_hash, ...result } = user;
    return result;
  },

  // 3. TẠO USER MỚI
  createUser: async (data: CreateUserDto) => {
    const username = (data.username ?? data.email.split('@')[0]).trim();
    if (!username) throw new Error('username is required');

    if (data.email) {
      const existingEmail = await prisma.users.findFirst({ where: { email: data.email } });
      if (existingEmail) throw new Error('Email is already in use.');
    }

    const existingUsername = await prisma.users.findFirst({ where: { username } });
    if (existingUsername) throw new Error('Username is already in use.');

    const roleId = Number(data.roleId);
    if (!Number.isFinite(roleId)) throw new Error('Invalid roleId');
    const roleExists = await prisma.roles.findUnique({ where: { id: roleId } });
    if (!roleExists) throw new Error('Role not found.');

    const storeInput = normalizeStoreIds({ storeId: data.storeId, storeIds: data.storeIds, primaryStoreId: data.primaryStoreId });
    if (storeInput.storeIds.length > 0) {
      const storesCount = await prisma.stores.count({ where: { id: { in: storeInput.storeIds } } });
      if (storesCount !== storeInput.storeIds.length) throw new Error('One or more stores not found.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.users.create({
        data: {
          username,
          password_hash: hashedPassword,
          full_name: data.name ?? null,
          email: data.email ?? null,
          role_id: roleId,
          // legacy store_id remains primary store for compatibility
          store_id: storeInput.primaryStoreId ?? null,
          is_active: true,
        },
        include: { roles: true, stores: true },
      });

      if (storeInput.storeIds.length > 0) {
        await syncUserStores(tx, createdUser.id, { storeIds: storeInput.storeIds, primaryStoreId: storeInput.primaryStoreId, roleId: null });
      }

      return tx.users.findUnique({
        where: { id: createdUser.id },
        include: {
          roles: true,
          stores: true,
          user_stores: { include: { stores: true, roles: true }, orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }] },
        },
      });
    });

    const { password_hash, ...result } = created as any;
    return result;
  },

  // 4. CẬP NHẬT USER
  updateUser: async (id: string, data: UpdateUserDto) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    if (data.email && data.email !== user.email) {
      const dup = await prisma.users.findFirst({
        where: { email: data.email, id: { not: userId } },
      });
      if (dup) throw new Error('Email is already taken.');
    }

    if (data.username && data.username !== user.username) {
      const dup = await prisma.users.findFirst({
        where: { username: data.username, id: { not: userId } },
      });
      if (dup) throw new Error('Username is already taken.');
    }

    let updatedPasswordHash = user.password_hash;
    if (data.password) {
      updatedPasswordHash = await bcrypt.hash(data.password, 10);
    }

    const storeInput = normalizeStoreIds({ storeId: data.storeId, storeIds: data.storeIds, primaryStoreId: data.primaryStoreId });

    const updatedUser = await prisma.$transaction(async (tx) => {
      const updated = await tx.users.update({
        where: { id: userId },
        data: {
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.username !== undefined ? { username: data.username } : {}),
          ...(data.name !== undefined ? { full_name: data.name } : {}),
          ...(data.roleId !== undefined ? { role_id: data.roleId } : {}),
          ...(data.storeId !== undefined || data.primaryStoreId !== undefined ? { store_id: storeInput.primaryStoreId } : {}),
          ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
          password_hash: updatedPasswordHash,
          updated_at: new Date(),
        },
        include: { roles: true, stores: true },
      });

      if (data.storeIds !== undefined || data.storeId !== undefined || data.primaryStoreId !== undefined) {
        await syncUserStores(tx, userId, { storeIds: storeInput.storeIds, primaryStoreId: storeInput.primaryStoreId, roleId: null });
      }

      return tx.users.findUnique({
        where: { id: updated.id },
        include: {
          roles: true,
          stores: true,
          user_stores: { include: { stores: true, roles: true }, orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }] },
        },
      });
    });

    const { password_hash, ...result } = updatedUser as any;
    return result;
  },

  getUserStores: async (id: string) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const items = await prisma.user_stores.findMany({
      where: { user_id: userId, is_active: true },
      include: { stores: true, roles: true },
      orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
    });

    return items.map((us) => ({
      storeId: us.store_id,
      isPrimary: Boolean(us.is_primary),
      isActive: Boolean(us.is_active),
      roleId: us.role_id,
      store: us.stores,
      role: us.roles,
    }));
  },

  setUserStores: async (id: string, data: { storeIds: number[]; primaryStoreId?: number | null }) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const storeIds = Array.isArray(data.storeIds)
      ? data.storeIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [];
    const primaryStoreId = data.primaryStoreId !== undefined && data.primaryStoreId !== null ? Number(data.primaryStoreId) : null;

    const updated = await prisma.$transaction(async (tx) => {
      await syncUserStores(tx, userId, { storeIds, primaryStoreId, roleId: null });

      const primary = primaryStoreId && storeIds.includes(primaryStoreId) ? primaryStoreId : storeIds[0] ?? null;
      await tx.users.update({ where: { id: userId }, data: { store_id: primary, updated_at: new Date() } });

      return tx.user_stores.findMany({
        where: { user_id: userId },
        include: { stores: true, roles: true },
        orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
      });
    });

    return updated;
  },

  // 5. XÓA USER (SOFT DELETE)
  deleteUser: async (id: string) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    return prisma.users.update({
      where: { id: userId },
      data: { is_active: false },
    });
  },
};