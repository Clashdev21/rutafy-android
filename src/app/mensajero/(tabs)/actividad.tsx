import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServiceListItem } from '@/components/services/ServiceListItem';
import { getTabBarScrollPadding } from '@/constants/tabBarLayout';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';
import { Spacing } from '@/constants/theme';

export default function MensajeroActividadScreen() {
  const { myServices, loadingMy, loadingOffers, availabilitySyncing, refreshAll } =
    useMensajeroOperationsContext();

  const busy = loadingMy || loadingOffers || availabilitySyncing;
  const insets = useSafeAreaInsets();
  const listBottom = getTabBarScrollPadding(insets.bottom);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Actividad</Text>
        <Text style={styles.subtitle}>Servicios asignados y en curso</Text>

        <FlatList
          style={styles.listFlex}
          data={myServices}
          keyExtractor={(item) => item.service_id}
          refreshControl={
            <RefreshControl refreshing={busy} onRefresh={() => void refreshAll(false)} />
          }
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          ListEmptyComponent={
            loadingMy ? (
              <ActivityIndicator color={RutafyColors.brand} style={styles.loader} />
            ) : (
              <Text style={styles.empty}>No tienes servicios asignados.</Text>
            )
          }
          ListFooterComponent={
            <Text style={styles.pollHint}>Actualización automática cada 15 s</Text>
          }
          renderItem={({ item }) => <ServiceListItem service={item} />}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
  safe: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  title: { fontSize: 28, fontWeight: '700', color: RutafyColors.textPrimary },
  subtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    marginBottom: Spacing.three,
  },
  listFlex: { flex: 1 },
  list: { gap: Spacing.two, flexGrow: 1 },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
    color: RutafyColors.textSecondary,
  },
  loader: { marginVertical: Spacing.four },
  pollHint: {
    textAlign: 'center',
    fontSize: 12,
    color: RutafyColors.textSecondary,
    marginTop: Spacing.three,
  },
});
