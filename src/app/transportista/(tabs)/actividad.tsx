import { type Href, router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ServiceListItem } from '@/components/services/ServiceListItem';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AppEmptyState, AppHeader, AppSkeletonCard, AppText } from '@/components/ui';
import { getTabBarScrollPadding } from '@/constants/tabBarLayout';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function TransportistaActividadScreen() {
  const { services, isLoading, error, refresh } = useTransportistaServicesContext();
  const insets = useSafeAreaInsets();
  const listBottom = getTabBarScrollPadding(insets.bottom);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader
          title="Actividad"
          subtitle="Historial y servicios recientes"
          right={<NotificationBell />}
        />
        {error ? (
          <AppText variant="caption" color={colors.danger} style={styles.error}>
            {error}
          </AppText>
        ) : null}

        <FlatList
          style={styles.listFlex}
          data={services}
          keyExtractor={(item) => item.service_id}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => void refresh(false)}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.skeletonList}>
                <AppSkeletonCard />
                <AppSkeletonCard />
              </View>
            ) : (
              <AppEmptyState
                icon="local_shipping"
                title="Sin servicios todavía"
                description="Cuando crees o gestiones servicios aparecerán aquí con estado y acceso al detalle."
                actionLabel="Actualizar"
                onAction={() => void refresh(false)}
                loading={isLoading}
              />
            )
          }
          renderItem={({ item }) => (
            <ServiceListItem
              service={item}
              onPress={() => router.push(`/transportista/${item.service_id}` as Href)}
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
  error: { marginBottom: spacing.sm },
  listFlex: { flex: 1 },
  list: { gap: spacing.md, flexGrow: 1 },
  skeletonList: { gap: spacing.md },
});
