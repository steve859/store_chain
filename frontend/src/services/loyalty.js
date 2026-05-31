import axiosClient from "./axiosClient";

export async function getCustomerLoyalty(customerId) {
  const res = await axiosClient.get(`/loyalty/customers/${customerId}`);
  return res.data;
}

export async function getLoyaltyTiers() {
  const res = await axiosClient.get(`/loyalty/tiers`);
  return res.data;
}

export async function addLoyaltyPoints(payload) {
  const res = await axiosClient.post(`/loyalty/points/add`, payload);
  return res.data;
}

export async function deductLoyaltyPoints(payload) {
  const res = await axiosClient.post(`/loyalty/points/deduct`, payload);
  return res.data;
}
