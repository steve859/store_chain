import axiosClient from "./axiosClient";

export async function listSuppliers({ search = "", page = 1, limit = 200 } = {}) {
  const res = await axiosClient.get("/suppliers", {
    params: {
      search: search || undefined,
      page,
      limit,
    },
  });
  // Backend returns { data, pagination }
  return res.data;
}
