import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationListItem } from '@/components/notifications/NotificationListItem';
import {
  AppButton,
  AppHeader,
  AppIcon,
  AppSkeletonCard,
  AppText,
} from '@/components/ui';
import { useNotificationsInbox } from '@/contexts/NotificationsInboxContext';
import { trackCommunicationsEvent } from '@/services/communicationsAnalytics';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { InboxListFilter, NotificationCategory } from '@/types/notificationsInbox';
import { getApiErrorMessage } from '@/utils/errors';
import { getNotificationCategoryLabel } from '@/utils/notificationFormatters';

type Props = {
  role: 'mensajero' | 'transportista';
};

const PRIMARY_FILTERS: Array<{ label: string; value: InboxListFilter }> = [
  { label: 'Todas', value: 'all' },
  { label: 'No leídas', value: 'unread' },
];

const CATEGORY_FILTERS: Array<{ label: string; value: NotificationCategory }> = [
  { label: 'Ofertas', value: 'dispatch' },
  { label: 'Servicios', value: 'service' },
  { label: 'Operación', value: 'operation' },
  { label: 'Alertas', value: 'alert' },
  { label: 'Recordatorios', value: 'reminder' },
  { label: 'Promociones', value: 'promotion' },
];

/**
 * UX 3A.1 — Inbox compacto.
 *
 * Causa chips gigantes (UX 3A): ScrollView horizontal de categorías sin altura
 * acotada, en columna flex junto a FlatList flex:1 → en Android el ScrollView
 * crecía en vertical y los Pressable/AppChip se estiraban (align stretch).
 * Solución: quitar esa fila dominante; categorías en Modal; chips con altura fija.
 */
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    setInboxScreenVisible(true);
    trackCommunicationsEvent('notification_inbox_opened', { source: 'screen' });
    return () => setInboxScreenVisible(false);
  }, [setInboxScreenVisible]);

  useEffect(() => {
    void loadInbox({ silent: true });
  }, [listFilter, selectedCategory, loadInbox]);

  const onItemPress = useCallback(
    (notification: Parameters<typeof handleNotificationPress>[0]) => {
      setMenuOpen(false);
      setFilterOpen(false);
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
    setMenuOpen(false);
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
    setMenuOpen(false);
    try {
      await clearArchivedLocally();
      setListFilter('all');
    } catch (e) {
      setActionError(getApiErrorMessage(e, 'No se pudo limpiar la vista'));
    } finally {
      setClearingArchived(false);
    }
  }, [clearArchivedLocally, setListFilter]);

  const primarySelected =
    listFilter === 'unread' ? 'unread' : listFilter === 'all' ? 'all' : null;

  const categorySummary = useMemo(() => {
    if (selectedCategory == null) return null;
    return getNotificationCategoryLabel(selectedCategory);
  }, [selectedCategory]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader
          title="Notificaciones"
          subtitle={unreadCount > 0 ? `${unreadCount} sin leer` : undefined}
          right={
            <Pressable
              onPress={() => {
                setFilterOpen(false);
                setMenuOpen((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityLabel="Más acciones"
              hitSlop={8}
              style={styles.headerIconBtn}>
              <Text style={styles.menuGlyph}>⋮</Text>
            </Pressable>
          }
        />

        {menuOpen ? (
          <View style={styles.menu}>
            <Pressable
              style={styles.menuItem}
              disabled={unreadCount === 0 || markingAll}
              onPress={() => void onMarkAll()}>
              <AppText
                variant="bodyMedium"
                color={unreadCount === 0 ? colors.subtitle : colors.textPrimary}>
                {markingAll ? 'Marcando…' : 'Marcar todas como leídas'}
              </AppText>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                router.push(preferencesHref);
              }}>
              <AppText variant="bodyMedium">Preferencias</AppText>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                setListFilter('archived');
              }}>
              <AppText variant="bodyMedium">Ver archivadas</AppText>
            </Pressable>
            {listFilter === 'archived' ? (
              <Pressable
                style={styles.menuItem}
                disabled={clearingArchived}
                onPress={() => void onClearArchivedLocally()}>
                <AppText variant="bodyMedium" color={colors.danger}>
                  {clearingArchived ? 'Limpiando…' : 'Limpiar vista archivada'}
                </AppText>
              </Pressable>
            ) : null}
            {(listFilter === 'read' || listFilter === 'archived') && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setListFilter('all');
                }}>
                <AppText variant="bodyMedium" color={colors.primary}>
                  Volver a activas
                </AppText>
              </Pressable>
            )}
          </View>
        ) : null}

        <View style={styles.controlsRow}>
          <View style={styles.primaryFilters}>
            {PRIMARY_FILTERS.map((filter) => {
              const selected = primarySelected === filter.value;
              return (
                <Pressable
                  key={filter.value}
                  onPress={() => {
                    setMenuOpen(false);
                    setListFilter(filter.value);
                  }}
                  style={[styles.primaryChip, selected && styles.primaryChipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}>
                  <Text
                    style={[styles.primaryChipText, selected && styles.primaryChipTextSelected]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
            {listFilter === 'archived' || listFilter === 'read' ? (
              <View style={[styles.primaryChip, styles.primaryChipSelected]}>
                <Text style={[styles.primaryChipText, styles.primaryChipTextSelected]}>
                  {listFilter === 'archived' ? 'Archivadas' : 'Leídas'}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={() => {
              setMenuOpen(false);
              setFilterOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={
              categorySummary
                ? `Filtrar por categoría. Actual: ${categorySummary}`
                : 'Filtrar por categoría'
            }
            hitSlop={6}
            style={[styles.filterBtn, selectedCategory != null && styles.filterBtnActive]}>
            <AppIcon
              name="search"
              size={16}
              color={selectedCategory != null ? colors.primaryDark : colors.subtitle}
            />
            <Text
              style={[
                styles.filterBtnText,
                selectedCategory != null && styles.filterBtnTextActive,
              ]}
              numberOfLines={1}>
              {categorySummary ?? 'Filtrar'}
            </Text>
          </Pressable>
        </View>

        {error || actionError ? (
          <View style={styles.errorBlock}>
            <AppText variant="caption" color={colors.danger}>
              {actionError ?? error}
            </AppText>
            <AppButton
              label="Reintentar"
              variant="secondary"
              fullWidth={false}
              onPress={() => void loadInbox()}
              style={styles.retryBtn}
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
            filteredNotifications.length === 0 && styles.listEmptyGrow,
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
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <AppIcon name="notifications" size={28} color={colors.primary} />
                </View>
                <AppText variant="heading" style={styles.emptyTitle}>
                  No tienes notificaciones
                </AppText>
                <AppText variant="caption" color={colors.subtitle} style={styles.emptyDesc}>
                  Aquí aparecerán tus ofertas, servicios y novedades operativas.
                </AppText>
                <AppButton
                  label="Actualizar"
                  variant="secondary"
                  fullWidth={false}
                  loading={refreshing}
                  onPress={() => void refreshInbox()}
                  style={styles.emptyAction}
                />
              </View>
            )
          }
          renderItem={({ item }) => (
            <NotificationListItem notification={item} onPress={onItemPress} />
          )}
        />
      </SafeAreaView>

      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <AppText variant="heading" style={styles.modalTitle}>
              Filtrar por categoría
            </AppText>
            <Pressable
              style={[
                styles.categoryOption,
                selectedCategory == null && styles.categoryOptionSelected,
              ]}
              onPress={() => {
                setSelectedCategory(null);
                setFilterOpen(false);
              }}>
              <AppText
                variant="bodyMedium"
                color={selectedCategory == null ? colors.primaryDark : colors.textPrimary}>
                Todas las categorías
              </AppText>
            </Pressable>
            {CATEGORY_FILTERS.map((filter) => {
              const selected = selectedCategory === filter.value;
              return (
                <Pressable
                  key={filter.value}
                  style={[styles.categoryOption, selected && styles.categoryOptionSelected]}
                  onPress={() => {
                    setSelectedCategory(filter.value);
                    setFilterOpen(false);
                  }}>
                  <AppText
                    variant="bodyMedium"
                    color={selected ? colors.primaryDark : colors.textPrimary}>
                    {filter.label}
                  </AppText>
                </Pressable>
              );
            })}
            <Pressable
              style={styles.modalClose}
              onPress={() => setFilterOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar filtro">
              <AppText variant="bodyMedium" color={colors.subtitle}>
                Cerrar
              </AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CHIP_HEIGHT = 36;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  headerIconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGlyph: {
    fontSize: 22,
    color: colors.navy,
    fontFamily: fontFamily.bold,
  },
  menu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  menuItem: {
    minHeight: 48,
    paddingHorizontal: spacing.base,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexShrink: 0,
  },
  primaryFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  primaryChip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.base,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  primaryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  primaryChipText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  primaryChipTextSelected: {
    color: colors.white,
    fontFamily: fontFamily.semiBold,
  },
  filterBtn: {
    height: CHIP_HEIGHT,
    minWidth: 44,
    maxWidth: 140,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  filterBtnActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(22,163,74,0.1)',
  },
  filterBtnText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    color: colors.subtitle,
    flexShrink: 1,
  },
  filterBtnTextActive: {
    color: colors.primaryDark,
    fontFamily: fontFamily.semiBold,
  },
  errorBlock: { gap: spacing.sm, marginBottom: spacing.sm, flexShrink: 0 },
  retryBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: spacing.base,
  },
  listFlex: { flex: 1 },
  list: { gap: spacing.md },
  listEmptyGrow: { flexGrow: 1, justifyContent: 'center' },
  skeletonList: { gap: spacing.md, paddingTop: spacing.sm },
  footerLoader: { marginVertical: spacing.base },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(22,163,74,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { textAlign: 'center' },
  emptyDesc: { textAlign: 'center', lineHeight: 18, maxWidth: 280 },
  emptyAction: {
    marginTop: spacing.sm,
    minWidth: 140,
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.xs,
  },
  modalTitle: { marginBottom: spacing.sm },
  categoryOption: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.input,
  },
  categoryOptionSelected: {
    backgroundColor: 'rgba(22,163,74,0.1)',
  },
  modalClose: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
});
