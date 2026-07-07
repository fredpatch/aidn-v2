import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  withCredentials: true,
});

let refreshing: Promise<unknown> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && error.response?.data?.code === "TOKEN_EXPIRED" && !original._retried) {
      original._retried = true;
      try {
        refreshing = refreshing ?? api.post("/applicant-auth/refresh");
        await refreshing;
        refreshing = null;
        return api(original);
      } catch {
        refreshing = null;
      }
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown, fallback = "Une erreur est survenue."): string {
  if (axios.isAxiosError(error) && error.response?.data?.message) {
    return error.response.data.message as string;
  }
  return fallback;
}
