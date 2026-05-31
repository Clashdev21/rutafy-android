import { type Href, router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ServiceListItem } from '@/components/services/ServiceListItem';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';

export default function TransportistaActividadScreen() {
  const { services, isLoading, error, refresh } = useTransportistaServicesContext();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Actividad</Text>
        <Text style={styles.subtitle}>Historial y servicios recientes</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isLoading && services.length === 0 ? (
          <ActivityIndicator style={styles.loader} color={RutafyColors.brand} />
        ) : (
          <FlatList
            data={services}
            keyExtractor={(item) => item.service_id}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={() => void refresh(false)} />
            }
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>No hay servicios todavía.</Text>
            }
            renderItem={({ item }) => (
              <ServiceListItem
                service={item}
                onPress={() => router.push(`/transportista/${item.service_id}` as Href)}
              />
            )}
          />
        )}
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
  error: { color: RutafyColors.danger, marginBottom: Spacing.two },
  list: { gap: Spacing.two, paddingBottom: Spacing.six },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
    color: RutafyColors.textSecondary,
  },
  loader: { marginTop: Spacing.four },
});
