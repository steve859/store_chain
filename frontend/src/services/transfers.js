import axiosClient from "./axiosClient";

export async function listTransfers({ q = "", fromStoreId, toStoreId, status, take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get("/transfers", {
    params: {
      q: q || undefined,
      fromStoreId: fromStoreId ?? undefined,
      toStoreId: toStoreId ?? undefined,
      status: status || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function getTransfer(id) {
  const res = await axiosClient.get(`/transfers/${id}`);
  return res.data;
}

export async function createTransfer(payload) {
  const res = await axiosClient.post("/transfers", payload);
  return res.data;
}

export async function dispatchTransfer(id, payload) {
  const res = await axiosClient.post(`/transfers/${id}/dispatch`, payload);
  return res.data;
}

export async function receiveTransfer(id, payload) {
  const res = await axiosClient.post(`/transfers/${id}/receive`, payload);
  return res.data;
}

export async function cancelTransfer(id) {
  const res = await axiosClient.post(`/transfers/${id}/cancel`);
  return res.data;
}

// Uses BE products catalog to get variant + inventory snapshot for a store
export async function listStoreCatalog({ storeId, q = "", barcode = "", take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get("/products/catalog", {
    params: {
      storeId,
      q: q || undefined,
      barcode: barcode || undefined,
      take,
      skip,
    },
  });
  return res.data;
}
