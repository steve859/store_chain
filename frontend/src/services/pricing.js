import axiosClient from "./axiosClient";

export async function getPriceRecommendations({ productId, category, marginThreshold } = {}) {
  const res = await axiosClient.get("/pricing/recommendations", {
    params: { productId, category, marginThreshold },
  });
  return res.data;
}

export async function triggerBatchRecalculation() {
  const res = await axiosClient.post("/pricing/batch-recalculate");
  return res.data;
}

export async function trackCompetitorPrice(payload) {
  const res = await axiosClient.post("/pricing/competitors", payload);
  return res.data;
}
