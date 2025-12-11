// frontend/src/lib/api.ts
import axios, { type InternalAxiosRequestConfig } from "axios";

// UWAGA: Usunąłem "import.meta.env...", żeby Docker nie mógł wstawić tu starego adresu HTTP.
// Teraz jest wpisane na sztywno HTTPS.
export const API_URL = "https://warehouse-app-backend.braveplant-bad8f0cb.polandcentral.azurecontainerapps.io";

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers = config.headers ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});