import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  withCredentials: true,
});

// On a 401 caused by an expired access token, try refreshing once and
// replay the original request - avoids forcing a full re-login every 15
// minutes for an otherwise-valid session.
let refreshing: Promise<unknown> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !original._retried
    ) {
      original._retried = true;
      try {
        refreshing = refreshing ?? api.post('/auth/refresh');
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
