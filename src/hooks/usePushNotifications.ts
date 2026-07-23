import { type Href, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { useNotificationsInbox } from '@/contexts/NotificationsInboxContext';
import { trackCommunicationsEvent } from '@/services/communicationsAnalytics';
import {
  parsePushNotificationData,
  setupNotificationHandler,
  type PushNotificationData,
} from '@/services/notificationService';
import { recordPushDiagnostic } from '@/services/pushDiagnostics';
import { registerPushIfSessionReady } from '@/services/pushRegistration';
import {
  clearPendingDispatchOfferIntent,
  setPendingDispatchOfferIntent,
} from '@/services/pushNavigationIntent';
import { appRoleToMobileRole } from '@/utils/roles';

const MENSAJERO_HOME = '/mensajero/(tabs)' as Href;

function logPush(tag: string, detail?: Record<string, unknown>): void {
  if (detail && Object.keys(detail).length > 0) {
    console.log(tag, detail);
  } else {
    console.log(tag);
  }
}

function resolveMensajeroScreen(data: PushNotificationData): Href {
  const screen = typeof data.screen === 'string' ? data.screen.trim() : '';
  if (screen.startsWith('/mensajero') && !screen.includes('/ofertas/')) {
    return screen as Href;
  }
  return MENSAJERO_HOME;
}

function storeDispatchOfferIntent(data: PushNotificationData): void {
  setPendingDispatchOfferIntent({
    offerId: typeof data.offer_id === 'string' ? data.offer_id : undefined,
    serviceId: typeof data.service_id === 'string' ? data.service_id : undefined,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
  });
}

function pickNotificationId(data: PushNotificationData): string | null {
  const raw = data.notification_id ?? data.notificationId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

type InboxBridge = {
  refreshUnreadCount: () => Promise<void>;
  refreshInbox: () => Promise<void>;
  markOpened: (id: string) => Promise<void>;
};

type PushNavigationDeps = {
  queueNavigation: (href: Href) => void;
  inbox: InboxBridge;
};

function handleForegroundNotification(data: PushNotificationData, inbox: InboxBridge): void {
  logPush('[push-received-foreground]', {
    type: data.type ?? null,
    screen: data.screen ?? null,
  });
  recordPushDiagnostic('push-listener-received', {
    type: data.type ?? null,
    screen: data.screen ?? null,
  });
  trackCommunicationsEvent('notification_received', {
    type: data.type ?? null,
    notification_id: pickNotificationId(data),
    source: 'foreground',
  });

  void inbox.refreshUnreadCount();
  void inbox.refreshInbox();

  if (data.type === 'test' && __DEV__) {
    Alert.alert('Notificación de prueba', 'Push recibida en primer plano.');
  }
}

function handleNotificationResponse(data: PushNotificationData, deps: PushNavigationDeps): void {
  logPush('[push-response]', {
    type: data.type ?? null,
    screen: data.screen ?? null,
    service_id: data.service_id ?? null,
    offer_id: data.offer_id ?? null,
  });
  recordPushDiagnostic('push-listener-response', {
    type: data.type ?? null,
    screen: data.screen ?? null,
    offerId: data.offer_id ?? null,
    serviceId: data.service_id ?? null,
  });

  const notificationId = pickNotificationId(data);
  // markOpened es idempotente: solo llama API si opened_at == null
  if (notificationId) {
    void deps.inbox.markOpened(notificationId);
  }
  void deps.inbox.refreshUnreadCount();
  void deps.inbox.refreshInbox();

  if (data.type === 'dispatch_offer') {
    storeDispatchOfferIntent(data);
    recordPushDiagnostic('push-navigation-intent', {
      type: 'dispatch_offer',
      screen: typeof data.screen === 'string' ? data.screen : '/mensajero',
      offerId: data.offer_id ?? null,
      serviceId: data.service_id ?? null,
    });
    deps.queueNavigation(resolveMensajeroScreen(data));
    return;
  }

  const screen = typeof data.screen === 'string' ? data.screen.trim() : '';
  if (!screen) {
    return;
  }

  logPush('[push-navigate]', { screen, type: data.type ?? null });
  recordPushDiagnostic('push-navigation-intent', {
    type: data.type ?? null,
    screen,
  });
  deps.queueNavigation(screen as Href);
}

/**
 * Listeners globales de push. Montar una sola vez dentro de AuthProvider + router.
 */
export function usePushNotifications(): void {
  const { isLoading, isAuthenticated, user } = useAuth();
  const { refreshInbox, refreshUnreadCount, markOpened } = useNotificationsInbox();
  const pendingNavRef = useRef<Href | null>(null);
  const authReadyRef = useRef({ isLoading, isAuthenticated, user });
  const inboxRef = useRef<InboxBridge>({
    refreshInbox,
    refreshUnreadCount,
    markOpened,
  });

  authReadyRef.current = { isLoading, isAuthenticated, user };
  inboxRef.current = { refreshInbox, refreshUnreadCount, markOpened };

  const flushPendingNavigation = (): void => {
    const href = pendingNavRef.current;
    if (!href) return;

    const { isLoading: loading, isAuthenticated: authed, user: currentUser } =
      authReadyRef.current;
    if (loading) return;

    pendingNavRef.current = null;

    if (!authed) {
      logPush('[push-navigate-deferred]', { reason: 'not_authenticated', href });
      return;
    }

    const mobileRole = currentUser ? appRoleToMobileRole(currentUser.appRole) : null;
    const hrefStr = typeof href === 'string' ? href : '';
    if (hrefStr.startsWith('/mensajero') && mobileRole !== 'mensajero') {
      clearPendingDispatchOfferIntent();
      logPush('[push-navigate-deferred]', { reason: 'wrong_role', href });
      return;
    }

    logPush('[push-navigate]', { href, type: 'deferred' });
    router.replace(href);
  };

  const queueNavigation = (href: Href): void => {
    pendingNavRef.current = href;
    flushPendingNavigation();
  };

  useEffect(() => {
    flushPendingNavigation();
  }, [isLoading, isAuthenticated, user]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const { isAuthenticated: authed, user: currentUser } = authReadyRef.current;
      if (!authed || !currentUser) return;
      void registerPushIfSessionReady(currentUser, 'app_foreground');
      void inboxRef.current.refreshUnreadCount();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setupNotificationHandler();

    const deps: PushNavigationDeps = {
      queueNavigation,
      inbox: {
        refreshInbox: () => inboxRef.current.refreshInbox(),
        refreshUnreadCount: () => inboxRef.current.refreshUnreadCount(),
        markOpened: (id) => inboxRef.current.markOpened(id),
      },
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = parsePushNotificationData(
        response.notification.request.content.data,
      );
      handleNotificationResponse(data, deps);
    });

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = parsePushNotificationData(notification.request.content.data);
      handleForegroundNotification(data, deps.inbox);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = parsePushNotificationData(response.notification.request.content.data);
      handleNotificationResponse(data, deps);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);
}
