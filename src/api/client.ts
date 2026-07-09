import axios, { type InternalAxiosRequestConfig } from 'axios';

import { AUTH_ENDPOINTS } from '@/api/endpoints';
import { getValidAccessToken, refreshAccessTokenWithOutcome } from '@/auth/accessTokenManager';
import { sessionEvents } from '@/auth/sessionEvents';
import { tokenStorage } from '@/auth/tokenStorage';
import { API_BASE_URL } from '@/config/env';
import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import {
  isConfirmedAuthInvalidError,
  isTransientNetworkError,
  isTransientServerError,
  NETWORK_UNAVAILABLE_MESSAGE,
} from '@/utils/networkErrors';

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

function isPublicAuthRoute(config: InternalAxiosRequestConfig): boolean {
  const path = `${config.baseURL ?? ''}${config.url ?? ''}`;
  const url = config.url ?? '';
  return (
    url.includes(AUTH_ENDPOINTS.login) ||
    url.includes(AUTH_ENDPOINTS.registerTransportista) ||
    url.includes(AUTH_ENDPOINTS.refresh) ||
    url.includes(AUTH_ENDPOINTS.logout) ||
    path.includes(AUTH_ENDPOINTS.login) ||
    path.includes(AUTH_ENDPOINTS.registerTransportista) ||
    path.includes(AUTH_ENDPOINTS.refresh) ||
    path.includes(AUTH_ENDPOINTS.logout)
  );
}

function isAuthRefreshExempt(config: InternalAxiosRequestConfig): boolean {
  if (config.skipAuthRefresh) return true;
  return isPublicAuthRoute(config);
}

function authLog(tag: string, detail?: Record<string, unknown>): void {
  if (__DEV__) {
    if (detail && Object.keys(detail).length > 0) {
      console.log(tag, detail);
    } else {
      console.log(tag);
    }
  }
}

function clearAuthAndNotify(reason: string, detail?: unknown): void {
  authLog('[auth-session-expired-confirmed]', { reason, detail });
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
    const url = config.url ?? '';
    const token = await getValidAccessToken({
      source: url.includes('tracking-sessions') ? 'axios_tracking' : 'axios',
    });
    if (url.includes('tracking-sessions')) {
      recordTrackingDiagnostic('access-token-read', {
        hasAccessToken: Boolean(token),
        tokenLength: token?.length ?? 0,
        channel: 'axios',
        url,
      });
    }
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isTransientNetworkError(error) || isTransientServerError(error)) {
      if (__DEV__) {
        authLog('[auth-session-preserved-network-error]', {
          context: 'api_request',
          url: axios.isAxiosError(error) ? error.config?.url : null,
          status: axios.isAxiosError(error) ? error.response?.status : null,
        });
      }
      return Promise.reject(error);
    }

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
      clearAuthAndNotify('access_token_retry_401');
      return Promise.reject(error);
    }

    const rt = await tokenStorage.getRefreshToken();
    if (!rt) {
      clearAuthAndNotify('missing_refresh_token_on_401');
      return Promise.reject(error);
    }

    const refreshOutcome = await refreshAccessTokenWithOutcome({ source: 'axios_401' });
    if (refreshOutcome.status === 'network_error') {
      authLog('[auth-session-preserved-network-error]', { context: '401_refresh_skipped' });
      const networkError = new axios.AxiosError(
        NETWORK_UNAVAILABLE_MESSAGE,
        'ERR_NETWORK',
        prevRequest,
        undefined,
        undefined,
      );
      return Promise.reject(networkError);
    }

    if (refreshOutcome.status === 'auth_invalid') {
      clearAuthAndNotify('refresh_token_invalid');
      return Promise.reject(error);
    }

    try {
      prevRequest.headers = prevRequest.headers ?? {};
      prevRequest.headers.Authorization = `Bearer ${refreshOutcome.token}`;
      prevRequest._retry = true;
      return apiClient(prevRequest);
    } catch (retryError) {
      if (isTransientNetworkError(retryError) || isTransientServerError(retryError)) {
        authLog('[auth-session-preserved-network-error]', { context: '401_retry_request' });
        return Promise.reject(retryError);
      }
      if (isConfirmedAuthInvalidError(retryError)) {
        clearAuthAndNotify('retry_request_401');
      }
      return Promise.reject(retryError);
    }
  },
);
