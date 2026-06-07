import { type Href, router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackingSessionListItem } from '@/components/tracking/TrackingSessionListItem';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
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
          { paddingBottom: Math.max(insets.bottom, Spacing.four) + Spacing.four },
        ]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Historial de capturas</Text>
            <Text style={styles.subtitle}>
              Sesiones de captura logística registradas en tu cuenta.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={RutafyColors.brand} style={styles.loader} />
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>No hay sesiones de captura todavía.</Text>
              <RutafyButton
                label="Ir a captura logística"
                onPress={() => router.push('/captura-logistica' as Href)}
              />
            </View>
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
    backgroundColor: RutafyColors.surfaceMuted,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: RutafyColors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
  },
  error: {
    fontSize: 13,
    color: RutafyColors.danger,
    marginTop: Spacing.one,
  },
  list: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    flexGrow: 1,
  },
  loader: { marginVertical: Spacing.four },
  emptyWrap: {
    gap: Spacing.three,
    paddingVertical: Spacing.four,
    alignItems: 'stretch',
  },
  empty: {
    textAlign: 'center',
    fontSize: 14,
    color: RutafyColors.textSecondary,
  },
});
