import axiosClient from "./axiosClient";

export async function getSystemSettings() {
  const res = await axiosClient.get("/settings");
  return res.data;
}

export async function updateSystemSettings(payload) {
  const res = await axiosClient.put("/settings", payload);
  return res.data;
}

export async function getSystemStatus() {
  const res = await axiosClient.get("/maintenance/status");
  return res.data;
}

export async function runBackup() {
  const res = await axiosClient.post("/maintenance/backup");
  return res.data;
}

export async function runCleanup() {
  const res = await axiosClient.post("/maintenance/cleanup");
  return res.data;
}

export async function runDrill() {
  const res = await axiosClient.post("/maintenance/disaster-recovery/drill");
  return res.data;
}
