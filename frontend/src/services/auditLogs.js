import axiosClient from "./axiosClient";

export async function listAuditLogs({ storeId, action, objectType, objectId, userId, take = 50, skip = 0 } = {}) {
  const res = await axiosClient.get("/audit-logs", {
    params: {
      storeId,
      action,
      objectType,
      objectId,
      userId,
      take,
      skip,
    },
  });
  return res.data;
}

export async function getAuditLog(id) {
  const res = await axiosClient.get(`/audit-logs/${id}`);
  return res.data;
}
