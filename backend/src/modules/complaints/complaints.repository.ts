import type { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

export const ComplaintsRepository = {
  findMany: (where: Prisma.complaintsWhereInput, take: number, skip: number) =>
    prisma.complaints.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take,
      skip,
    }),

  count: (where: Prisma.complaintsWhereInput) => prisma.complaints.count({ where }),

  findByCode: (code: string) => prisma.complaints.findFirst({ where: { code } }),

  findById: (id: number) => prisma.complaints.findUnique({ where: { id } }),

  findStoreById: (id: number) => prisma.stores.findUnique({ where: { id } }),

  createWithCode: (data: Prisma.complaintsCreateInput) =>
    prisma.$transaction(async (tx) => {
      const row = await tx.complaints.create({ data });

      const code = `CPL-${String(row.id).padStart(6, '0')}`;
      return tx.complaints.update({ where: { id: row.id }, data: { code } });
    }),

  update: (id: number, data: Prisma.complaintsUpdateInput) =>
    prisma.complaints.update({
      where: { id },
      data,
    }),

  delete: (id: number) => prisma.complaints.delete({ where: { id } }),
};
