import { type Href, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import {
  parsePushNotificationData,
  setupNotificationHandler,
  type PushNotificationData,
} from '@/services/notificationService';

function logPush(tag: string, detail?: Record<string, unknown>): void {
  if (detail && Object.keys(detail).length > 0) {
    console.log(tag, detail);
  } else {
    console.log(tag);
  }
}

function navigateFromPushData(data: PushNotificationData): void {
  const screen = typeof data.screen === 'string' ? data.screen.trim() : '';
  if (!screen) {
    return;
  }

  logPush('[push-navigate]', { screen, type: data.type ?? null });
  router.push(screen as Href);
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

function handleNotificationResponse(data: PushNotificationData): void {
  logPush('[push-response]', {
    type: data.type ?? null,
    screen: data.screen ?? null,
    service_id: data.service_id ?? null,
    offer_id: data.offer_id ?? null,
  });

  navigateFromPushData(data);
}

/**
 * Listeners globales de push. Montar una sola vez dentro de AuthProvider + router.
 */
export function usePushNotifications(): void {
  useEffect(() => {
    setupNotificationHandler();

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = parsePushNotificationData(
        response.notification.request.content.data,
      );
      handleNotificationResponse(data);
    });

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = parsePushNotificationData(notification.request.content.data);
      handleForegroundNotification(data);
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = parsePushNotificationData(response.notification.request.content.data);
      handleNotificationResponse(data);
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);
}
