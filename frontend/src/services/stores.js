import axiosClient from "./axiosClient";

export async function listStores({ q = "", take = 50, skip = 0, includeStats = true } = {}) {
  const res = await axiosClient.get("/stores", {
    params: {
      q: q || undefined,
      take,
      skip,
      includeStats: includeStats ? 1 : undefined,
    },
  });
  return res.data;
}

export async function getStoreOverview(storeId) {
  const res = await axiosClient.get(`/stores/${storeId}/overview`);
  return res.data;
}

export async function createStore(payload) {
  const res = await axiosClient.post("/stores", payload);
  return res.data;
}

export async function updateStore(storeId, payload) {
  const res = await axiosClient.put(`/stores/${storeId}`, payload);
  return res.data;
}

export async function deactivateStore(storeId) {
  const res = await axiosClient.delete(`/stores/${storeId}`);
  return res.data;
}
