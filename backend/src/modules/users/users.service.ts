import bcrypt from 'bcrypt';

import prisma from '../../db/prisma';

// DTO cho tạo mới
interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  roleId: number;
  storeId?: number | null;
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
  username?: string;
  isActive?: boolean;
}

export const UserService = {
  // 1. Lấy danh sách Users
  getAllUsers: async () => {
    return prisma.users.findMany({
      include: {
        roles: true,
        stores: true,
      },
      orderBy: { id: 'desc' },
    });
  },

  // 2. Lấy chi tiết 1 User
  getUserById: async (id: string) => {
    const userId = Number(id);
    if (!Number.isFinite(userId)) throw new Error('Invalid user id');

    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { roles: true, stores: true },
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

    if (data.storeId !== undefined && data.storeId !== null) {
      const storeId = Number(data.storeId);
      if (!Number.isFinite(storeId)) throw new Error('Invalid storeId');
      const storeExists = await prisma.stores.findUnique({ where: { id: storeId } });
      if (!storeExists) throw new Error('Store not found.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const created = await prisma.users.create({
      data: {
        username,
        password_hash: hashedPassword,
        full_name: data.name ?? null,
        email: data.email ?? null,
        role_id: roleId,
        store_id: data.storeId ?? null,
        is_active: true,
      },
      include: { roles: true, stores: true },
    });

    const { password_hash, ...result } = created;
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

    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.name !== undefined ? { full_name: data.name } : {}),
        ...(data.roleId !== undefined ? { role_id: data.roleId } : {}),
        ...(data.storeId !== undefined ? { store_id: data.storeId } : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
        password_hash: updatedPasswordHash,
      },
      include: { roles: true, stores: true },
    });

    const { password_hash, ...result } = updatedUser;
    return result;
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
  }
};