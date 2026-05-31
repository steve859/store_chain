import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

export const SuppliersRepository = {
  count: (where: Prisma.suppliersWhereInput) => prisma.suppliers.count({ where }),

  findMany: ({
    where,
    skip,
    take,
  }: {
    where: Prisma.suppliersWhereInput;
    skip: number;
    take: number;
  }) =>
    prisma.suppliers.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
    }),

  findById: (id: number) => prisma.suppliers.findUnique({ where: { id } }),

  findByPhone: (phone: string) => prisma.suppliers.findFirst({ where: { phone } }),

  findByEmail: (email: string) => prisma.suppliers.findFirst({ where: { email } }),

  findDuplicatePhone: (phone: string, excludedId: number) =>
    prisma.suppliers.findFirst({
      where: { phone, id: { not: excludedId } },
    }),

  findDuplicateEmail: (email: string, excludedId: number) =>
    prisma.suppliers.findFirst({
      where: { email, id: { not: excludedId } },
    }),

  create: (data: Prisma.suppliersUncheckedCreateInput) => prisma.suppliers.create({ data }),

  update: (id: number, data: Prisma.suppliersUncheckedUpdateInput) =>
    prisma.suppliers.update({
      where: { id },
      data,
    }),

  delete: (id: number) => prisma.suppliers.delete({ where: { id } }),
};
