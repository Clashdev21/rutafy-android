import { type Href, router } from 'expo-router';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackingSessionListItem } from '@/components/tracking/TrackingSessionListItem';
import { AppButton, AppEmptyState, AppHeader, AppSkeletonCard, AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { useMyTrackingSessions } from '@/hooks/useMyTrackingSessions';

export default function CapturaLogisticaHistorialScreen() {
  const insets = useSafeAreaInsets();
  const { sessions, loading, error, refresh } = useMyTrackingSessions();

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, spacing.base) + spacing.base },
        ]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <AppHeader
              title="Historial de capturas"
              subtitle="Sesiones de captura logística registradas en tu cuenta."
            />
            {error ? (
              <AppText variant="caption" color={colors.danger}>
                {error}
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletonList}>
              <AppSkeletonCard />
              <AppSkeletonCard />
            </View>
          ) : (
            <AppEmptyState
              icon="map"
              title="Sin capturas registradas"
              description="Inicia una sesión de captura logística para ver el historial y el detalle de cada recorrido."
              actionLabel="Ir a captura logística"
              onAction={() => router.push('/captura-logistica' as Href)}
            />
          )
        }
        renderItem={({ item }) => (
          <TrackingSessionListItem
            session={item}
            onPress={() =>
              router.push(`/captura-logistica/${encodeURIComponent(item.id)}` as Href)
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  list: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    flexGrow: 1,
  },
  skeletonList: { gap: spacing.md, paddingVertical: spacing.base },
});
