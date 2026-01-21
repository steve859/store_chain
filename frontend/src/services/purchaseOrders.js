import axiosClient from "./axiosClient";

export async function listPurchaseOrders({ q = "", storeId, supplierId, status, take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get("/orders", {
    params: {
      q: q || undefined,
      storeId: storeId ?? undefined,
      supplierId: supplierId ?? undefined,
      status: status || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function getPurchaseOrder(id) {
  const res = await axiosClient.get(`/orders/${id}`);
  return res.data;
}

export async function createPurchaseOrder(payload) {
  const res = await axiosClient.post("/orders", payload);
  return res.data;
}

export async function updatePurchaseOrderStatus(id, status) {
  const res = await axiosClient.post(`/orders/${id}/status`, { status });
  return res.data;
}

export async function receivePurchaseOrder(id, payload) {
  const res = await axiosClient.post(`/orders/${id}/receive`, payload);
  return res.data;
}

export async function deletePurchaseOrder(id) {
  const res = await axiosClient.delete(`/orders/${id}`);
  return res.data;
}

export async function listProductVariants({ q = "", take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get("/products", {
    params: { q: q || undefined, take, skip },
  });

  const items = Array.isArray(res.data?.items) ? res.data.items : [];
  const variants = [];

  for (const product of items) {
    const productVariants = Array.isArray(product?.product_variants) ? product.product_variants : [];
    for (const variant of productVariants) {
      variants.push({
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        variantCode: variant.variant_code,
        variantName: variant.name,
        barcode: variant.barcode,
        defaultCost: variant.cost_price ?? 0,
      });
    }
  }

  return { items: variants, total: variants.length, take: res.data?.take, skip: res.data?.skip };
}
