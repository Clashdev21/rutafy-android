import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_KEY = 'rutafy_access_token';
const REFRESH_KEY = 'rutafy_refresh_token';

const isWeb = Platform.OS === 'web';

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

  async setAccessToken(token: string): Promise<void> {
    await setItem(ACCESS_KEY, token);
  },

  async setRefreshToken(token: string): Promise<void> {
    await setItem(REFRESH_KEY, token);
  },

  async clearAll(): Promise<void> {
    await Promise.all([deleteItem(ACCESS_KEY), deleteItem(REFRESH_KEY)]);
  },
};
