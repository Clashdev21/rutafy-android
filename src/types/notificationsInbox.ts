export type NotificationCategory =
  | 'dispatch'
  | 'service'
  | 'operation'
  | 'alert'
  | 'promotion'
  | 'reminder'
  | 'marketing'
  | 'news'
  | 'system'
  | 'maintenance'
  | 'billing';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationStatus = 'active' | 'expired' | 'archived';

export type InboxListFilter = 'all' | 'unread' | 'read' | 'archived';

export interface InboxNotification {
  readonly notification_id: string;
  readonly category: NotificationCategory;
  readonly event_type: string;
  readonly title: string;
  readonly body: string;
  readonly priority: NotificationPriority;
  readonly status: NotificationStatus;
  readonly data: Readonly<Record<string, unknown>>;
  readonly deep_link: string | null;
  readonly read_at: string | null;
  readonly opened_at: string | null;
  readonly archived_at: string | null;
  readonly expires_at: string | null;
  readonly created_at: string;
}

export interface InboxResponse {
  readonly notifications: readonly InboxNotification[];
  readonly unread_count: number;
  readonly next_cursor: string | null;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export type ListInboxParams = {
  limit?: number;
  cursor?: string | null;
  category?: NotificationCategory | null;
  read?: boolean | null;
  event_type?: string | null;
  status?: NotificationStatus | null;
};

export type NotificationPreferences = {
  offers_enabled?: boolean;
  service_updates_enabled?: boolean;
  tracking_alerts_enabled?: boolean;
  reminders_enabled?: boolean;
  promotions_enabled?: boolean;
  critical_alerts_enabled?: boolean;
  [key: string]: unknown;
};
