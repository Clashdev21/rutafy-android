import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InboxNotification } from '@/types/notificationsInbox';
import {
  dedupeNotifications,
  normalizeInboxNotification,
  sortNotificationsDesc,
} from '@/utils/notificationFormatters';

const CACHE_KEY = 'rutafy_notifications_cache';
export const NOTIFICATIONS_CACHE_MAX = 100;
/** TTL de producción: 5 minutos */
export const NOTIFICATIONS_CACHE_TTL_MS = 5 * 60 * 1000;

export type NotificationsInboxCache = {
  /** Última sincronización exitosa con backend / persistencia local */
  syncedAt: string;
  unreadCount: number;
  notifications: readonly InboxNotification[];
};

export type NotificationsInboxHydrateResult = {
  cache: NotificationsInboxCache | null;
  isExpired: boolean;
};

function cacheLog(message: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (detail) {
    console.log(`[inbox-cache] ${message}`, detail);
  } else {
    console.log(`[inbox-cache] ${message}`);
  }
}

function truncateRecent(items: readonly InboxNotification[]): InboxNotification[] {
  return sortNotificationsDesc(dedupeNotifications([...items])).slice(
    0,
    NOTIFICATIONS_CACHE_MAX,
  );
}

function parseSyncedAt(raw: Record<string, unknown>): string {
  // Migración defensiva: caches antiguos usaban updatedAt.
  const synced =
    typeof raw.syncedAt === 'string'
      ? raw.syncedAt
      : typeof raw.updatedAt === 'string'
        ? raw.updatedAt
        : null;
  return synced && Number.isFinite(Date.parse(synced))
    ? synced
    : new Date(0).toISOString();
}

function normalizeStoredCache(parsed: unknown): NotificationsInboxCache | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;
  const notifications = Array.isArray(root.notifications)
    ? truncateRecent(
        root.notifications
          .map((item) => normalizeInboxNotification(item))
          .filter((item): item is InboxNotification => item != null),
      )
    : [];

  return {
    syncedAt: parseSyncedAt(root),
    unreadCount:
      typeof root.unreadCount === 'number' && Number.isFinite(root.unreadCount)
        ? Math.max(0, root.unreadCount)
        : 0,
    notifications,
  };
}

/**
 * ¿El cache en memoria ya venció respecto al TTL?
 * No vuelve a leer AsyncStorage.
 */
export function isNotificationsInboxCacheExpired(
  cache: NotificationsInboxCache | null | undefined,
  ttlMs = NOTIFICATIONS_CACHE_TTL_MS,
  nowMs = Date.now(),
): boolean {
  if (!cache) return true;
  const syncedMs = Date.parse(cache.syncedAt);
  if (!Number.isFinite(syncedMs)) return true;
  return nowMs - syncedMs > ttlMs;
}

/**
 * Lee AsyncStorage una sola vez y calcula expiración en memoria.
 */
export async function hydrateNotificationsInboxCache(
  ttlMs = NOTIFICATIONS_CACHE_TTL_MS,
): Promise<NotificationsInboxHydrateResult> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) {
      return { cache: null, isExpired: true };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      cacheLog('invalid_json');
      return { cache: null, isExpired: true };
    }
    const cache = normalizeStoredCache(parsed);
    if (!cache) {
      cacheLog('invalid_shape');
      return { cache: null, isExpired: true };
    }
    return {
      cache,
      isExpired: isNotificationsInboxCacheExpired(cache, ttlMs),
    };
  } catch (e) {
    cacheLog('hydrate_failed', {
      error: e instanceof Error ? e.message : 'unknown',
    });
    return { cache: null, isExpired: true };
  }
}

/** Persistencia best-effort: fallos no deben romper la UI ni el flujo API. */
export async function saveNotificationsInboxCache(input: {
  notifications: readonly InboxNotification[];
  unreadCount: number;
}): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const payload: NotificationsInboxCache = {
      syncedAt: nowIso,
      unreadCount: Math.max(0, input.unreadCount),
      notifications: truncateRecent(input.notifications),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    cacheLog('save_failed', {
      error: e instanceof Error ? e.message : 'unknown',
    });
  }
}

export async function clearNotificationsInboxCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (e) {
    cacheLog('clear_failed', {
      error: e instanceof Error ? e.message : 'unknown',
    });
  }
}
