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

export async function getSupplier(id) {
  const res = await axiosClient.get(`/suppliers/${id}`);
  return res.data;
}

export async function createSupplier(payload) {
  const res = await axiosClient.post("/suppliers", payload);
  return res.data;
}

export async function updateSupplier(id, payload) {
  const res = await axiosClient.put(`/suppliers/${id}`, payload);
  return res.data;
}

export async function deleteSupplier(id) {
  const res = await axiosClient.delete(`/suppliers/${id}`);
  return res.data;
}
