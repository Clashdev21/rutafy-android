import { useLocalSearchParams, type Href, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppHeader, AppText } from '@/components/ui';
import { useNotificationsInbox } from '@/contexts/NotificationsInboxContext';
import { getNotification } from '@/services/notificationsInboxService';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import type { InboxNotification } from '@/types/notificationsInbox';
import { getApiErrorMessage } from '@/utils/errors';
import {
  formatNotificationAbsoluteTime,
  getNotificationCategoryLabel,
  isNotificationExpired,
} from '@/utils/notificationFormatters';
import { navigateInboxNotification } from '@/utils/notificationNavigation';
import { useAuth } from '@/auth/useAuth';

type Props = {
  role: 'mensajero' | 'transportista';
};

function resolvePrimaryCtaLabel(notification: InboxNotification): string {
  if (notification.event_type === 'dispatch_offer') return 'Ver oferta';
  if (notification.category === 'service' || notification.deep_link?.includes('service')) {
    return 'Ver servicio';
  }
  if (notification.deep_link) return 'Abrir';
  return 'Ver detalle';
}

export function NotificationDetailScreen({ role }: Props) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const notificationId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const { getNotificationById, markOpened, markRead, archive } = useNotificationsInbox();
  const { user } = useAuth();
  const [notification, setNotification] = useState<InboxNotification | null>(
    notificationId ? getNotificationById(notificationId) : null,
  );
  const [loading, setLoading] = useState(!notification);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!notificationId) return;
    setLoading(true);
    setError(null);
    try {
      const item = await getNotification(notificationId);
      setNotification(item);
      if (!item.read_at) {
        await markRead(item.notification_id);
      }
      await markOpened(item.notification_id);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo cargar la notificación'));
    } finally {
      setLoading(false);
    }
  }, [markOpened, markRead, notificationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!notification) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader title="Detalle" />
        <AppText color={colors.danger}>{error ?? 'Notificación no encontrada'}</AppText>
        <AppButton
          label="Volver"
          variant="secondary"
          onPress={() => router.replace(`/${role}/notificaciones` as Href)}
        />
      </SafeAreaView>
    );
  }

  const expired = isNotificationExpired(notification);
  const ctaLabel = expired
    ? `${resolvePrimaryCtaLabel(notification)} (expirada)`
    : resolvePrimaryCtaLabel(notification);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader
          title="Detalle"
          subtitle={getNotificationCategoryLabel(notification.category)}
        />

        <AppText variant="title">{notification.title}</AppText>
        <AppText variant="caption" color={colors.subtitle}>
          {formatNotificationAbsoluteTime(notification.created_at)}
          {expired ? ' · Expirada' : ''}
        </AppText>
        <AppText variant="body" color={colors.subtitle} style={styles.body}>
          {notification.body || 'Sin detalle'}
        </AppText>

        {error ? (
          <AppText variant="caption" color={colors.danger}>
            {error}
          </AppText>
        ) : null}

        <AppButton
          label={ctaLabel}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            try {
              navigateInboxNotification(notification, user?.appRole ?? null);
            } finally {
              setBusy(false);
            }
          }}
        />

        <Pressable
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Archivar notificación"
          onPress={() => {
            void (async () => {
              setBusy(true);
              try {
                await archive(notification.notification_id);
                router.replace(`/${role}/notificaciones` as Href);
              } catch (e) {
                setError(getApiErrorMessage(e, 'No se pudo archivar'));
              } finally {
                setBusy(false);
              }
            })();
          }}
          style={styles.archiveBtn}>
          <AppText variant="bodyMedium" color={colors.subtitle}>
            Archivar
          </AppText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  content: {
    gap: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  body: { lineHeight: 22 },
  archiveBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
