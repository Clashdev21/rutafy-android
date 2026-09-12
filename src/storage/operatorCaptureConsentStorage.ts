import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { isConsentAcceptedFor } from '@/utils/mensajeroBootstrapOwnership';

const KEY = 'rutafy_operator_capture_consent';
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

export const operatorCaptureConsentStorage = {
  async hasAccepted(userId: string | null | undefined): Promise<boolean> {
    const id = userId?.trim();
    if (!id) return false;
    const raw = await getRaw();
    if (!raw) return false;
    try {
      return isConsentAcceptedFor(JSON.parse(raw), id);
    } catch {
      return false;
    }
  },

  async accept(userId: string, acceptedAt = new Date().toISOString()): Promise<void> {
    const id = userId.trim();
    if (!id) return;
    await setRaw(JSON.stringify({ userId: id, acceptedAt }));
  },
};
