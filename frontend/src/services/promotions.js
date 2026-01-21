import axiosClient from "./axiosClient";

const parseNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const mapPromotionTypeFromApi = (type) => {
  const normalized = String(type || "").toUpperCase();
  if (normalized === "PERCENTAGE" || normalized === "PERCENT" || normalized === "PERCENTAGE_DISCOUNT") return "percent";
  if (normalized === "FIXED_AMOUNT" || normalized === "FIXED" || normalized === "AMOUNT") return "fixed";
  if (normalized === "COMBO") return "combo";
  return type ? String(type).toLowerCase() : "percent";
};

export const mapPromotionTypeToApi = (uiType) => {
  switch (uiType) {
    case "percent":
      return "PERCENTAGE";
    case "fixed":
      return "FIXED_AMOUNT";
    case "combo":
      return "COMBO";
    default:
      return String(uiType || "PERCENTAGE").toUpperCase();
  }
};

export const toDateInputValue = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  // yyyy-mm-dd for <input type="date">
  return date.toISOString().slice(0, 10);
};

export const apiPromotionToUi = (promo) => {
  return {
    id: promo.id,
    code: promo.code || "",
    name: promo.name || "",
    type: mapPromotionTypeFromApi(promo.type),
    value: parseNumber(promo.value),
    minOrder: parseNumber(promo.min_order_value),
    maxDiscount: promo.max_discount === null || promo.max_discount === undefined ? null : parseNumber(promo.max_discount),
    startDate: toDateInputValue(promo.start_date),
    endDate: toDateInputValue(promo.end_date),
    scope: promo.scope === "stores" ? "stores" : "all",
    stores: Array.isArray(promo.store_codes) ? promo.store_codes : [],
    status: promo.is_active ? "active" : "inactive",
    active: !!promo.is_active,
    usageCount: Number.isFinite(Number(promo.usage_count)) ? Number(promo.usage_count) : 0,
  };
};

export async function listPromotions() {
  const res = await axiosClient.get("/promotions");
  return res.data;
}

export async function createPromotion(payload) {
  const res = await axiosClient.post("/promotions", payload);
  return res.data;
}

export async function updatePromotion(id, payload) {
  const res = await axiosClient.put(`/promotions/${id}`, payload);
  return res.data;
}

export async function deletePromotion(id) {
  const res = await axiosClient.delete(`/promotions/${id}`);
  return res.data;
}

export async function validatePromotionCode({ code, orderTotal }) {
  const res = await axiosClient.post("/promotions/validate", { code, orderTotal });
  return res.data;
}
