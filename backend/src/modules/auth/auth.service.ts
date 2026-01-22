import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import prisma from '../../db/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

export const login = async (email: string, password: string) => {
  // Cho phép login bằng email hoặc username (frontend đang dùng email)
  const user = await prisma.users.findFirst({
    where: {
      OR: [{ email }, { username: email }],
      is_active: true,
    },
    include: { roles: true, stores: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const userStores = await prisma.user_stores.findMany({
    where: { user_id: user.id, is_active: true },
    include: { stores: true, roles: true },
    orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
  });

  const storeIdsFromJoin = userStores.map((us) => us.store_id);
  const primaryFromJoin = userStores.find((us) => us.is_primary)?.store_id ?? null;

  // Admin fallback: allow all active stores if no explicit mapping
  const adminFallbackStores =
    (user.roles?.name ?? '').toLowerCase() === 'admin' && userStores.length === 0
      ? await prisma.stores.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } })
      : [];

  const allowedStores =
    userStores.length > 0
      ? userStores.map((us) => ({
          storeId: us.store_id,
          code: us.stores.code,
          name: us.stores.name,
          isPrimary: Boolean(us.is_primary),
          role: us.roles?.name ?? null,
        }))
      : adminFallbackStores.map((s) => ({
          storeId: s.id,
          code: s.code,
          name: s.name,
          isPrimary: user.store_id ? s.id === user.store_id : false,
          role: null,
        }));

  const primaryStoreId = primaryFromJoin ?? user.store_id ?? allowedStores[0]?.storeId ?? null;

  // 3. Tạo JWT Token
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.roles?.name,
    storeId: user.store_id,
    storeIds: storeIdsFromJoin.length > 0 ? storeIdsFromJoin : allowedStores.map((s) => s.storeId),
    primaryStoreId,
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1d' });

  return {
    token,
    user: {
      id: user.id,
      name: user.full_name,
      username: user.username,
      email: user.email,
      role: user.roles?.name,
      storeId: user.store_id,
      primaryStoreId,
      stores: allowedStores,
    },
  };
};

export const me = async (userId: number) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: { roles: true, stores: true },
  });
  if (!user) throw new Error('User not found');

  const userStores = await prisma.user_stores.findMany({
    where: { user_id: user.id, is_active: true },
    include: { stores: true, roles: true },
    orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
  });

  const allowedStores = userStores.map((us) => ({
    storeId: us.store_id,
    code: us.stores.code,
    name: us.stores.name,
    isPrimary: Boolean(us.is_primary),
    role: us.roles?.name ?? null,
  }));

  const primaryStoreId = userStores.find((us) => us.is_primary)?.store_id ?? user.store_id ?? allowedStores[0]?.storeId ?? null;

  return {
    id: user.id,
    name: user.full_name,
    username: user.username,
    email: user.email,
    role: user.roles?.name,
    storeId: user.store_id,
    primaryStoreId,
    stores: allowedStores,
  };
};
