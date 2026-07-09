import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { decodeJwtExpMs, resolveExpiresAtMs } from '@/auth/jwtUtils';

const ACCESS_KEY = 'rutafy_access_token';
const REFRESH_KEY = 'rutafy_refresh_token';
const EXPIRES_AT_KEY = 'rutafy_token_expires_at';

const isWeb = Platform.OS === 'web';

export type StoredTokensInput = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: string | number | null;
  expiresAt?: string | number | null;
  expires_in?: number | null;
};

function trimOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    if (typeof localStorage === 'undefined') return null;
    return trimOrNull(localStorage.getItem(key));
  }
  return trimOrNull(await SecureStore.getItemAsync(key));
}

async function setItem(key: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, trimmed);
    }
    return;
  }
  await SecureStore.setItemAsync(key, trimmed);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return getItem(ACCESS_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return getItem(REFRESH_KEY);
  },

  async getExpiresAtMs(): Promise<number | null> {
    const raw = await getItem(EXPIRES_AT_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },

  async setAccessToken(token: string): Promise<void> {
    await setItem(ACCESS_KEY, token);
    const exp = decodeJwtExpMs(token.trim());
    if (exp != null) {
      await setItem(EXPIRES_AT_KEY, String(exp));
    }
  },

  async setRefreshToken(token: string): Promise<void> {
    await setItem(REFRESH_KEY, token);
  },

  async setExpiresAtMs(expiresAtMs: number): Promise<void> {
    await setItem(EXPIRES_AT_KEY, String(expiresAtMs));
  },

  async setTokens(tokens: StoredTokensInput): Promise<void> {
    const access = tokens.access_token.trim();
    await setItem(ACCESS_KEY, access);

    if (tokens.refresh_token?.trim()) {
      await setItem(REFRESH_KEY, tokens.refresh_token.trim());
    }

    const expiresAtMs = resolveExpiresAtMs({
      expires_at: tokens.expires_at,
      expiresAt: tokens.expiresAt,
      expires_in: tokens.expires_in,
      access_token: access,
    });
    if (expiresAtMs != null) {
      await setItem(EXPIRES_AT_KEY, String(expiresAtMs));
    }
  },

  async clearAll(): Promise<void> {
    await Promise.all([
      deleteItem(ACCESS_KEY),
      deleteItem(REFRESH_KEY),
      deleteItem(EXPIRES_AT_KEY),
    ]);
  },
};
