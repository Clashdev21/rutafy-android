import { type Href, router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { ServiceListItem } from '@/components/services/ServiceListItem';
import { ServiceStatusBadge } from '@/components/services/ServiceStatusBadge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';

export default function TransportistaHomeScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { services, activeService, isLoading, error, refresh } =
    useTransportistaServicesContext();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="title">Transportista</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {user?.name ?? user?.phone ?? 'Sesión activa'}
          </ThemedText>
        </View>

        {error ? (
          <ThemedText style={styles.error} themeColor="textSecondary">
            {error}
          </ThemedText>
        ) : null}

        {activeService ? (
          <View style={styles.activeCard}>
            <ThemedText type="smallBold">Servicio activo</ThemedText>
            <ServiceListItem
              service={activeService}
              onPress={() =>
                router.push(`/transportista/${activeService.service_id}` as Href)
              }
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push('/transportista/crear' as Href)}>
            <ThemedText style={styles.primaryBtnLabel}>Nuevo servicio</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, authLoading && styles.disabled]}
            onPress={() => void logout()}
            disabled={authLoading}>
            <ThemedText style={styles.secondaryBtnLabel}>Cerrar sesión</ThemedText>
          </Pressable>
        </View>

        <ThemedText type="subtitle" style={styles.listTitle}>
          Mis servicios ({services.length})
        </ThemedText>

        {isLoading && services.length === 0 ? (
          <ActivityIndicator style={styles.loader} />
        ) : (
          <FlatList
            data={services}
            keyExtractor={(item) => item.service_id}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={() => void refresh(false)} />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                No hay servicios todavía.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ServiceListItem
                service={item}
                onPress={() => router.push(`/transportista/${item.service_id}` as Href)}
              />
            )}
          />
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.pollHint}>
          Actualización automática cada 5 s
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: { gap: Spacing.one, marginBottom: Spacing.three },
  error: { marginBottom: Spacing.two },
  activeCard: { gap: Spacing.two, marginBottom: Spacing.three },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  primaryBtn: {
    backgroundColor: '#2A9D8F',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  primaryBtnLabel: { color: '#fff', fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  secondaryBtnLabel: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  listTitle: { marginBottom: Spacing.two },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.six },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
  loader: { marginTop: Spacing.four },
  pollHint: { textAlign: 'center', marginTop: Spacing.two, marginBottom: Spacing.two },
});
