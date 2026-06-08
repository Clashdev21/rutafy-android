import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { StoredOperatorTrackingHealth } from '@/types/operatorTrackingHealth';

const HEALTH_KEY = 'rutafy_operator_tracking_health';

const isWeb = Platform.OS === 'web';

function nowIso(): string {
  return new Date().toISOString();
}

async function getRaw(): Promise<string | null> {
  if (isWeb) {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(HEALTH_KEY);
    return raw?.trim() ? raw : null;
  }
  const raw = await SecureStore.getItemAsync(HEALTH_KEY);
  return raw?.trim() ? raw : null;
}

async function setRaw(value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HEALTH_KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(HEALTH_KEY, value);
}

async function readStored(): Promise<StoredOperatorTrackingHealth> {
  const raw = await getRaw();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StoredOperatorTrackingHealth;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function mergeStored(patch: Partial<StoredOperatorTrackingHealth>): Promise<void> {
  const current = await readStored();
  await setRaw(JSON.stringify({ ...current, ...patch }));
}

export const operatorTrackingHealthStorage = {
  async get(): Promise<StoredOperatorTrackingHealth> {
    return readStored();
  },

  async clear(): Promise<void> {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(HEALTH_KEY);
      }
      return;
    }
    await SecureStore.deleteItemAsync(HEALTH_KEY);
  },

  async recordEvent(): Promise<void> {
    await mergeStored({ lastOperatorBgEventAt: nowIso() });
  },

  async recordBatchOk(): Promise<void> {
    await mergeStored({ lastOperatorBgBatchOkAt: nowIso() });
  },

  async recordBatchError(errorCode: string): Promise<void> {
    await mergeStored({
      lastOperatorBgBatchErrorAt: nowIso(),
      lastOperatorBgError: errorCode,
    });
  },

  async recordDrop(reason: string): Promise<void> {
    await mergeStored({ lastOperatorBgDropReason: reason });
  },
};
