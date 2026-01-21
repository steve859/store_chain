import axiosClient from './axiosClient';

export async function listComplaints({ q = '', status, employeeName, take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get('/complaints', {
    params: {
      q: q || undefined,
      status: status || undefined,
      employeeName: employeeName || undefined,
      take,
      skip,
    },
  });
  return res.data;
}

export async function listMyComplaints({ employeeName, take = 200, skip = 0 } = {}) {
  const res = await axiosClient.get('/complaints/my', {
    params: { employeeName, take, skip },
  });
  return res.data;
}

export async function createComplaint({ storeName, employeeName, reason, description, image } = {}) {
  const res = await axiosClient.post('/complaints', {
    storeName,
    employeeName,
    reason,
    description,
    image: image ?? null,
  });
  return res.data;
}

export async function updateComplaintStatus(id, status, { adminNote } = {}) {
  const res = await axiosClient.patch(`/complaints/${encodeURIComponent(id)}/status`, {
    status,
    adminNote: adminNote ?? undefined,
  });
  return res.data;
}

export async function deleteComplaint(id) {
  const res = await axiosClient.delete(`/complaints/${encodeURIComponent(id)}`);
  return res.data;
}
