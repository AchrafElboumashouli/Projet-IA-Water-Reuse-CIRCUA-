import api from './api';

export async function fetchUsers({ search = '', page = 1, limit = 20 } = {}) {
  const { data } = await api.get('/users', { params: { search, page, limit } });
  return data;
}

export async function fetchUser(id) {
  const { data } = await api.get(`/users/${id}`);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await api.patch(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id) {
  const { data } = await api.delete(`/users/${id}`);
  return data;
}

export async function fetchPendingAdmins() {
  const { data } = await api.get('/users/admin-requests/pending');
  return data;
}

export async function approveAdminRequest(id) {
  const { data } = await api.post(`/users/admin-requests/${id}/approve`);
  return data;
}

export async function rejectAdminRequest(id, reason) {
  const { data } = await api.post(`/users/admin-requests/${id}/reject`, { reason });
  return data;
}
