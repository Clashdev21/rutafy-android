import { type Href, router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { ServiceListItem } from '@/components/services/ServiceListItem';
import { TransportistaPhaseHero } from '@/components/transportista/TransportistaPhaseHero';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';

export default function TransportistaHomeScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { services, activeService, isLoading, error, refresh } =
    useTransportistaServicesContext();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>Transportista</Text>
          <Text style={styles.subtitle}>{user?.name ?? user?.phone ?? 'Sesión activa'}</Text>
        </View>

        <TransportistaPhaseHero activeService={activeService} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <RutafyButton
            label="Nuevo servicio"
            onPress={() => router.push('/transportista/crear' as Href)}
          />
          <RutafyButton
            label="Cerrar sesión"
            variant="secondary"
            onPress={() => void logout()}
            disabled={authLoading}
          />
        </View>

        {activeService ? (
          <Pressable
            style={styles.activeLink}
            onPress={() =>
              router.push(`/transportista/${activeService.service_id}` as Href)
            }>
            <Text style={styles.activeLinkText}>Ver detalle del servicio activo</Text>
          </Pressable>
        ) : null}

        <Text style={styles.listTitle}>Mis servicios ({services.length})</Text>

        {isLoading && services.length === 0 ? (
          <ActivityIndicator style={styles.loader} color={RutafyColors.brand} />
        ) : (
          <FlatList
            data={services}
            keyExtractor={(item) => item.service_id}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={() => void refresh(false)} />
            }
            contentContainerStyle={styles.listContent}
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

        <Text style={styles.pollHint}>Actualización automática cada 5 s</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: { gap: Spacing.one, marginBottom: Spacing.three, paddingTop: Spacing.two },
  title: { fontSize: 28, fontWeight: '700', color: RutafyColors.textPrimary },
  subtitle: { fontSize: 14, color: RutafyColors.textSecondary },
  error: { marginTop: Spacing.two, color: RutafyColors.danger, fontSize: 14 },
  actions: { gap: Spacing.two, marginTop: Spacing.three, marginBottom: Spacing.two },
  activeLink: { marginBottom: Spacing.three },
  activeLinkText: {
    color: RutafyColors.brand,
    fontSize: 14,
    fontWeight: '600',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
    marginBottom: Spacing.two,
  },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.six },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
    color: RutafyColors.textSecondary,
  },
  loader: { marginTop: Spacing.four },
  pollHint: {
    textAlign: 'center',
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
    fontSize: 12,
    color: RutafyColors.textSecondary,
  },
});
