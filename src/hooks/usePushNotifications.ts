import { type Href, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import {
  parsePushNotificationData,
  setupNotificationHandler,
  type PushNotificationData,
} from '@/services/notificationService';
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
  if (screen.startsWith('/mensajero')) {
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

function handleForegroundNotification(data: PushNotificationData): void {
  logPush('[push-received-foreground]', {
    type: data.type ?? null,
    screen: data.screen ?? null,
  });

  if (data.type === 'test' && __DEV__) {
    Alert.alert('Notificación de prueba', 'Push recibida en primer plano.');
  }
}

type PushNavigationDeps = {
  queueNavigation: (href: Href) => void;
};

function handleNotificationResponse(data: PushNotificationData, deps: PushNavigationDeps): void {
  logPush('[push-response]', {
    type: data.type ?? null,
    screen: data.screen ?? null,
    service_id: data.service_id ?? null,
    offer_id: data.offer_id ?? null,
  });

  if (data.type === 'dispatch_offer') {
    storeDispatchOfferIntent(data);
    deps.queueNavigation(resolveMensajeroScreen(data));
    return;
  }

  const screen = typeof data.screen === 'string' ? data.screen.trim() : '';
  if (!screen) {
    return;
  }

  logPush('[push-navigate]', { screen, type: data.type ?? null });
  deps.queueNavigation(screen as Href);
}

/**
 * Listeners globales de push. Montar una sola vez dentro de AuthProvider + router.
 */
export function usePushNotifications(): void {
  const { isLoading, isAuthenticated, user } = useAuth();
  const pendingNavRef = useRef<Href | null>(null);
  const authReadyRef = useRef({ isLoading, isAuthenticated, user });

  authReadyRef.current = { isLoading, isAuthenticated, user };

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
    setupNotificationHandler();

    const deps: PushNavigationDeps = { queueNavigation };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = parsePushNotificationData(
        response.notification.request.content.data,
      );
      handleNotificationResponse(data, deps);
    });

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = parsePushNotificationData(notification.request.content.data);
      handleForegroundNotification(data);
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
