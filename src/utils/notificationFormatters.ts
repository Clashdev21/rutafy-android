import type {
  InboxNotification,
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
} from '@/types/notificationsInbox';

const CATEGORIES = new Set<NotificationCategory>([
  'dispatch',
  'service',
  'operation',
  'alert',
  'promotion',
  'reminder',
  'marketing',
  'news',
  'system',
  'maintenance',
  'billing',
]);

const PRIORITIES = new Set<NotificationPriority>(['low', 'normal', 'high', 'critical']);
const STATUSES = new Set<NotificationStatus>(['active', 'expired', 'archived']);

function pickStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function isNotificationUnread(notification: InboxNotification): boolean {
  return !notification.read_at;
}

export function isNotificationExpired(notification: InboxNotification): boolean {
  if (notification.status === 'expired') return true;
  if (!notification.expires_at) return false;
  const ms = Date.parse(notification.expires_at);
  if (!Number.isFinite(ms)) return false;
  return Date.now() >= ms;
}

export function getNotificationCategoryLabel(category: NotificationCategory): string {
  switch (category) {
    case 'dispatch':
      return 'Ofertas';
    case 'service':
      return 'Servicios';
    case 'operation':
      return 'Operación';
    case 'alert':
      return 'Alertas';
    case 'promotion':
      return 'Promociones';
    case 'reminder':
      return 'Recordatorios';
    case 'marketing':
      return 'Marketing';
    case 'news':
      return 'Novedades';
    case 'system':
      return 'Sistema';
    case 'maintenance':
      return 'Mantenimiento';
    case 'billing':
      return 'Facturación';
    default:
      return 'Notificación';
  }
}

export function getNotificationPriorityLabel(priority: NotificationPriority): string {
  switch (priority) {
    case 'critical':
      return 'Crítica';
    case 'high':
      return 'Alta';
    case 'low':
      return 'Baja';
    default:
      return 'Normal';
  }
}

export function getNotificationPriorityGlyph(priority: NotificationPriority): string {
  switch (priority) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'low':
      return '⚪';
    default:
      return '🔵';
  }
}

export function getNotificationCategoryGlyph(category: NotificationCategory): string {
  switch (category) {
    case 'dispatch':
      return '📦';
    case 'service':
      return '🚚';
    case 'operation':
      return '⚙️';
    case 'alert':
      return '⚠️';
    case 'promotion':
      return '🏷️';
    case 'reminder':
      return '⏰';
    case 'marketing':
      return '📣';
    case 'news':
      return '📰';
    case 'system':
      return 'ℹ️';
    case 'maintenance':
      return '🛠️';
    case 'billing':
      return '💳';
    default:
      return '🔔';
  }
}

export function formatNotificationRelativeTime(iso: string, nowMs = Date.now()): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';

  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diffSec < 45) return 'Ahora';
  if (diffSec < 60) return `Hace ${diffSec} s`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `Hace ${diffHour} h`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `Hace ${diffDay} d`;

  return new Date(ms).toLocaleString();
}

export function formatNotificationAbsoluteTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString();
}

export function normalizeNotificationCategory(value: unknown): NotificationCategory {
  const raw = pickStr(value)?.toLowerCase();
  if (raw && CATEGORIES.has(raw as NotificationCategory)) {
    return raw as NotificationCategory;
  }
  return 'system';
}

export function normalizeNotificationPriority(value: unknown): NotificationPriority {
  const raw = pickStr(value)?.toLowerCase();
  if (raw && PRIORITIES.has(raw as NotificationPriority)) {
    return raw as NotificationPriority;
  }
  return 'normal';
}

export function normalizeNotificationStatus(value: unknown): NotificationStatus {
  const raw = pickStr(value)?.toLowerCase();
  if (raw && STATUSES.has(raw as NotificationStatus)) {
    return raw as NotificationStatus;
  }
  return 'active';
}

export function normalizeInboxNotification(raw: unknown): InboxNotification | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const notification_id =
    pickStr(row.notification_id) ?? pickStr(row.id) ?? pickStr(row.notificationId);
  const title = pickStr(row.title);
  const body = pickStr(row.body) ?? '';
  const created_at = pickStr(row.created_at) ?? pickStr(row.createdAt);
  if (!notification_id || !title || !created_at) return null;

  const data =
    row.data && typeof row.data === 'object' && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};

  return {
    notification_id,
    category: normalizeNotificationCategory(row.category),
    event_type: pickStr(row.event_type) ?? pickStr(row.eventType) ?? 'unknown',
    title,
    body,
    priority: normalizeNotificationPriority(row.priority),
    status: normalizeNotificationStatus(row.status),
    data,
    deep_link: pickStr(row.deep_link) ?? pickStr(row.deepLink),
    read_at: pickStr(row.read_at) ?? pickStr(row.readAt),
    opened_at: pickStr(row.opened_at) ?? pickStr(row.openedAt),
    archived_at: pickStr(row.archived_at) ?? pickStr(row.archivedAt),
    expires_at: pickStr(row.expires_at) ?? pickStr(row.expiresAt),
    created_at,
  };
}

export function sortNotificationsDesc(items: InboxNotification[]): InboxNotification[] {
  return [...items].sort((a, b) => {
    const aMs = Date.parse(a.created_at);
    const bMs = Date.parse(b.created_at);
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });
}

export function dedupeNotifications(items: InboxNotification[]): InboxNotification[] {
  const map = new Map<string, InboxNotification>();
  for (const item of items) {
    const existing = map.get(item.notification_id);
    if (!existing) {
      map.set(item.notification_id, item);
      continue;
    }
    const existingMs = Date.parse(existing.created_at);
    const nextMs = Date.parse(item.created_at);
    if ((Number.isFinite(nextMs) ? nextMs : 0) >= (Number.isFinite(existingMs) ? existingMs : 0)) {
      map.set(item.notification_id, item);
    }
  }
  return sortNotificationsDesc([...map.values()]);
}
