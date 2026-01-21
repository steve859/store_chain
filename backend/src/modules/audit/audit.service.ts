import prisma from '../../db/prisma';

interface AuditLogParams {
  userId: string | number;
  action: string;      // VD: 'CREATE_USER', 'UPDATE_STORE'
  entity: string;      // VD: 'User', 'Store'
  entityId?: string;   // ID của đối tượng bị tác động
  detail?: object;     // Chi tiết thay đổi (JSON)
}

export const logAction = async (params: AuditLogParams) => {
  try {
    const userIdNum = typeof params.userId === 'number' ? params.userId : Number(params.userId);

    await prisma.audit_logs.create({
      data: {
        action: params.action,
        object_type: params.entity,
        object_id: params.entityId,
        user_id: Number.isFinite(userIdNum) ? userIdNum : null,
        payload: params.detail ? JSON.parse(JSON.stringify(params.detail)) : null,
      },
    });
    // Không cần await hoặc log success để tránh block main thread quá lâu
    // trừ khi transaction yêu cầu chặt chẽ.
  } catch (error) {
    console.error('❌ Failed to write audit log:', error);
    // Tùy nghiệp vụ: Có thể throw error để rollback transaction chính
  }
};