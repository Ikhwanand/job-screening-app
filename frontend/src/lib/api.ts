import axios, { AxiosHeaders } from "axios";

const baseURL = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api`;

export const apiClient = axios.create({
  baseURL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    if (!config.headers) {
      config.headers = new AxiosHeaders();
    }
    if (config.headers instanceof AxiosHeaders) {
      config.headers.set("Authorization", `Bearer ${token}`);
    } else {
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export const clearAuthHeaders = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
};

export default apiClient;
