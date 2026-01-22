import axiosClient from "./axiosClient";

export async function getCurrentShift() {
  const res = await axiosClient.get("/pos/shifts/current");
  return res.data;
}

export async function openShift({ openingCash = 0, note = "" } = {}) {
  const res = await axiosClient.post("/pos/shifts/open", {
    openingCash,
    note: note || undefined,
  });
  return res.data;
}

export async function closeShift({ closingCash, note = "" } = {}) {
  const res = await axiosClient.post("/pos/shifts/close", {
    closingCash,
    note: note || undefined,
  });
  return res.data;
}

export async function createCashMovement({ type, amount, reason = "" } = {}) {
  const res = await axiosClient.post("/pos/cash-movements", {
    type,
    amount,
    reason: reason || undefined,
  });
  return res.data;
}

export async function listShiftCashMovements(shiftId) {
  const res = await axiosClient.get(`/pos/shifts/${shiftId}/cash-movements`);
  return res.data;
}
