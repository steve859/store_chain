import axiosClient from "./axiosClient";

export async function listSalesOrders({ q = "", storeCode = "", take = 50, skip = 0 } = {}) {
  const res = await axiosClient.get("/sales", {
    params: {
      q: q || undefined,
      storeCode: storeCode || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function getSalesOrder(id) {
  const res = await axiosClient.get(`/sales/${id}`);
  return res.data;
}
