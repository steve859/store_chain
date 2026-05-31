import axiosClient from "./axiosClient";

export async function processReturn(payload) {
  const res = await axiosClient.post("/returns", payload);
  return res.data;
}

export async function listReturns({ storeId, skip = 0, take = 50 } = {}) {
  const res = await axiosClient.get("/returns", {
    params: { storeId, skip, take },
  });
  return res.data;
}
