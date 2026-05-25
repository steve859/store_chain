import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';

type AuditLogWithUser = Prisma.audit_logsGetPayload<{
  include: { users: { select: { id: true; email: true } } };
}>;

interface FindManyParams {
  where: Prisma.audit_logsWhereInput;
  skip: number;
  take: number;
}

export const AuditLogsRepository = {
  create: async (data: Prisma.audit_logsUncheckedCreateInput) => {
    return prisma.audit_logs.create({ data });
  },

  count: async (where: Prisma.audit_logsWhereInput): Promise<number> => {
    return prisma.audit_logs.count({ where });
  },

  findMany: async ({ where, skip, take }: FindManyParams): Promise<AuditLogWithUser[]> => {
    return prisma.audit_logs.findMany({
      where,
      skip,
      take,
      orderBy: { created_at: 'desc' },
      include: {
        users: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  },
};
