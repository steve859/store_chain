import axiosClient from "./axiosClient";

export async function listProducts({ q = "", take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get("/products", {
    params: {
      q: q || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function getProduct(id) {
  const res = await axiosClient.get(`/products/${id}`);
  return res.data;
}

export async function createProduct(payload) {
  const res = await axiosClient.post("/products", payload);
  return res.data;
}

export async function updateProduct(id, payload) {
  const res = await axiosClient.put(`/products/${id}`, payload);
  return res.data;
}

export async function createVariant(productId, payload) {
  const res = await axiosClient.post(`/products/${productId}/variants`, payload);
  return res.data;
}

export async function updateVariant(variantId, payload) {
  const res = await axiosClient.put(`/products/variants/${variantId}`, payload);
  return res.data;
}

// Store catalog: variant + product + store inventory snapshot
export async function listProductsCatalog({ storeId, q = "", barcode = "", take = 200, skip = 0 } = {}) {
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
