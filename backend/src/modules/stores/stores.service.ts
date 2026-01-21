import prisma from '../../db/prisma';

// Interface DTO
interface CreateStoreDto {
  name: string;
  code: string;
  timezone?: string;
  address?: string;
  phone?: string;
}

interface UpdateStoreDto {
  name?: string;
  code?: string;
  timezone?: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
}

export const StoreService = {
  // Lấy tất cả
  getAllStores: async () => {
    return prisma.stores.findMany({
      orderBy: { id: 'desc' },
    });
  },

  // Lấy 1 store (ID là string)
  getStoreById: async (id: string) => { 
    const storeId = Number(id);
    if (!Number.isFinite(storeId)) throw new Error('Invalid store id');

    const store = await prisma.stores.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Store not found');
    return store;
  },

  // Tạo mới
  createStore: async (data: CreateStoreDto) => {
    // Validate Code
    const existingCode = await prisma.stores.findUnique({ where: { code: data.code } });

    if (existingCode) {
      throw new Error(`Store code "${data.code}" already exists.`);
    }

    // Validate Timezone
    const timezone = data.timezone || 'Asia/Ho_Chi_Minh';
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch (e) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }

    return prisma.stores.create({
      data: {
        code: data.code,
        name: data.name,
        address: data.address ?? null,
        phone: data.phone ?? null,
        timezone,
        is_active: true,
      },
    });
  },

  // Cập nhật (ID là string)
  updateStore: async (id: string, data: UpdateStoreDto) => {
    const storeId = Number(id);
    if (!Number.isFinite(storeId)) throw new Error('Invalid store id');

    const store = await prisma.stores.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Store not found');

    if (data.code && data.code !== store.code) {
      const duplicate = await prisma.stores.findUnique({ where: { code: data.code } });
      if (duplicate) {
        throw new Error(`Store code "${data.code}" is already taken by another store.`);
      }
    }

    return prisma.stores.update({
      where: { id: storeId },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.address !== undefined ? { address: data.address ?? null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone ?? null } : {}),
        ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
      },
    });
  },

  // Xóa (ID là string)
  deleteStore: async (id: string) => {
    const storeId = Number(id);
    if (!Number.isFinite(storeId)) throw new Error('Invalid store id');

    const store = await prisma.stores.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Store not found');

    const [usersCount, inventoriesCount, invoicesCount] = await Promise.all([
      prisma.users.count({ where: { store_id: storeId } }),
      prisma.inventories.count({ where: { store_id: storeId } }),
      prisma.invoices.count({ where: { store_id: storeId } }),
    ]);

    if (usersCount > 0) {
      throw new Error(`Cannot delete store. It has ${usersCount} assigned users.`);
    }
    if (inventoriesCount > 0) {
      throw new Error(`Cannot delete store. It contains inventory records.`);
    }
    if (invoicesCount > 0) {
      throw new Error(`Cannot delete store. It has historical invoices.`);
    }

    return prisma.stores.delete({ where: { id: storeId } });
  }
};