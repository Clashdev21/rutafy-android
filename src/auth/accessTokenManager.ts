import axios from 'axios';

import { AUTH_ENDPOINTS } from '@/api/endpoints';
import { decodeJwtExpMs, isTokenExpiredOrNear } from '@/auth/jwtUtils';
import { tokenStorage } from '@/auth/tokenStorage';
import { API_BASE_URL } from '@/config/env';
import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import type { RefreshTokenResponse } from '@/types/auth';
import { isConfirmedAuthInvalidError, isTransientNetworkError } from '@/utils/networkErrors';

/** Sin interceptors: evita bucles al llamar /v1/auth/refresh. */
const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

type RefreshInternalResult =
  | { status: 'success'; token: string }
  | { status: 'network_error'; previousToken: string | null }
  | { status: 'auth_invalid' };

let refreshInFlight: Promise<RefreshInternalResult> | null = null;

function authLog(tag: string, detail?: Record<string, unknown>): void {
  if (__DEV__) {
    if (detail && Object.keys(detail).length > 0) {
      console.log(tag, detail);
    } else {
      console.log(tag);
    }
  }
}

function pickAccessToken(data: RefreshTokenResponse): string | null {
  const token = data.access_token ?? data.accessToken;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function pickRefreshToken(data: RefreshTokenResponse): string | null {
  const token = data.refresh_token ?? data.refreshToken;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

export function isAccessTokenExpiredOrNearExpiry(token?: string | null): boolean {
  if (!token?.trim()) return true;
  const jwtExp = decodeJwtExpMs(token);
  if (jwtExp != null) {
    return isTokenExpiredOrNear(jwtExp);
  }
  return false;
}

async function isStoredAccessExpired(accessToken: string | null): Promise<boolean> {
  if (!accessToken) return true;
  const storedExp = await tokenStorage.getExpiresAtMs();
  if (storedExp != null) {
    return isTokenExpiredOrNear(storedExp);
  }
  return isAccessTokenExpiredOrNearExpiry(accessToken);
}

function recordAccessTokenRead(source: string | undefined, token: string | null): void {
  recordTrackingDiagnostic('access-token-read', {
    hasAccessToken: Boolean(token),
    tokenLength: token?.length ?? 0,
    channel: source ?? 'access_token_manager',
  });
}

async function refreshAccessTokenInternal(
  source?: string,
): Promise<RefreshInternalResult> {
  const previousToken = await tokenStorage.getAccessToken();

  const rt = await tokenStorage.getRefreshToken();
  if (!rt) {
    recordTrackingDiagnostic('refresh-failed', {
      reason: 'missing_refresh_token',
      source: source ?? null,
    });
    authLog('[auth-refresh-error]', { reason: 'missing_refresh_token', source });
    return { status: 'auth_invalid' };
  }

  recordTrackingDiagnostic('refresh-start', { source: source ?? null });
  authLog('[auth-refresh-start]', { source: source ?? null });

  try {
    const { data } = await refreshClient.post<RefreshTokenResponse>(AUTH_ENDPOINTS.refresh, {
      refresh_token: rt,
    });

    const access = pickAccessToken(data);
    if (!access) {
      recordTrackingDiagnostic('refresh-failed', {
        reason: 'invalid_refresh_response',
        source: source ?? null,
      });
      authLog('[auth-refresh-error]', { reason: 'invalid_refresh_response', source });
      return { status: 'auth_invalid' };
    }

    const rotatedRefresh = pickRefreshToken(data);
    await tokenStorage.setTokens({
      access_token: access,
      refresh_token: rotatedRefresh ?? undefined,
      expires_at: data.expires_at ?? data.expiresAt,
      expires_in: data.expires_in,
    });

    recordTrackingDiagnostic('refresh-success', { source: source ?? null });
    authLog('[auth-refresh-ok]', { source: source ?? null });
    return { status: 'success', token: access };
  } catch (error) {
    if (isTransientNetworkError(error)) {
      recordTrackingDiagnostic('refresh-failed', {
        reason: 'network_error',
        source: source ?? null,
      });
      authLog('[auth-session-preserved-network-error]', {
        context: 'refresh_token',
        source,
      });
      return { status: 'network_error', previousToken };
    }

    const status = axios.isAxiosError(error) ? error.response?.status : null;
    if (status != null && status >= 500 && status <= 599) {
      recordTrackingDiagnostic('refresh-failed', {
        reason: 'server_error',
        status,
        source: source ?? null,
      });
      authLog('[auth-session-preserved-network-error]', {
        context: 'refresh_server_error',
        status,
        source,
      });
      return { status: 'network_error', previousToken };
    }

    if (isConfirmedAuthInvalidError(error)) {
      recordTrackingDiagnostic('refresh-failed', {
        reason: 'refresh_token_rejected',
        status,
        source: source ?? null,
      });
      authLog('[auth-refresh-error]', {
        reason: 'refresh_token_rejected',
        status,
        source,
      });
      return { status: 'auth_invalid' };
    }

    recordTrackingDiagnostic('refresh-failed', {
      reason: 'unexpected_error',
      source: source ?? null,
    });
    authLog('[auth-session-preserved-network-error]', {
      context: 'refresh_unexpected',
      source,
    });
    return { status: 'network_error', previousToken };
  }
}

export type AccessTokenRefreshOutcome =
  | { status: 'success'; token: string }
  | { status: 'network_error' }
  | { status: 'auth_invalid' };

async function refreshSingleFlight(source?: string): Promise<RefreshInternalResult> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessTokenInternal(source).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function refreshAccessTokenWithOutcome(options?: {
  source?: string;
}): Promise<AccessTokenRefreshOutcome> {
  const result = await refreshSingleFlight(options?.source);
  if (result.status === 'success') {
    return { status: 'success', token: result.token };
  }
  if (result.status === 'network_error') {
    return { status: 'network_error' };
  }
  return { status: 'auth_invalid' };
}

export async function refreshAccessToken(options?: {
  source?: string;
}): Promise<string | null> {
  const result = await refreshSingleFlight(options?.source);
  if (result.status === 'success') return result.token;
  if (result.status === 'network_error') return result.previousToken;
  return null;
}

export async function getValidAccessToken(options?: {
  forceRefresh?: boolean;
  source?: string;
}): Promise<string | null> {
  const source = options?.source;
  const access = await tokenStorage.getAccessToken();
  recordAccessTokenRead(source, access);

  const refresh = await tokenStorage.getRefreshToken();
  if (!access && !refresh) {
    return null;
  }

  const needsRefresh =
    options?.forceRefresh === true || (access != null && (await isStoredAccessExpired(access)));

  if (!needsRefresh && access) {
    return access;
  }

  if (!refresh) {
    return access;
  }

  const result = await refreshSingleFlight(source);
  if (result.status === 'success') return result.token;
  if (result.status === 'network_error') return result.previousToken ?? access;
  return null;
}
