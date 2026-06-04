import axios, { type InternalAxiosRequestConfig } from 'axios';

import { AUTH_ENDPOINTS } from '@/api/endpoints';
import { sessionEvents } from '@/auth/sessionEvents';
import { tokenStorage } from '@/auth/tokenStorage';
import { API_BASE_URL } from '@/config/env';
import type { RefreshTokenResponse } from '@/types/auth';

declare module 'axios' {
  export interface AxiosRequestConfig {
    _retry?: boolean;
    skipAuthRefresh?: boolean;
  }
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
    skipAuthRefresh?: boolean;
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Sin interceptors: evita bucles al llamar /v1/auth/refresh. */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

function isPublicAuthRoute(config: InternalAxiosRequestConfig): boolean {
  const path = `${config.baseURL ?? ''}${config.url ?? ''}`;
  const url = config.url ?? '';
  return (
    url.includes(AUTH_ENDPOINTS.login) ||
    url.includes(AUTH_ENDPOINTS.refresh) ||
    url.includes(AUTH_ENDPOINTS.logout) ||
    path.includes(AUTH_ENDPOINTS.login) ||
    path.includes(AUTH_ENDPOINTS.refresh) ||
    path.includes(AUTH_ENDPOINTS.logout)
  );
}

function isAuthRefreshExempt(config: InternalAxiosRequestConfig): boolean {
  if (config.skipAuthRefresh) return true;
  return isPublicAuthRoute(config);
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessTokenShared(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<string | null> => {
      try {
        const rt = await tokenStorage.getRefreshToken();
        if (!rt) return null;
        const { data } = await refreshClient.post<RefreshTokenResponse>(
          AUTH_ENDPOINTS.refresh,
          { refresh_token: rt },
        );
        const at = data?.access_token ?? data?.accessToken;
        if (typeof at === 'string' && at.trim()) {
          const trimmed = at.trim();
          await tokenStorage.setAccessToken(trimmed);
          return trimmed;
        }
        return null;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function clearAuthAndNotify(): void {
  void tokenStorage.clearAll();
  sessionEvents.emitSessionExpired();
}

apiClient.interceptors.request.use(async (config) => {
  if (__DEV__) {
    console.log('[api-request]', {
      method: config.method,
      baseURL: config.baseURL,
      url: config.url,
    });
  }

  if (!isPublicAuthRoute(config)) {
    const token = await tokenStorage.getAccessToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const prevRequest = error.config as InternalAxiosRequestConfig | undefined;
    if (!prevRequest) {
      return Promise.reject(error);
    }

    if (isAuthRefreshExempt(prevRequest)) {
      return Promise.reject(error);
    }

    if (prevRequest._retry) {
      clearAuthAndNotify();
      return Promise.reject(error);
    }

    const rt = await tokenStorage.getRefreshToken();
    if (!rt) {
      clearAuthAndNotify();
      return Promise.reject(error);
    }

    try {
      const newAccess = await refreshAccessTokenShared();
      if (!newAccess) {
        clearAuthAndNotify();
        return Promise.reject(error);
      }
      prevRequest.headers = prevRequest.headers ?? {};
      prevRequest.headers.Authorization = `Bearer ${newAccess}`;
      prevRequest._retry = true;
      return apiClient(prevRequest);
    } catch {
      clearAuthAndNotify();
      return Promise.reject(error);
    }
  },
);
