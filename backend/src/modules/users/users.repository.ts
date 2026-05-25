import type { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

type UserStoreSyncInput = {
  storeIds: number[];
  primaryStoreId: number | null;
  roleId?: number | null;
};

const userInclude = {
  roles: true,
  stores: true,
  user_stores: {
    include: { stores: true, roles: true },
    orderBy: [{ is_primary: 'desc' as const }, { store_id: 'asc' as const }],
  },
};

const syncUserStores = async (tx: Prisma.TransactionClient, userId: number, input: UserStoreSyncInput) => {
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

export const UsersRepository = {
  findRolesForMeta: () => prisma.roles.findMany({ orderBy: { id: 'asc' } }),

  findStoresForMeta: () => prisma.stores.findMany({ where: { is_active: true }, orderBy: { id: 'asc' } }),

  findAllWithRelations: () =>
    prisma.users.findMany({
      include: userInclude,
      orderBy: { id: 'desc' },
    }),

  findById: (userId: number) => prisma.users.findUnique({ where: { id: userId } }),

  findByIdWithRelations: (userId: number) =>
    prisma.users.findUnique({
      where: { id: userId },
      include: userInclude,
    }),

  findByEmail: (email: string) => prisma.users.findFirst({ where: { email } }),

  findByUsername: (username: string) => prisma.users.findFirst({ where: { username } }),

  findDuplicateEmail: (email: string, userId: number) =>
    prisma.users.findFirst({
      where: { email, id: { not: userId } },
    }),

  findDuplicateUsername: (username: string, userId: number) =>
    prisma.users.findFirst({
      where: { username, id: { not: userId } },
    }),

  findRoleById: (roleId: number) => prisma.roles.findUnique({ where: { id: roleId } }),

  countStoresByIds: (storeIds: number[]) => prisma.stores.count({ where: { id: { in: storeIds } } }),

  createWithStores: (
    data: {
      username: string;
      passwordHash: string;
      fullName: string | null;
      email: string | null;
      roleId: number;
      primaryStoreId: number | null;
    },
    storeInput: UserStoreSyncInput,
  ) =>
    prisma.$transaction(async (tx) => {
      const createdUser = await tx.users.create({
        data: {
          username: data.username,
          password_hash: data.passwordHash,
          full_name: data.fullName,
          email: data.email,
          role_id: data.roleId,
          // legacy store_id remains primary store for compatibility
          store_id: data.primaryStoreId,
          is_active: true,
        },
        include: { roles: true, stores: true },
      });

      if (storeInput.storeIds.length > 0) {
        await syncUserStores(tx, createdUser.id, storeInput);
      }

      return tx.users.findUnique({
        where: { id: createdUser.id },
        include: userInclude,
      });
    }),

  updateWithStores: (
    userId: number,
    data: Prisma.usersUpdateInput,
    shouldSyncStores: boolean,
    storeInput: UserStoreSyncInput,
  ) =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.users.update({
        where: { id: userId },
        data,
        include: { roles: true, stores: true },
      });

      if (shouldSyncStores) {
        await syncUserStores(tx, userId, storeInput);
      }

      return tx.users.findUnique({
        where: { id: updated.id },
        include: userInclude,
      });
    }),

  findActiveUserStores: (userId: number) =>
    prisma.user_stores.findMany({
      where: { user_id: userId, is_active: true },
      include: { stores: true, roles: true },
      orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
    }),

  findUserStoresForAudit: (userId: number) =>
    prisma.user_stores.findMany({
      where: { user_id: userId },
      orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
    }),

  setUserStores: (userId: number, storeInput: UserStoreSyncInput) =>
    prisma.$transaction(async (tx) => {
      await syncUserStores(tx, userId, storeInput);

      const primary =
        storeInput.primaryStoreId && storeInput.storeIds.includes(storeInput.primaryStoreId)
          ? storeInput.primaryStoreId
          : storeInput.storeIds[0] ?? null;
      await tx.users.update({ where: { id: userId }, data: { store_id: primary, updated_at: new Date() } });

      return tx.user_stores.findMany({
        where: { user_id: userId },
        include: { stores: true, roles: true },
        orderBy: [{ is_primary: 'desc' }, { store_id: 'asc' }],
      });
    }),

  deactivate: (userId: number) =>
    prisma.users.update({
      where: { id: userId },
      data: { is_active: false },
    }),
};
