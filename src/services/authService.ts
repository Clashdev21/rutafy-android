import axios from 'axios';

import { apiClient } from '@/api/client';
import { AUTH_ENDPOINTS } from '@/api/endpoints';
import { tokenStorage } from '@/auth/tokenStorage';
import { API_BASE_URL } from '@/config/env';
import type { AuthUser, LoginCredentials, TokenPairResponse } from '@/types/auth';
import { normalizeAuthUser } from '@/utils/normalizeAuthUser';

function pickAccessToken(data: TokenPairResponse): string | null {
  const token = data.access_token ?? data.accessToken;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function pickRefreshToken(data: TokenPairResponse): string | null {
  const token = data.refresh_token ?? data.refreshToken;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

async function loginErrorMessage(response: Response): Promise<string> {
  const fallback = `Error ${response.status}`;
  try {
    const data = (await response.json()) as {
      message?: string;
      error?: string;
      detail?: string;
    };
    return data?.message ?? data?.error ?? data?.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const loginUrl = `${API_BASE_URL}${AUTH_ENDPOINTS.login}`;
  console.log('[mobile-login-url]', loginUrl);

  try {
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        phone: credentials.phone.trim(),
        password: credentials.password,
      }),
    });

    if (!response.ok) {
      throw new Error(await loginErrorMessage(response));
    }

    const data = (await response.json()) as TokenPairResponse;

    const access = pickAccessToken(data);
    if (!access) {
      throw new Error('Respuesta de login sin access_token');
    }

    await tokenStorage.setAccessToken(access);
    const refresh = pickRefreshToken(data);
    if (refresh) {
      await tokenStorage.setRefreshToken(refresh);
    }

    return fetchCurrentUser();
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log('[mobile-login-error]', {
        code: error.code,
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url,
        baseURL: error.config?.baseURL,
      });
    } else {
      console.log('[mobile-login-error]', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const { data } = await apiClient.get(AUTH_ENDPOINTS.me);
  const user = normalizeAuthUser(data);
  if (!user) {
    throw new Error('Respuesta /v1/auth/me inválida');
  }
  return user;
}

export async function logout(): Promise<void> {
  const refresh = await tokenStorage.getRefreshToken();
  try {
    if (refresh) {
      await apiClient.post(
        AUTH_ENDPOINTS.logout,
        { refresh_token: refresh },
        { skipAuthRefresh: true },
      );
    }
  } finally {
    await tokenStorage.clearAll();
  }
}
