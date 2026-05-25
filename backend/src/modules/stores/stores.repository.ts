import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

export const StoresRepository = {
  aggregateMaxId: () =>
    prisma.stores.aggregate({
      _max: { id: true },
    }),

  findMany: ({ where, take, skip }: { where: Prisma.storesWhereInput; take: number; skip: number }) =>
    prisma.stores.findMany({
      where,
      orderBy: { id: 'desc' },
      take,
      skip,
    }),

  count: (where: Prisma.storesWhereInput) => prisma.stores.count({ where }),

  countUsersByStore: (storeIds: number[]) =>
    prisma.users.groupBy({
      by: ['store_id'],
      where: { store_id: { in: storeIds }, is_active: true },
      _count: { _all: true },
    }),

  countInventoriesByStore: (storeIds: number[]) =>
    prisma.inventories.groupBy({
      by: ['store_id'],
      where: { store_id: { in: storeIds } },
      _count: { _all: true },
    }),

  countInvoicesByStore: (storeIds: number[]) =>
    prisma.invoices.groupBy({
      by: ['store_id'],
      where: { store_id: { in: storeIds } },
      _count: { _all: true },
    }),

  findById: (storeId: number) => prisma.stores.findUnique({ where: { id: storeId } }),

  findEmployeesForOverview: (storeId: number) =>
    prisma.users.findMany({
      where: { store_id: storeId, is_active: true },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        username: true,
        full_name: true,
        email: true,
        phone: true,
        role_id: true,
        roles: { select: { name: true } },
      },
    }),

  findInventoriesForOverview: (storeId: number) =>
    prisma.inventories.findMany({
      where: { store_id: storeId },
      orderBy: [{ quantity: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true,
        quantity: true,
        reserved: true,
        last_update: true,
        product_variants: {
          select: {
            id: true,
            barcode: true,
            name: true,
            price: true,
            products: { select: { id: true, name: true } },
          },
        },
      },
    }),

  findInvoicesForOverview: (storeId: number) =>
    prisma.invoices.findMany({
      where: { store_id: storeId },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: {
        id: true,
        invoice_number: true,
        total: true,
        created_at: true,
        customers: { select: { name: true, phone: true } },
      },
    }),

  create: (data: Prisma.storesCreateInput) => prisma.stores.create({ data }),

  update: (storeId: number, data: Prisma.storesUpdateInput) =>
    prisma.stores.update({
      where: { id: storeId },
      data,
    }),

  deactivate: (storeId: number) =>
    prisma.stores.update({
      where: { id: storeId },
      data: { is_active: false },
    }),
};
