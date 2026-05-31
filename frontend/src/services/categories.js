import axiosClient from "./axiosClient";

export async function listCategories() {
  const res = await axiosClient.get("/categories");
  return res.data;
}

export async function getCategory(id) {
  const res = await axiosClient.get(`/categories/${id}`);
  return res.data;
}

export async function createCategory(payload) {
  const res = await axiosClient.post("/categories", payload);
  return res.data;
}

export async function updateCategory(id, payload) {
  const res = await axiosClient.put(`/categories/${id}`, payload);
  return res.data;
}

export async function deleteCategory(id) {
  const res = await axiosClient.delete(`/categories/${id}`);
  return res.data;
}
