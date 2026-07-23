import { apiClient } from '@/api/client';
import { NOTIFICATION_ENDPOINTS } from '@/api/endpoints';
import type {
  InboxNotification,
  InboxResponse,
  ListInboxParams,
  NotificationPreferences,
  UnreadCountResponse,
} from '@/types/notificationsInbox';
import {
  normalizeInboxNotification,
  sortNotificationsDesc,
} from '@/utils/notificationFormatters';

function pickNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function pickStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeInboxResponse(raw: unknown): InboxResponse {
  const root =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const listRaw = Array.isArray(root.notifications)
    ? root.notifications
    : Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.data)
        ? root.data
        : [];

  const notifications = sortNotificationsDesc(
    listRaw
      .map((item) => normalizeInboxNotification(item))
      .filter((item): item is InboxNotification => item != null),
  );

  return {
    notifications,
    unread_count: pickNumber(root.unread_count ?? root.unreadCount, 0),
    next_cursor: pickStr(root.next_cursor ?? root.nextCursor),
  };
}

function buildInboxQuery(params: ListInboxParams = {}): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  if (params.limit != null) query.limit = params.limit;
  if (params.cursor) query.cursor = params.cursor;
  if (params.category) query.category = params.category;
  if (params.read != null) query.read = params.read;
  if (params.event_type) query.event_type = params.event_type;
  if (params.status) query.status = params.status;
  return query;
}

export async function listInbox(params: ListInboxParams = {}): Promise<InboxResponse> {
  const { data } = await apiClient.get(NOTIFICATION_ENDPOINTS.inbox, {
    params: buildInboxQuery(params),
  });
  return normalizeInboxResponse(data);
}

export async function getUnreadCount(): Promise<UnreadCountResponse> {
  const { data } = await apiClient.get(NOTIFICATION_ENDPOINTS.inboxUnreadCount);
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    unread_count: pickNumber(root.unread_count ?? root.unreadCount, 0),
  };
}

export async function getNotification(id: string): Promise<InboxNotification> {
  const { data } = await apiClient.get(NOTIFICATION_ENDPOINTS.inboxById(id));
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const candidate = root.notification ?? root.data ?? root;
  const normalized = normalizeInboxNotification(candidate);
  if (!normalized) {
    throw new Error('Notificación inválida');
  }
  return normalized;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(NOTIFICATION_ENDPOINTS.inboxRead(id), {});
}

export async function markNotificationOpened(id: string): Promise<void> {
  await apiClient.post(NOTIFICATION_ENDPOINTS.inboxOpened(id), {});
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post(NOTIFICATION_ENDPOINTS.inboxReadAll, {});
}

export async function archiveNotification(id: string): Promise<void> {
  await apiClient.post(NOTIFICATION_ENDPOINTS.inboxArchive(id), {});
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data } = await apiClient.get(NOTIFICATION_ENDPOINTS.preferences);
  if (data && typeof data === 'object') {
    const root = data as Record<string, unknown>;
    const prefs = root.preferences ?? root.data ?? root;
    if (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) {
      return prefs as NotificationPreferences;
    }
  }
  return {};
}

export async function updateNotificationPreferences(
  patch: NotificationPreferences,
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences();
  const next = { ...current, ...patch };
  const { data } = await apiClient.patch(NOTIFICATION_ENDPOINTS.preferences, next);
  if (data && typeof data === 'object') {
    const root = data as Record<string, unknown>;
    const prefs = root.preferences ?? root.data ?? root;
    if (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) {
      return prefs as NotificationPreferences;
    }
  }
  return next;
}
