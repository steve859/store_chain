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

export async function getRevenueChart({ storeId, from, to } = {}) {
  const res = await axiosClient.get("/reports/revenue-chart", {
    params: { storeId, from, to },
  });
  return res.data;
}

export async function getTopProducts({ storeId, from, to } = {}) {
  const res = await axiosClient.get("/reports/top-products", {
    params: { storeId, from, to },
  });
  return res.data;
}
