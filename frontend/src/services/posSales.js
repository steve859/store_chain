import axiosClient from "./axiosClient";

export async function listPosCatalog({ q = "", barcode = "", storeId = "", take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get("/sales/catalog", {
    params: {
      q: q || undefined,
      barcode: barcode || undefined,
      storeId: storeId || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function checkoutSale({
  storeId = "",
  cashierId = "",
  paymentMethod,
  paidAmount = null,
  totalAmount = null,
  items = [],
} = {}) {
  const res = await axiosClient.post("/sales/checkout", {
    storeId: storeId || undefined,
    cashierId: cashierId || undefined,
    paymentMethod,
    paidAmount,
    totalAmount,
    items,
  });
  return res.data;
}
