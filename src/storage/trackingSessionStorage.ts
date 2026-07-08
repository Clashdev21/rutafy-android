import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import type { StoredTrackingSession } from '@/types/tracking';

const ACTIVE_SESSION_KEY = 'rutafy_tracking_session_active';

const isWeb = Platform.OS === 'web';

let lastStorageLoadedSessionId: string | null = null;

async function getRaw(): Promise<string | null> {
  if (isWeb) {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    return raw?.trim() ? raw : null;
  }
  const raw = await SecureStore.getItemAsync(ACTIVE_SESSION_KEY);
  return raw?.trim() ? raw : null;
}

async function setRaw(value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_SESSION_KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(ACTIVE_SESSION_KEY, value);
}

async function clearRaw(): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(ACTIVE_SESSION_KEY);
}

export const trackingSessionStorage = {
  async getActive(): Promise<StoredTrackingSession | null> {
    const raw = await getRaw();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredTrackingSession;
      if (!parsed?.sessionId?.trim()) return null;
      if (parsed.sessionId !== lastStorageLoadedSessionId) {
        lastStorageLoadedSessionId = parsed.sessionId;
        recordTrackingDiagnostic('tracking-storage-loaded', {
          sessionId: parsed.sessionId,
          startedAt: parsed.startedAt,
        });
      }
      return parsed;
    } catch {
      return null;
    }
  },

  async setActive(session: StoredTrackingSession): Promise<void> {
    await setRaw(JSON.stringify(session));
    recordTrackingDiagnostic('tracking-storage-restored', {
      sessionId: session.sessionId,
      startedAt: session.startedAt,
    });
  },

  async clearActive(): Promise<void> {
    const existing = await getRaw();
    let sessionId: string | undefined;
    if (existing) {
      try {
        sessionId = (JSON.parse(existing) as StoredTrackingSession).sessionId;
      } catch {
        sessionId = undefined;
      }
    }
    await clearRaw();
    lastStorageLoadedSessionId = null;
    recordTrackingDiagnostic('tracking-storage-cleared', {}, sessionId);
  },
};
