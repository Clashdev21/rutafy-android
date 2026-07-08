import axios, { type InternalAxiosRequestConfig } from 'axios';

import { AUTH_ENDPOINTS } from '@/api/endpoints';
import { sessionEvents } from '@/auth/sessionEvents';
import { tokenStorage } from '@/auth/tokenStorage';
import { API_BASE_URL } from '@/config/env';
import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import type { RefreshTokenResponse } from '@/types/auth';
import {
  isConfirmedAuthInvalidError,
  isTransientNetworkError,
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

type RefreshAccessTokenResult =
  | { status: 'success'; token: string }
  | { status: 'network_error' }
  | { status: 'auth_invalid' };

let refreshInFlight: Promise<RefreshAccessTokenResult> | null = null;

function logLogoutReason(reason: string, detail?: unknown): void {
  if (__DEV__) {
    console.log('[auth-logout-reason]', { reason, detail });
  }
}

function clearAuthAndNotify(reason: string, detail?: unknown): void {
  logLogoutReason(reason, detail);
  void tokenStorage.clearAll();
  sessionEvents.emitSessionExpired();
}

async function refreshAccessTokenShared(): Promise<RefreshAccessTokenResult> {
  if (!refreshInFlight) {
    refreshInFlight = (async (): Promise<RefreshAccessTokenResult> => {
      try {
        const rt = await tokenStorage.getRefreshToken();
        if (!rt) {
          if (__DEV__) {
            console.log('[auth-refresh-failed]', { reason: 'missing_refresh_token' });
          }
          recordTrackingDiagnostic('refresh-failed', { reason: 'missing_refresh_token' });
          return { status: 'auth_invalid' };
        }

        recordTrackingDiagnostic('refresh-start', {});

        if (__DEV__) {
          console.log('[auth-refresh-start]');
        }

        const { data } = await refreshClient.post<RefreshTokenResponse>(
          AUTH_ENDPOINTS.refresh,
          { refresh_token: rt },
        );
        const at = data?.access_token ?? data?.accessToken;
        if (typeof at === 'string' && at.trim()) {
          const trimmed = at.trim();
          await tokenStorage.setAccessToken(trimmed);
          recordTrackingDiagnostic('refresh-success', {});
          if (__DEV__) {
            console.log('[auth-refresh-success]');
          }
          return { status: 'success', token: trimmed };
        }

        if (__DEV__) {
          console.log('[auth-refresh-failed]', { reason: 'invalid_refresh_response' });
        }
        recordTrackingDiagnostic('refresh-failed', { reason: 'invalid_refresh_response' });
        return { status: 'auth_invalid' };
      } catch (error) {
        if (isTransientNetworkError(error)) {
          if (__DEV__) {
            console.log('[auth-network-error]', { context: 'refresh_token' });
          }
          return { status: 'network_error' };
        }

        if (isConfirmedAuthInvalidError(error)) {
          if (__DEV__) {
            console.log('[auth-refresh-failed]', {
              reason: 'refresh_token_rejected',
              status: axios.isAxiosError(error) ? error.response?.status : null,
            });
          }
          recordTrackingDiagnostic('refresh-failed', {
            reason: 'refresh_token_rejected',
            status: axios.isAxiosError(error) ? error.response?.status : null,
          });
          return { status: 'auth_invalid' };
        }

        if (__DEV__) {
          console.log('[auth-network-error]', {
            context: 'refresh_token_unexpected',
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return { status: 'network_error' };
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
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
    const url = config.url ?? '';
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
    if (isTransientNetworkError(error)) {
      if (__DEV__) {
        console.log('[auth-network-error]', {
          context: 'api_request',
          url: axios.isAxiosError(error) ? error.config?.url : null,
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

    const refreshResult = await refreshAccessTokenShared();
    if (refreshResult.status === 'network_error') {
      if (__DEV__) {
        console.log('[auth-network-error]', { context: '401_refresh_skipped' });
      }
      const networkError = new axios.AxiosError(
        NETWORK_UNAVAILABLE_MESSAGE,
        'ERR_NETWORK',
        prevRequest,
        undefined,
        undefined,
      );
      return Promise.reject(networkError);
    }

    if (refreshResult.status === 'auth_invalid') {
      clearAuthAndNotify('refresh_token_invalid');
      return Promise.reject(error);
    }

    try {
      prevRequest.headers = prevRequest.headers ?? {};
      prevRequest.headers.Authorization = `Bearer ${refreshResult.token}`;
      prevRequest._retry = true;
      return apiClient(prevRequest);
    } catch (retryError) {
      if (isTransientNetworkError(retryError)) {
        if (__DEV__) {
          console.log('[auth-network-error]', { context: '401_retry_request' });
        }
        return Promise.reject(retryError);
      }
      if (isConfirmedAuthInvalidError(retryError)) {
        clearAuthAndNotify('retry_request_401');
      }
      return Promise.reject(retryError);
    }
  },
);
