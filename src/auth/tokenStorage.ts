import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'rutafy_access_token';
const REFRESH_KEY = 'rutafy_refresh_token';

function trimOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return trimOrNull(await SecureStore.getItemAsync(ACCESS_KEY));
  },

  async getRefreshToken(): Promise<string | null> {
    return trimOrNull(await SecureStore.getItemAsync(REFRESH_KEY));
  },

  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_KEY, token.trim());
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_KEY, token.trim());
  },

  async clearAll(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  },
};
