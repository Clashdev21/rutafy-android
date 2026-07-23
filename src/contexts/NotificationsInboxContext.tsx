import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { trackCommunicationsEvent } from '@/services/communicationsAnalytics';
import {
  archiveNotification as archiveNotificationApi,
  getUnreadCount,
  listInbox,
  markAllNotificationsRead as markAllReadApi,
  markNotificationOpened as markOpenedApi,
  markNotificationRead as markReadApi,
} from '@/services/notificationsInboxService';
import {
  hydrateNotificationsInboxCache,
  saveNotificationsInboxCache,
} from '@/storage/notificationsInboxCache';
import type {
  InboxListFilter,
  InboxNotification,
  NotificationCategory,
} from '@/types/notificationsInbox';
import { getApiErrorMessage } from '@/utils/errors';
import {
  dedupeNotifications,
  isNotificationUnread,
  sortNotificationsDesc,
} from '@/utils/notificationFormatters';
import { navigateInboxNotification } from '@/utils/notificationNavigation';

const PAGE_SIZE = 20;
/** Refresh periódico solo con app en foreground / inbox abierta — nunca 90s */
const OPEN_SCREEN_POLL_MS = 5 * 60 * 1000;

/**
 * Política TTL (5 min) del inbox:
 *
 * - Al autenticar / restaurar sesión:
 *   · cache fresco → hidratar; NO refresh completo inmediato; sí unreadCount ligero.
 *   · sin cache o vencido → hidratar lo disponible + loadInbox({ silent: true }).
 * - Al abrir la pantalla de notificaciones (acción explícita): soft-refresh aunque esté fresco.
 * - Push recibido / pull-to-refresh: ignorar TTL y refrescar.
 */

type NotificationsInboxContextValue = {
  notifications: readonly InboxNotification[];
  unreadCount: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  selectedCategory: NotificationCategory | null;
  listFilter: InboxListFilter;
  setSelectedCategory: (category: NotificationCategory | null) => void;
  setListFilter: (filter: InboxListFilter) => void;
  setInboxScreenVisible: (visible: boolean) => void;
  loadInbox: (opts?: { silent?: boolean }) => Promise<void>;
  refreshInbox: () => Promise<void>;
  loadMore: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markOpened: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  archive: (id: string) => Promise<void>;
  /** Solo limpia archivadas del estado/cache local; no elimina en servidor. */
  clearArchivedLocally: () => Promise<void>;
  handleNotificationPress: (notification: InboxNotification) => Promise<void>;
  getNotificationById: (id: string) => InboxNotification | null;
  filteredNotifications: readonly InboxNotification[];
};

const NotificationsInboxContext = createContext<NotificationsInboxContextValue | null>(null);

/** Contexto aislado: el badge solo observa unreadCount */
const UnreadCountContext = createContext<number>(0);

function inboxLog(tag: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (detail && Object.keys(detail).length > 0) {
    console.log(tag, detail);
  } else {
    console.log(tag);
  }
}

function countUnread(items: readonly InboxNotification[]): number {
  return items.filter((item) => isNotificationUnread(item) && item.status !== 'archived').length;
}

type ProviderProps = {
  children: ReactNode;
};

export function NotificationsInboxProvider({ children }: ProviderProps) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | null>(null);
  const [listFilter, setListFilter] = useState<InboxListFilter>('all');
  const [inboxScreenVisible, setInboxScreenVisible] = useState(false);

  const hydratedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const notificationsRef = useRef<InboxNotification[]>([]);
  const unreadCountRef = useRef(0);
  const openedInFlightRef = useRef<Set<string>>(new Set());
  /** Ids abiertos localmente (push frío / race setState); se poda al sincronizar opened_at. */
  const localOpenedIdsRef = useRef<Set<string>>(new Set());
  const readInFlightRef = useRef<Set<string>>(new Set());
  const archiveInFlightRef = useRef<Set<string>>(new Set());
  const readAllInFlightRef = useRef(false);
  const lastCacheExpiredRef = useRef(true);

  notificationsRef.current = notifications;
  unreadCountRef.current = unreadCount;

  /** Persistencia best-effort: nunca propaga errores de AsyncStorage. */
  const persistCacheBestEffort = useCallback(
    (items: readonly InboxNotification[], unread: number) => {
      void saveNotificationsInboxCache({
        notifications: items,
        unreadCount: unread,
      });
    },
    [],
  );

  const pruneLocalOpenedIds = useCallback((items: readonly InboxNotification[]) => {
    for (const item of items) {
      if (item.opened_at) {
        localOpenedIdsRef.current.delete(item.notification_id);
      }
    }
  }, []);

  const replaceNotificationsLocally = useCallback(
    (next: InboxNotification[], nextUnread?: number) => {
      const unread =
        typeof nextUnread === 'number' ? Math.max(0, nextUnread) : countUnread(next);
      pruneLocalOpenedIds(next);
      notificationsRef.current = next;
      unreadCountRef.current = unread;
      setNotifications(next);
      setUnreadCount(unread);
      persistCacheBestEffort(next, unread);
    },
    [persistCacheBestEffort, pruneLocalOpenedIds],
  );

  const updateNotificationLocally = useCallback(
    (
      id: string,
      updater: (item: InboxNotification) => InboxNotification,
      nextUnread?: number,
    ): InboxNotification[] => {
      const prev = notificationsRef.current;
      const next = prev.map((item) =>
        item.notification_id === id ? updater(item) : item,
      );
      replaceNotificationsLocally(next, nextUnread);
      return next;
    },
    [replaceNotificationsLocally],
  );

  const hydrateFromCache = useCallback(async (): Promise<{ isExpired: boolean }> => {
    if (hydratedRef.current) {
      return { isExpired: lastCacheExpiredRef.current };
    }
    hydratedRef.current = true;
    // Una sola lectura AsyncStorage; isExpired se calcula en memoria.
    const { cache, isExpired } = await hydrateNotificationsInboxCache();
    lastCacheExpiredRef.current = isExpired;
    if (cache) {
      const items = [...cache.notifications];
      pruneLocalOpenedIds(items);
      notificationsRef.current = items;
      unreadCountRef.current = cache.unreadCount;
      setNotifications(items);
      setUnreadCount(cache.unreadCount);
      inboxLog('[inbox-hydrate]', {
        count: items.length,
        unread: cache.unreadCount,
        syncedAt: cache.syncedAt,
        isExpired,
      });
    }
    return { isExpired };
  }, [pruneLocalOpenedIds]);

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const result = await getUnreadCount();
      const unread = Math.max(0, result.unread_count);
      unreadCountRef.current = unread;
      setUnreadCount(unread);
      inboxLog('[inbox-unread-refresh]', { unread });
      persistCacheBestEffort(notificationsRef.current, unread);
    } catch (e) {
      inboxLog('[inbox-unread-refresh]', {
        error: getApiErrorMessage(e, 'unread_failed'),
      });
    }
  }, [isAuthenticated, persistCacheBestEffort]);

  const loadInbox = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isAuthenticated) return;
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;

      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      setError(null);
      inboxLog('[inbox-load]', { category: selectedCategory, filter: listFilter });

      try {
        const status =
          listFilter === 'archived'
            ? 'archived'
            : listFilter === 'all'
              ? null
              : 'active';
        const read =
          listFilter === 'unread' ? false : listFilter === 'read' ? true : null;

        const response = await listInbox({
          limit: PAGE_SIZE,
          category: selectedCategory,
          status,
          read,
        });

        const next = [...response.notifications];
        const unread = Math.max(0, response.unread_count);
        notificationsRef.current = next;
        unreadCountRef.current = unread;
        setNotifications(next);
        setNextCursor(response.next_cursor);
        setUnreadCount(unread);
        // Persistencia best-effort: no debe convertir éxito API en error de carga.
        persistCacheBestEffort(next, unread);
        inboxLog('[inbox-load]', {
          ok: true,
          count: next.length,
          unread,
        });
      } catch (e) {
        const message = getApiErrorMessage(e, 'No se pudieron cargar las notificaciones');
        setError(message);
        inboxLog('[inbox-load]', { ok: false, error: message });
      } finally {
        if (!silent) setLoading(false);
        loadInFlightRef.current = false;
      }
    },
    [isAuthenticated, listFilter, persistCacheBestEffort, selectedCategory],
  );

  const refreshInbox = useCallback(async () => {
    if (!isAuthenticated) return;
    setRefreshing(true);
    inboxLog('[inbox-refresh]');
    try {
      await loadInbox({ silent: true });
      await refreshUnreadCount();
    } finally {
      setRefreshing(false);
    }
  }, [isAuthenticated, loadInbox, refreshUnreadCount]);

  const loadMore = useCallback(async () => {
    if (!isAuthenticated || !nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const status =
        listFilter === 'archived'
          ? 'archived'
          : listFilter === 'all'
            ? null
            : 'active';
      const read =
        listFilter === 'unread' ? false : listFilter === 'read' ? true : null;

      const response = await listInbox({
        limit: PAGE_SIZE,
        cursor: nextCursor,
        category: selectedCategory,
        status,
        read,
      });

      const merged = sortNotificationsDesc(
        dedupeNotifications([...notificationsRef.current, ...response.notifications]),
      );
      const unread = Math.max(0, response.unread_count);
      replaceNotificationsLocally(merged, unread);
      setNextCursor(response.next_cursor);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar más notificaciones'));
    } finally {
      setLoadingMore(false);
    }
  }, [
    isAuthenticated,
    listFilter,
    loading,
    loadingMore,
    nextCursor,
    replaceNotificationsLocally,
    selectedCategory,
  ]);

  const markRead = useCallback(
    async (id: string) => {
      if (readAllInFlightRef.current) {
        inboxLog('[inbox-read]', { id, skipped: 'read_all_in_flight' });
        return;
      }

      const existing = notificationsRef.current.find((item) => item.notification_id === id);
      if (existing?.read_at) return;
      if (readInFlightRef.current.has(id)) {
        inboxLog('[inbox-read]', { id, skipped: 'in_flight' });
        return;
      }

      readInFlightRef.current.add(id);
      const snapshot = notificationsRef.current;
      const previousUnread = unreadCountRef.current;
      const nowIso = new Date().toISOString();

      // Optimista + ref síncrono antes del await (evita doble POST por race setState).
      const nextUnread = Math.max(
        0,
        existing && isNotificationUnread(existing)
          ? previousUnread - 1
          : countUnread(
              snapshot.map((item) =>
                item.notification_id === id ? { ...item, read_at: nowIso } : item,
              ),
            ),
      );
      updateNotificationLocally(
        id,
        (item) => (item.read_at ? item : { ...item, read_at: nowIso }),
        nextUnread,
      );

      inboxLog('[inbox-read]', { id });
      trackCommunicationsEvent('notification_read', { notification_id: id });

      try {
        await markReadApi(id);
      } catch (e) {
        replaceNotificationsLocally(snapshot, previousUnread);
        throw e;
      } finally {
        readInFlightRef.current.delete(id);
      }
    },
    [replaceNotificationsLocally, updateNotificationLocally],
  );

  const markOpened = useCallback(
    async (id: string) => {
      const existing = notificationsRef.current.find((item) => item.notification_id === id);
      if (existing?.opened_at || localOpenedIdsRef.current.has(id)) {
        inboxLog('[inbox-opened]', { id, skipped: 'already_opened' });
        return;
      }
      if (openedInFlightRef.current.has(id)) {
        inboxLog('[inbox-opened]', { id, skipped: 'in_flight' });
        return;
      }

      openedInFlightRef.current.add(id);
      localOpenedIdsRef.current.add(id);
      const snapshot = notificationsRef.current;
      const previousUnread = unreadCountRef.current;
      const nowIso = new Date().toISOString();

      // Optimista antes del await: opened_at / localOpenedIds bloquean segundos intentos.
      if (existing) {
        updateNotificationLocally(id, (item) => ({
          ...item,
          opened_at: item.opened_at ?? nowIso,
          read_at: item.read_at ?? nowIso,
        }));
      }

      inboxLog('[inbox-opened]', { id });
      trackCommunicationsEvent('notification_opened', { notification_id: id });

      try {
        await markOpenedApi(id);
        // Éxito: localOpenedIds permanece hasta que la lista sincronice opened_at (poda).
      } catch (e) {
        localOpenedIdsRef.current.delete(id);
        replaceNotificationsLocally(snapshot, previousUnread);
        inboxLog('[inbox-opened]', {
          id,
          error: getApiErrorMessage(e, 'opened_failed'),
        });
      } finally {
        openedInFlightRef.current.delete(id);
      }
    },
    [replaceNotificationsLocally, updateNotificationLocally],
  );

  const markAllRead = useCallback(async () => {
    if (readAllInFlightRef.current) {
      inboxLog('[inbox-read-all]', { skipped: 'in_flight' });
      return;
    }

    readAllInFlightRef.current = true;
    const snapshot = notificationsRef.current;
    const previousUnread = unreadCountRef.current;
    const nowIso = new Date().toISOString();
    const next = snapshot.map((item) =>
      item.read_at ? item : { ...item, read_at: nowIso },
    );
    replaceNotificationsLocally(next, 0);
    // Evita POST /read individuales concurrentes mientras corre mark-all.
    readInFlightRef.current.clear();

    inboxLog('[inbox-read-all]');
    trackCommunicationsEvent('notification_read_all');

    try {
      await markAllReadApi();
    } catch (e) {
      replaceNotificationsLocally(snapshot, previousUnread);
      throw e;
    } finally {
      readAllInFlightRef.current = false;
    }
  }, [replaceNotificationsLocally]);

  const archive = useCallback(
    async (id: string) => {
      if (archiveInFlightRef.current.has(id)) {
        inboxLog('[inbox-archive]', { id, skipped: 'in_flight' });
        return;
      }

      archiveInFlightRef.current.add(id);
      const snapshot = notificationsRef.current;
      const previousUnread = unreadCountRef.current;
      const nowIso = new Date().toISOString();
      const nextPreview = snapshot.map((item) =>
        item.notification_id === id
          ? {
              ...item,
              status: 'archived' as const,
              archived_at: nowIso,
              read_at: item.read_at ?? nowIso,
            }
          : item,
      );
      updateNotificationLocally(
        id,
        (item) => ({
          ...item,
          status: 'archived' as const,
          archived_at: nowIso,
          read_at: item.read_at ?? nowIso,
        }),
        Math.max(0, countUnread(nextPreview)),
      );

      inboxLog('[inbox-archive]', { id });
      trackCommunicationsEvent('notification_archived', { notification_id: id });

      try {
        await archiveNotificationApi(id);
      } catch (e) {
        replaceNotificationsLocally(snapshot, previousUnread);
        throw e;
      } finally {
        archiveInFlightRef.current.delete(id);
      }
    },
    [replaceNotificationsLocally, updateNotificationLocally],
  );

  /**
   * Limpia archivadas solo del estado/cache local.
   * Tras sincronizar con backend pueden reaparecer (no hay clear remoto).
   */
  const clearArchivedLocally = useCallback(async () => {
    const snapshot = notificationsRef.current;
    const next = snapshot.filter((item) => item.status !== 'archived');
    const nextUnread = Math.max(0, countUnread(next));
    replaceNotificationsLocally(next, nextUnread);
    inboxLog('[inbox-clear-archived-local]', {
      removed: snapshot.length - next.length,
    });
  }, [replaceNotificationsLocally]);

  const handleNotificationPress = useCallback(
    async (notification: InboxNotification) => {
      const latest =
        notificationsRef.current.find(
          (item) => item.notification_id === notification.notification_id,
        ) ?? notification;
      try {
        if (!latest.read_at) {
          await markRead(latest.notification_id);
        }
        const opened =
          Boolean(
            notificationsRef.current.find(
              (item) => item.notification_id === latest.notification_id,
            )?.opened_at,
          ) || localOpenedIdsRef.current.has(latest.notification_id);
        if (!opened) {
          await markOpened(latest.notification_id);
        }
      } catch {
        // Navegamos igual; el usuario no debe quedar bloqueado.
      }
      navigateInboxNotification(latest, user?.appRole ?? null);
    },
    [markOpened, markRead, user?.appRole],
  );

  const getNotificationById = useCallback(
    (id: string) => notificationsRef.current.find((item) => item.notification_id === id) ?? null,
    [],
  );

  const filteredNotifications = useMemo(() => {
    let items: InboxNotification[] = [...notifications];
    if (selectedCategory) {
      items = items.filter((item) => item.category === selectedCategory);
    }
    if (listFilter === 'unread') {
      items = items.filter((item) => isNotificationUnread(item) && item.status !== 'archived');
    } else if (listFilter === 'read') {
      items = items.filter((item) => !isNotificationUnread(item) && item.status !== 'archived');
    } else if (listFilter === 'archived') {
      items = items.filter((item) => item.status === 'archived');
    } else {
      items = items.filter((item) => item.status !== 'archived');
    }
    return sortNotificationsDesc(items);
  }, [listFilter, notifications, selectedCategory]);

  useEffect(() => {
    if (!isAuthenticated) {
      notificationsRef.current = [];
      unreadCountRef.current = 0;
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
      setError(null);
      hydratedRef.current = false;
      lastCacheExpiredRef.current = true;
      openedInFlightRef.current.clear();
      localOpenedIdsRef.current.clear();
      readInFlightRef.current.clear();
      archiveInFlightRef.current.clear();
      readAllInFlightRef.current = false;
      return;
    }

    void (async () => {
      const { isExpired } = await hydrateFromCache();
      if (isExpired) {
        void loadInbox({ silent: true });
      } else {
        // Cache fresco: no refresh completo inmediato; solo contador ligero.
        void refreshUnreadCount();
      }
    })();
  }, [hydrateFromCache, isAuthenticated, loadInbox, refreshUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshUnreadCount();
        void refreshInbox();
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, refreshInbox, refreshUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void refreshUnreadCount();
      if (inboxScreenVisible) {
        void refreshInbox();
      }
    }, OPEN_SCREEN_POLL_MS);
    return () => clearInterval(id);
  }, [inboxScreenVisible, isAuthenticated, refreshInbox, refreshUnreadCount]);

  const value = useMemo<NotificationsInboxContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      refreshing,
      loadingMore,
      error,
      nextCursor,
      selectedCategory,
      listFilter,
      setSelectedCategory,
      setListFilter,
      setInboxScreenVisible,
      loadInbox,
      refreshInbox,
      loadMore,
      refreshUnreadCount,
      markRead,
      markOpened,
      markAllRead,
      archive,
      clearArchivedLocally,
      handleNotificationPress,
      getNotificationById,
      filteredNotifications,
    }),
    [
      archive,
      clearArchivedLocally,
      error,
      filteredNotifications,
      getNotificationById,
      handleNotificationPress,
      listFilter,
      loadInbox,
      loadMore,
      loading,
      loadingMore,
      markAllRead,
      markOpened,
      markRead,
      nextCursor,
      notifications,
      refreshInbox,
      refreshUnreadCount,
      refreshing,
      selectedCategory,
      unreadCount,
    ],
  );

  return (
    <UnreadCountContext.Provider value={unreadCount}>
      <NotificationsInboxContext.Provider value={value}>
        {children}
      </NotificationsInboxContext.Provider>
    </UnreadCountContext.Provider>
  );
}

export function useNotificationsInbox(): NotificationsInboxContextValue {
  const ctx = useContext(NotificationsInboxContext);
  if (!ctx) {
    throw new Error('useNotificationsInbox debe usarse dentro de NotificationsInboxProvider');
  }
  return ctx;
}

/** Solo unreadCount — evita re-render del badge cuando cambia la lista. */
export function useUnreadNotificationCount(): number {
  return useContext(UnreadCountContext);
}
