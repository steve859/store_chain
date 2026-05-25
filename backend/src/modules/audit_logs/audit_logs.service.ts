import { Prisma } from '@prisma/client';
import { AuditLogsRepository } from './audit_logs.repository';

export interface GetLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  objectType?: string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
}

interface CreateLogDto {
  action: string;
  objectType?: string;
  objectId?: string;
  userId?: number;
  payload?: unknown;
}

export const AuditLogsService = {
  createLog: async (dto: CreateLogDto) => {
    try {
      await AuditLogsRepository.create({
        action: dto.action,
        object_type: dto.objectType,
        object_id: dto.objectId,
        user_id: dto.userId,
        payload: dto.payload ? (JSON.parse(JSON.stringify(dto.payload)) as Prisma.InputJsonValue) : Prisma.JsonNull,
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  },

  getLogs: async ({ page = 1, limit = 20, action, objectType, userId, startDate, endDate }: GetLogsParams) => {
    const skip = (page - 1) * limit;
    const whereCondition: Prisma.audit_logsWhereInput = {};

    if (action) whereCondition.action = action;
    if (objectType) whereCondition.object_type = objectType;
    if (userId) whereCondition.user_id = userId;

    if (startDate && endDate) {
      whereCondition.created_at = {
        gte: startDate,
        lte: endDate,
      };
    }

    const [total, logs] = await Promise.all([
      AuditLogsRepository.count(whereCondition),
      AuditLogsRepository.findMany({ where: whereCondition, skip, take: limit }),
    ]);

    const serializedLogs = logs.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));

    return {
      data: serializedLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};
