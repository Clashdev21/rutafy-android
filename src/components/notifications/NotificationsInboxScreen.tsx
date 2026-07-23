import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationListItem } from '@/components/notifications/NotificationListItem';
import {
  AppButton,
  AppChip,
  AppEmptyState,
  AppHeader,
  AppSkeletonCard,
  AppText,
} from '@/components/ui';
import { useNotificationsInbox } from '@/contexts/NotificationsInboxContext';
import { trackCommunicationsEvent } from '@/services/communicationsAnalytics';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import type { InboxListFilter, NotificationCategory } from '@/types/notificationsInbox';
import { getApiErrorMessage } from '@/utils/errors';

type Props = {
  role: 'mensajero' | 'transportista';
};

const CATEGORY_FILTERS: Array<{ label: string; value: NotificationCategory | null }> = [
  { label: 'Todas', value: null },
  { label: 'Ofertas', value: 'dispatch' },
  { label: 'Servicios', value: 'service' },
  { label: 'Operación', value: 'operation' },
  { label: 'Alertas', value: 'alert' },
  { label: 'Recordatorios', value: 'reminder' },
  { label: 'Promociones', value: 'promotion' },
];

const LIST_FILTERS: Array<{ label: string; value: InboxListFilter }> = [
  { label: 'Activas', value: 'all' },
  { label: 'No leídas', value: 'unread' },
  { label: 'Leídas', value: 'read' },
  { label: 'Archivadas', value: 'archived' },
];

export function NotificationsInboxScreen({ role }: Props) {
  const insets = useSafeAreaInsets();
  const {
    filteredNotifications,
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
    refreshInbox,
    loadMore,
    markAllRead,
    clearArchivedLocally,
    loadInbox,
    handleNotificationPress,
  } = useNotificationsInbox();
  const [actionError, setActionError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingArchived, setClearingArchived] = useState(false);

  useEffect(() => {
    setInboxScreenVisible(true);
    trackCommunicationsEvent('notification_inbox_opened', { source: 'screen' });
    return () => setInboxScreenVisible(false);
  }, [setInboxScreenVisible]);

  useEffect(() => {
    // Soft-refresh al abrir / cambiar filtros (acción explícita; ignora TTL).
    void loadInbox({ silent: true });
  }, [listFilter, selectedCategory, loadInbox]);

  const onItemPress = useCallback(
    (notification: Parameters<typeof handleNotificationPress>[0]) => {
      void handleNotificationPress(notification);
    },
    [handleNotificationPress],
  );

  const preferencesHref =
    role === 'transportista'
      ? ('/transportista/(tabs)/cuenta' as Href)
      : ('/mensajero/(tabs)/cuenta' as Href);

  const onMarkAll = useCallback(async () => {
    setActionError(null);
    setMarkingAll(true);
    try {
      await markAllRead();
    } catch (e) {
      setActionError(getApiErrorMessage(e, 'No se pudieron marcar como leídas'));
    } finally {
      setMarkingAll(false);
    }
  }, [markAllRead]);

  const onClearArchivedLocally = useCallback(async () => {
    setActionError(null);
    setClearingArchived(true);
    try {
      // Solo oculta archivadas en vista/cache local; pueden reaparecer al sincronizar.
      await clearArchivedLocally();
      setListFilter('all');
    } catch (e) {
      setActionError(getApiErrorMessage(e, 'No se pudo limpiar la vista'));
    } finally {
      setClearingArchived(false);
    }
  }, [clearArchivedLocally, setListFilter]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader
          title="Notificaciones"
          subtitle={
            unreadCount > 0
              ? `${unreadCount} sin leer`
              : 'Centro de comunicación Rutafy'
          }
          right={
            <View style={styles.headerActions}>
              <AppButton
                label="Volver"
                variant="ghost"
                onPress={() => router.back()}
              />
              <AppButton
                label="Marcar todas"
                variant="ghost"
                loading={markingAll}
                disabled={unreadCount === 0 || markingAll}
                onPress={() => void onMarkAll()}
                style={styles.markAllBtn}
              />
            </View>
          }
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}>
          {LIST_FILTERS.map((filter) => (
            <AppChip
              key={filter.value}
              label={filter.label}
              selected={listFilter === filter.value}
              onPress={() => setListFilter(filter.value)}
            />
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}>
          {CATEGORY_FILTERS.map((filter) => (
            <AppChip
              key={filter.label}
              label={filter.label}
              selected={selectedCategory === filter.value}
              onPress={() => setSelectedCategory(filter.value)}
            />
          ))}
        </ScrollView>

        <View style={styles.quickActions}>
          <Pressable onPress={() => router.push(preferencesHref)}>
            <AppText variant="caption" color={colors.primaryDark}>
              Preferencias
            </AppText>
          </Pressable>
          {listFilter === 'archived' ? (
            <Pressable
              disabled={clearingArchived}
              onPress={() => void onClearArchivedLocally()}>
              <AppText variant="caption" color={colors.danger}>
                {clearingArchived ? 'Limpiando…' : 'Limpiar vista'}
              </AppText>
            </Pressable>
          ) : (
            <Pressable onPress={() => setListFilter('archived')}>
              <AppText variant="caption" color={colors.subtitle}>
                Ver archivadas
              </AppText>
            </Pressable>
          )}
        </View>

        {error || actionError ? (
          <View style={styles.errorBlock}>
            <AppText variant="caption" color={colors.danger}>
              {actionError ?? error}
            </AppText>
            <AppButton
              label="Reintentar"
              variant="secondary"
              onPress={() => void loadInbox()}
            />
          </View>
        ) : null}

        <FlatList
          style={styles.listFlex}
          data={filteredNotifications}
          keyExtractor={(item) => item.notification_id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refreshInbox()}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg },
          ]}
          onEndReached={() => {
            if (nextCursor) void loadMore();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.skeletonList}>
                <AppSkeletonCard />
                <AppSkeletonCard />
                <AppSkeletonCard />
              </View>
            ) : (
              <AppEmptyState
                icon="notifications"
                title="No tienes notificaciones todavía"
                description="Aquí verás ofertas, servicios, alertas y recordatorios de Rutafy."
                actionLabel="Actualizar"
                onAction={() => void refreshInbox()}
                loading={refreshing}
              />
            )
          }
          renderItem={({ item }) => (
            <NotificationListItem
              notification={item}
              onPress={onItemPress}
            />
          )}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  markAllBtn: { minWidth: 110 },
  headerActions: { alignItems: 'flex-end', gap: spacing.xs },
  filtersRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingRight: spacing.base,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  errorBlock: { gap: spacing.sm, marginBottom: spacing.sm },
  listFlex: { flex: 1 },
  list: { gap: spacing.md, flexGrow: 1 },
  skeletonList: { gap: spacing.md, paddingTop: spacing.sm },
  footerLoader: { marginVertical: spacing.base },
});
