import { Prisma } from '@prisma/client'

import prisma from '../../db/prisma';

interface GetLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  objectType?: string; // Map với object_type trong DB
  userId?: number;
  startDate?: Date;
  endDate?: Date;
}

interface CreateLogDto {
  action: string;
  objectType?: string; // Tên resource (ví dụ: SUPPLIER, PRODUCT)
  objectId?: string;   // ID của resource
  userId?: number;
  payload?: any;       // Chi tiết thay đổi
}

export const AuditLogsService = {
  // 1. GHI LOG (Thay thế hoàn toàn file audit.service.ts cũ)
  createLog: async (dto: CreateLogDto) => {
    try {
      await prisma.audit_logs.create({
        data: {
          action: dto.action,
          object_type: dto.objectType,
          object_id: dto.objectId,
          user_id: dto.userId,
          // Payload là Json?, Prisma tự xử lý object JS thành JSON DB
          payload: dto.payload ? JSON.parse(JSON.stringify(dto.payload)) : Prisma.JsonNull, 
        }
      });
    } catch (error) {
      // Ghi log thất bại không được làm sập app, chỉ console.error
      console.error('Failed to write audit log:', error);
    }
  },

  // 2. XEM LOG (Dành cho Admin Dashboard)
  getLogs: async ({ page = 1, limit = 20, action, objectType, userId, startDate, endDate }: GetLogsParams) => {
    const skip = (page - 1) * limit;

    // Mapping điều kiện lọc theo Schema mới
    const whereCondition: Prisma.audit_logsWhereInput = {};

    if (action) whereCondition.action = action;
    if (objectType) whereCondition.object_type = objectType;
    if (userId) whereCondition.user_id = userId;
    
    if (startDate && endDate) {
      whereCondition.created_at = {
        gte: startDate,
        lte: endDate
      };
    }

    const [total, logs] = await Promise.all([
      prisma.audit_logs.count({ where: whereCondition }),
      prisma.audit_logs.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          // Join bảng users để lấy tên người thực hiện
          users: {
            select: {
              // Sửa các trường này cho khớp với bảng users của bạn (ví dụ: full_name hay username)
              id: true,
              email: true, 
              // full_name: true 
            }
          }
        }
      })
    ]);

    // XỬ LÝ BIGINT: Convert BigInt sang String để tránh lỗi JSON
    const serializedLogs = logs.map((log: Prisma.audit_logsGetPayload<{ include: { users: { select: { id: true; email: true } } } }>) => ({
      ...log,
      id: log.id.toString(), // Quan trọng!
    }));

    return {
      data: serializedLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
};