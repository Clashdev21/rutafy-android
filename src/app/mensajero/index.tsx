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
import { Spacing } from '@/constants/theme';
import { useMensajeroOperations } from '@/hooks/useMensajeroOperations';
import { getStatusLabel } from '@/utils/serviceStatus';

const UI_STATE_LABELS = {
  OFFLINE: 'Desconectado',
  AVAILABLE: 'Disponible',
  OFFER: 'Oferta pendiente',
  ASSIGNED: 'Asignado',
  IN_SERVICE: 'En servicio',
} as const;

export default function MensajeroHomeScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const actorId = user?.actor_id?.trim() ?? null;

  const {
    isOnline,
    availabilitySyncing,
    myServices,
    availableServices,
    firstOffer,
    activeService,
    uiState,
    loadingMy,
    loadingOffers,
    claimingServiceId,
    error,
    canOperate,
    toggleAvailability,
    acceptOffer,
    omitFirstOffer,
    refreshAll,
  } = useMensajeroOperations(actorId);

  const busy = loadingMy || loadingOffers || availabilitySyncing;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="title">Mensajero</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {user?.name ?? user?.phone ?? 'Sesión activa'}
          </ThemedText>
          <ThemedText type="smallBold">
            Estado: {UI_STATE_LABELS[uiState]}
          </ThemedText>
        </View>

        {!canOperate ? (
          <ThemedText themeColor="textSecondary" style={styles.warn}>
            La sesión no tiene actor_id (UUID) válido para operar.
          </ThemedText>
        ) : null}

        {error ? (
          <ThemedText themeColor="textSecondary" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <Pressable
          style={[styles.availabilityBtn, isOnline && styles.availabilityOn]}
          onPress={() => void toggleAvailability()}
          disabled={!canOperate || availabilitySyncing}>
          {availabilitySyncing ? (
            <ActivityIndicator color={isOnline ? '#fff' : '#0F172A'} />
          ) : (
            <ThemedText style={[styles.availabilityLabel, isOnline && styles.availabilityLabelOn]}>
              {isOnline ? 'En línea — recibiendo ofertas' : 'Desconectado'}
            </ThemedText>
          )}
        </Pressable>

        {activeService ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Servicio activo</ThemedText>
            <View style={styles.activeCard}>
              <View style={styles.activeHeader}>
                <ThemedText type="smallBold">{activeService.service_code}</ThemedText>
                <ServiceStatusBadge status={activeService.status} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {getStatusLabel(activeService.status)} · {activeService.origin}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                → {activeService.destination}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {isOnline && firstOffer ? (
          <View style={styles.section}>
            <ThemedText type="subtitle">Oferta activa</ThemedText>
            <ServiceListItem service={firstOffer} />
            <View style={styles.offerActions}>
              <Pressable
                style={[styles.acceptBtn, claimingServiceId && styles.disabled]}
                onPress={() => void acceptOffer(firstOffer.service_id)}
                disabled={Boolean(claimingServiceId)}>
                {claimingServiceId === firstOffer.service_id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.acceptLabel}>Aceptar</ThemedText>
                )}
              </Pressable>
              <Pressable style={styles.omitBtn} onPress={omitFirstOffer}>
                <ThemedText style={styles.omitLabel}>Omitir</ThemedText>
              </Pressable>
            </View>
            {availableServices.length > 1 ? (
              <ThemedText type="small" themeColor="textSecondary">
                +{availableServices.length - 1} oferta(s) más en cola
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {isOnline && !firstOffer && !loadingOffers ? (
          <ThemedText themeColor="textSecondary" style={styles.hint}>
            Sin ofertas activas por ahora.
          </ThemedText>
        ) : null}

        <ThemedText type="subtitle" style={styles.listTitle}>
          Mis servicios ({myServices.length})
        </ThemedText>

        <FlatList
          data={myServices}
          keyExtractor={(item) => item.service_id}
          refreshControl={
            <RefreshControl refreshing={busy} onRefresh={() => void refreshAll(false)} />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loadingMy ? (
              <ActivityIndicator style={styles.loader} />
            ) : (
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                No tienes servicios asignados.
              </ThemedText>
            )
          }
          renderItem={({ item }) => <ServiceListItem service={item} />}
        />

        <Pressable
          style={[styles.logoutBtn, authLoading && styles.disabled]}
          onPress={() => void logout()}
          disabled={authLoading}>
          <ThemedText style={styles.logoutLabel}>Cerrar sesión</ThemedText>
        </Pressable>

        <ThemedText type="small" themeColor="textSecondary" style={styles.pollHint}>
          Actualización automática cada 15 s
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: { gap: Spacing.one, marginBottom: Spacing.three },
  warn: { marginBottom: Spacing.two },
  error: { marginBottom: Spacing.two },
  availabilityBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  availabilityOn: { backgroundColor: '#2A9D8F', borderColor: '#2A9D8F' },
  availabilityLabel: { fontWeight: '600' },
  availabilityLabelOn: { color: '#fff' },
  section: { gap: Spacing.two, marginBottom: Spacing.three },
  activeCard: {
    borderWidth: 1,
    borderColor: '#2A9D8F',
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
    backgroundColor: '#F0FDFA',
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  offerActions: { flexDirection: 'row', gap: Spacing.two },
  acceptBtn: {
    flex: 1,
    backgroundColor: '#2A9D8F',
    borderRadius: 12,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  acceptLabel: { color: '#fff', fontWeight: '600' },
  omitBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    justifyContent: 'center',
  },
  omitLabel: { fontWeight: '600' },
  hint: { marginBottom: Spacing.three, textAlign: 'center' },
  listTitle: { marginBottom: Spacing.two },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
  loader: { marginVertical: Spacing.four },
  logoutBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  logoutLabel: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  pollHint: { textAlign: 'center', marginVertical: Spacing.two },
});
