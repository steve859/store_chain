import type { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

export const InvoicesRepository = {
  findMany: ({ where, take, skip }: { where: Prisma.invoicesWhereInput; take: number; skip: number }) =>
    prisma.invoices.findMany({
      where,
      include: {
        stores: true,
        users: { select: { id: true, username: true, full_name: true, email: true } },
        _count: { select: { invoice_items: true } },
      },
      orderBy: { id: 'desc' },
      take,
      skip,
    }),

  count: (where: Prisma.invoicesWhereInput) => prisma.invoices.count({ where }),

  findDetailById: (invoiceId: number) =>
    prisma.invoices.findUnique({
      where: { id: invoiceId },
      include: {
        stores: true,
        users: { select: { id: true, username: true, full_name: true, email: true } },
        invoice_items: {
          include: {
            product_variants: {
              include: {
                products: true,
              },
            },
          },
        },
      },
    }),
};
