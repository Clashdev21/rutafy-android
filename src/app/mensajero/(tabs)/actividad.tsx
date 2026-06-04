import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
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
  const {
    myServices,
    uiState,
    loadingMy,
    availabilitySyncing,
    refreshMyServices,
  } = useMensajeroOperationsContext();

  const busy = loadingMy || availabilitySyncing;

  useFocusEffect(
    useCallback(() => {
      void refreshMyServices(true);
    }, [refreshMyServices]),
  );

  const insets = useSafeAreaInsets();
  const listBottom = getTabBarScrollPadding(insets.bottom);

  const emptyMessage =
    uiState === 'OFFLINE'
      ? 'Estás offline. Desliza hacia abajo para actualizar tu historial.'
      : 'No hay servicios cargados. Desliza para actualizar tu historial.';

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
            <RefreshControl
              refreshing={busy}
              onRefresh={() => void refreshMyServices(false)}
            />
          }
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          ListEmptyComponent={
            loadingMy ? (
              <ActivityIndicator color={RutafyColors.brand} style={styles.loader} />
            ) : (
              <Text style={styles.empty}>{emptyMessage}</Text>
            )
          }
          ListFooterComponent={
            <Text style={styles.pollHint}>Actualización automática según estado operacional</Text>
          }
          renderItem={({ item }) => (
            <ServiceListItem
              service={item}
              onPress={() => router.push(`/mensajero/${item.service_id}` as Href)}
            />
          )}
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
