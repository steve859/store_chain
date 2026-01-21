import axios from 'axios';

const normalizeApiBaseURL = (raw) => {
  const fallback = '/api/v1';
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return fallback;

  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) return trimmed;
  return `${trimmed}/api/v1`;
};

const axiosClient = axios.create({
  baseURL: normalizeApiBaseURL(import.meta.env.VITE_API_URL), // Lấy từ file .env
  headers: {
    'Content-Type': 'application/json',
  },
});

// Có thể thêm interceptors để tự động gắn Token vào header ở đây
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axiosClient;