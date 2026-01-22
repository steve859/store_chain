import axiosClient from "./axiosClient";

export async function listSalesOrders({ q = "", storeCode = "", take = 50, skip = 0 } = {}) {
  const res = await axiosClient.get("/invoices", {
    params: {
      q: q || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function getSalesOrder(id) {
  const res = await axiosClient.get(`/invoices/${id}`);
  return res.data;
}
