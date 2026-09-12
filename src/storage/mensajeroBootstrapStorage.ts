import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { StoredMensajeroBootstrap } from '@/types/operationalBootstrap';
import {
  normalizeStoredBootstrap,
  serializeStoredBootstrap,
} from '@/utils/mensajeroBootstrapOwnership';

const KEY = 'rutafy_mensajero_bootstrap';
const isWeb = Platform.OS === 'web';

async function getRaw(): Promise<string | null> {
  if (isWeb) {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    return raw?.trim() ? raw : null;
  }
  const raw = await SecureStore.getItemAsync(KEY);
  return raw?.trim() ? raw : null;
}

async function setRaw(value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}

async function clearRaw(): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

export const mensajeroBootstrapStorage = {
  async get(userId: string | null | undefined): Promise<StoredMensajeroBootstrap | null> {
    const raw = await getRaw();
    if (!raw) return null;
    try {
      return normalizeStoredBootstrap(JSON.parse(raw), userId);
    } catch {
      return null;
    }
  },

  async set(
    userId: string | null | undefined,
    snapshot: StoredMensajeroBootstrap,
  ): Promise<void> {
    const owner = userId?.trim();
    if (!owner) return;
    await setRaw(JSON.stringify(serializeStoredBootstrap(owner, snapshot)));
  },

  async clear(): Promise<void> {
    await clearRaw();
  },
};
