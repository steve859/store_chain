import { Prisma } from '@prisma/client'
import prisma from '../../db/prisma';

interface CreateSupplierDto {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  contactPerson?: string;
  note?: string;
}

interface UpdateSupplierDto extends Partial<CreateSupplierDto> {}

interface GetSuppliersParams {
  page?: number;
  limit?: number;
  search?: string;
}

export const SuppliersService = {
  // 1. Lấy danh sách
  getAllSuppliers: async ({ page = 1, limit = 10, search }: GetSuppliersParams) => {
    const skip = (page - 1) * limit;

    const whereCondition: Prisma.suppliersWhereInput = {};

    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { contact_name: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [total, suppliers] = await Promise.all([
      prisma.suppliers.count({ where: whereCondition }),
      prisma.suppliers.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }
      })
    ]);

    return {
      data: suppliers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  // ... (Các hàm getSupplierById, create, update giữ nguyên logic cũ) ...

  getSupplierById: async (id: string) => {
    const supplierId = Number(id);
    if (!Number.isFinite(supplierId)) throw new Error('Invalid supplier id');

    const supplier = await prisma.suppliers.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new Error('Supplier not found');
    return supplier;
  },

  createSupplier: async (data: CreateSupplierDto) => {
    if (data.phone) {
      const existingPhone = await prisma.suppliers.findFirst({
        where: { phone: data.phone },
      });
      if (existingPhone) throw new Error('Supplier with this phone number already exists.');
    }

    if (data.email) {
      const existingEmail = await prisma.suppliers.findFirst({ where: { email: data.email } });
      if (existingEmail) throw new Error('Supplier with this email already exists.');
    }

    return prisma.suppliers.create({
      data: {
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        contact_name: data.contactPerson ?? null,
        note: data.note ?? null,
      },
    });
  },

  updateSupplier: async (id: string, data: UpdateSupplierDto) => {
    const supplierId = Number(id);
    if (!Number.isFinite(supplierId)) throw new Error('Invalid supplier id');

    const supplier = await prisma.suppliers.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new Error('Supplier not found');

    if (data.phone && data.phone !== supplier.phone) {
      const duplicate = await prisma.suppliers.findFirst({
        where: { phone: data.phone, id: { not: supplierId } },
      });
      if (duplicate) throw new Error('Phone number is already taken.');
    }

    if (data.email && data.email !== supplier.email) {
      const duplicateEmail = await prisma.suppliers.findFirst({
        where: { email: data.email, id: { not: supplierId } },
      });
      if (duplicateEmail) throw new Error('Email is already taken.');
    }

    return prisma.suppliers.update({
      where: { id: supplierId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
        ...(data.email !== undefined ? { email: data.email ?? null } : {}),
        ...(data.address !== undefined ? { address: data.address ?? null } : {}),
        ...(data.contactPerson !== undefined ? { contact_name: data.contactPerson ?? null } : {}),
        ...(data.note !== undefined ? { note: data.note ?? null } : {}),
      },
    });
  },

  deleteSupplier: async (id: string) => {
    await SuppliersService.getSupplierById(id);
    const supplierId = Number(id);
    return prisma.suppliers.delete({ where: { id: supplierId } });
  }
};