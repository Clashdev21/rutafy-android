import { usePushNotifications } from '@/hooks/usePushNotifications';

/** Monta listeners globales de push una sola vez. */
export function PushNotificationsBootstrap() {
  usePushNotifications();
  return null;
}
