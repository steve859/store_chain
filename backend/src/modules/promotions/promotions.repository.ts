import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

export const PromotionsRepository = {
  findMany: () =>
    prisma.promotions.findMany({
      orderBy: { created_at: 'desc' },
    }),

  findById: (id: number) => prisma.promotions.findUnique({ where: { id } }),

  findByCode: (code: string) => prisma.promotions.findUnique({ where: { code } }),

  create: (data: Prisma.promotionsCreateInput) => prisma.promotions.create({ data }),

  update: (id: number, data: Prisma.promotionsUpdateInput) =>
    prisma.promotions.update({
      where: { id },
      data,
    }),

  delete: (id: number) =>
    prisma.promotions.delete({
      where: { id },
    }),
};
