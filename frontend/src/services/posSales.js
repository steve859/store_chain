import axiosClient from "./axiosClient";

export async function listPosCatalog({ q = "", barcode = "", take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get("/products/catalog", {
    params: {
      q: q || undefined,
      barcode: barcode || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function checkoutSale({
  paymentMethod,
  paidAmount = null,
  totalAmount = null,
  items = [],
} = {}) {
  const res = await axiosClient.post("/pos/checkout", {
    paymentMethod,
    paidAmount,
    totalAmount,
    items,
  });
  return res.data;
}
