import axiosClient from "./axiosClient";

export async function listUsers() {
  const res = await axiosClient.get("/users");
  // BE currently returns an array
  const data = res.data;
  if (Array.isArray(data)) return { items: data };
  return { items: data?.items ?? [] };
}

export async function getUsersMeta() {
  const res = await axiosClient.get("/users/meta");
  return res.data;
}

export async function createUser(payload) {
  const res = await axiosClient.post("/users", payload);
  return res.data;
}

export async function updateUser(id, payload) {
  const res = await axiosClient.put(`/users/${id}`, payload);
  return res.data;
}

export async function deleteUser(id) {
  const res = await axiosClient.delete(`/users/${id}`);
  return res.data;
}
