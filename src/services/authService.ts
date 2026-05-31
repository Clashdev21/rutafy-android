import { apiClient } from '@/api/client';
import { AUTH_ENDPOINTS } from '@/api/endpoints';
import { tokenStorage } from '@/auth/tokenStorage';
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

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const { data } = await apiClient.post<TokenPairResponse>(AUTH_ENDPOINTS.login, {
    phone: credentials.phone.trim(),
    password: credentials.password,
  });

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
