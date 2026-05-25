import bcrypt from 'bcrypt';

import { UsersRepository } from './users.repository';

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

const withoutPasswordHash = <T extends { password_hash?: unknown }>(user: T) => {
  const result = { ...user };
  delete result.password_hash;
  return result;
};

export const UserService = {
  // 1. Lấy danh sách Users
  getAllUsers: async () => {
    const users = await UsersRepository.findAllWithRelations();

    return users.map((user) => withoutPasswordHash(user));
  },

  // 2. Lấy chi tiết 1 User
  getUserById: async (id: string) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await UsersRepository.findByIdWithRelations(userId);

    if (!user) throw new Error('User not found');

    return withoutPasswordHash(user);
  },

  // 3. TẠO USER MỚI
  createUser: async (data: CreateUserDto) => {
    const username = (data.username ?? data.email.split('@')[0]).trim();
    if (!username) throw new Error('username is required');

    if (data.email) {
      const existingEmail = await UsersRepository.findByEmail(data.email);
      if (existingEmail) throw new Error('Email is already in use.');
    }

    const existingUsername = await UsersRepository.findByUsername(username);
    if (existingUsername) throw new Error('Username is already in use.');

    const roleId = Number(data.roleId);
    if (!Number.isFinite(roleId)) throw new Error('Invalid roleId');
    const roleExists = await UsersRepository.findRoleById(roleId);
    if (!roleExists) throw new Error('Role not found.');

    const storeInput = normalizeStoreIds({ storeId: data.storeId, storeIds: data.storeIds, primaryStoreId: data.primaryStoreId });
    if (storeInput.storeIds.length > 0) {
      const storesCount = await UsersRepository.countStoresByIds(storeInput.storeIds);
      if (storesCount !== storeInput.storeIds.length) throw new Error('One or more stores not found.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const created = await UsersRepository.createWithStores({
      username,
      passwordHash: hashedPassword,
      fullName: data.name ?? null,
      email: data.email ?? null,
      roleId,
      primaryStoreId: storeInput.primaryStoreId ?? null,
    }, {
      storeIds: storeInput.storeIds,
      primaryStoreId: storeInput.primaryStoreId,
      roleId: null,
    });

    return withoutPasswordHash(created!);
  },

  // 4. CẬP NHẬT USER
  updateUser: async (id: string, data: UpdateUserDto) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await UsersRepository.findById(userId);
    if (!user) throw new Error('User not found');

    if (data.email && data.email !== user.email) {
      const dup = await UsersRepository.findDuplicateEmail(data.email, userId);
      if (dup) throw new Error('Email is already taken.');
    }

    if (data.username && data.username !== user.username) {
      const dup = await UsersRepository.findDuplicateUsername(data.username, userId);
      if (dup) throw new Error('Username is already taken.');
    }

    let updatedPasswordHash = user.password_hash;
    if (data.password) {
      updatedPasswordHash = await bcrypt.hash(data.password, 10);
    }

    const storeInput = normalizeStoreIds({ storeId: data.storeId, storeIds: data.storeIds, primaryStoreId: data.primaryStoreId });

    const updatedUser = await UsersRepository.updateWithStores(
      userId,
      {
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.name !== undefined ? { full_name: data.name } : {}),
        ...(data.roleId !== undefined ? { role_id: data.roleId } : {}),
        ...(data.storeId !== undefined || data.primaryStoreId !== undefined ? { store_id: storeInput.primaryStoreId } : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
        password_hash: updatedPasswordHash,
        updated_at: new Date(),
      },
      data.storeIds !== undefined || data.storeId !== undefined || data.primaryStoreId !== undefined,
      { storeIds: storeInput.storeIds, primaryStoreId: storeInput.primaryStoreId, roleId: null },
    );

    return withoutPasswordHash(updatedUser!);
  },

  getUserStores: async (id: string) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const items = await UsersRepository.findActiveUserStores(userId);

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

    const user = await UsersRepository.findById(userId);
    if (!user) throw new Error('User not found');

    const storeIds = Array.isArray(data.storeIds)
      ? data.storeIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [];
    const primaryStoreId = data.primaryStoreId !== undefined && data.primaryStoreId !== null ? Number(data.primaryStoreId) : null;

    const updated = await UsersRepository.setUserStores(userId, { storeIds, primaryStoreId, roleId: null });

    return updated;
  },

  // 5. XÓA USER (SOFT DELETE)
  deleteUser: async (id: string) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await UsersRepository.findById(userId);
    if (!user) throw new Error('User not found');

    return UsersRepository.deactivate(userId);
  },
};
