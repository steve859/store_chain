import axiosClient from "./axiosClient";

export async function getDashboardStats({ storeId, from, to } = {}) {
  const res = await axiosClient.get("/reports/dashboard", {
    params: {
      storeId: storeId ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
    },
  });
  return res.data;
}
