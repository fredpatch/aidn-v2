import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

export const api: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 seconds
});

// On a 401 caused by an expired access token, try refreshing once and
// replay the original request - avoids forcing a full re-login every 30
// minutes for an otherwise-valid session.
let isRefreshing = false;

let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: AxiosError | null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(null);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    const isAuthRequest = originalRequest.url?.includes('/applicant-auth/');

    if (error.response?.status !== 401 || originalRequest._retry || isAuthRequest) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(() => api(originalRequest))
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      await api.post('/applicant-auth/refresh');
      processQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as AxiosError);
      if (window.location.pathname !== '/login') {
        sessionStorage.setItem('session_expired', '1');
        window.location.href = '/login';
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export function apiErrorMessage(error: unknown, fallback = 'Une erreur est survenue.'): string {
  if (axios.isAxiosError(error) && error.response?.data?.message) {
    return error.response.data.message as string;
  }
  return fallback;
}
