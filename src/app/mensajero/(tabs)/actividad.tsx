import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServiceListItem } from '@/components/services/ServiceListItem';
import { AppEmptyState, AppHeader, AppSkeletonCard } from '@/components/ui';
import { getTabBarScrollPadding } from '@/constants/tabBarLayout';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

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

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader title="Actividad" subtitle="Servicios asignados y en curso" />

        <FlatList
          style={styles.listFlex}
          data={myServices}
          keyExtractor={(item) => item.service_id}
          refreshControl={
            <RefreshControl
              refreshing={busy}
              onRefresh={() => void refreshMyServices(false)}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          ListEmptyComponent={
            loadingMy ? (
              <View style={styles.skeletonList}>
                <AppSkeletonCard />
                <AppSkeletonCard />
              </View>
            ) : (
              <AppEmptyState
                icon={uiState === 'OFFLINE' ? 'search' : 'inbox'}
                title={
                  uiState === 'OFFLINE'
                    ? 'Estás offline'
                    : 'Sin servicios en tu historial'
                }
                description={
                  uiState === 'OFFLINE'
                    ? 'Activa tu disponibilidad para recibir ofertas y ver tu actividad actualizada.'
                    : 'Cuando aceptes servicios aparecerán aquí con estado, ruta y acceso al detalle.'
                }
                actionLabel="Actualizar"
                onAction={() => void refreshMyServices(false)}
                loading={busy}
              />
            )
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
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  listFlex: { flex: 1 },
  list: { gap: spacing.md, flexGrow: 1 },
  skeletonList: { gap: spacing.md, paddingTop: spacing.sm },
});
