import axiosClient from "./axiosClient";

export async function listInventoryAdjustments({ q, take = 50, skip = 0 } = {}) {
  const params = {
    take,
    skip,
  };
  if (q) params.q = q;

  const res = await axiosClient.get("/inventory/adjustments", { params });
  return res.data;
}

export async function getInventoryByVariant(variantId) {
  const res = await axiosClient.get(`/inventory/variants/${variantId}`);
  return res.data;
}

export async function createInventoryAdjustment({
  variantId,
  adjustmentType,
  quantity,
  reason,
  customReason,
  note,
} = {}) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("quantity must be a positive number");
  }

  const delta = adjustmentType === "increase" ? qty : -qty;
  const finalReason = reason === "Khác" ? String(customReason ?? "").trim() : String(reason ?? "").trim();

  const payload = {
    variantId: Number(variantId),
    delta,
    reason: finalReason || "Inventory adjustment",
    note: note ? String(note) : undefined,
  };

  const res = await axiosClient.post("/inventory/adjust", payload);
  return res.data;
}

export async function listProducts({ q, take = 200, skip = 0 } = {}) {
  const params = { take, skip };
  if (q) params.q = q;
  const res = await axiosClient.get("/products", { params });
  return res.data;
}
