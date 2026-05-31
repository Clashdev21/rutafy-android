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
import { MensajeroAvailableScreen } from '@/components/mensajero/MensajeroAvailableScreen';
import { MensajeroOfflineScreen } from '@/components/mensajero/MensajeroOfflineScreen';
import { MensajeroOfferScreen } from '@/components/mensajero/MensajeroOfferScreen';
import { ServiceListItem } from '@/components/services/ServiceListItem';
import { ServiceStatusBadge } from '@/components/services/ServiceStatusBadge';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { useMensajeroOperations } from '@/hooks/useMensajeroOperations';
import { getStatusLabel } from '@/utils/serviceStatus';

export default function MensajeroHomeScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const actorId = user?.actor_id?.trim() ?? null;

  const {
    myServices,
    firstOffer,
    activeService,
    uiState,
    loadingMy,
    loadingOffers,
    claimingServiceId,
    availabilitySyncing,
    error,
    canOperate,
    toggleAvailability,
    acceptOffer,
    omitFirstOffer,
    refreshAll,
  } = useMensajeroOperations(actorId);

  const busy = loadingMy || loadingOffers || availabilitySyncing;
  const controlsDisabled = !canOperate || availabilitySyncing;

  if (uiState === 'OFFLINE') {
    return (
      <>
        {!canOperate ? <SessionBanner message="La sesión no tiene actor_id válido para operar." /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        <MensajeroOfflineScreen
          onToggleOnline={() => void toggleAvailability()}
          loading={availabilitySyncing}
          disabled={controlsDisabled}
        />
      </>
    );
  }

  if (uiState === 'AVAILABLE') {
    return (
      <>
        {!canOperate ? <SessionBanner message="La sesión no tiene actor_id válido para operar." /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        <MensajeroAvailableScreen
          onToggleOffline={() => void toggleAvailability()}
          onLogout={() => void logout()}
          loading={availabilitySyncing}
          disabled={controlsDisabled}
        />
      </>
    );
  }

  if (uiState === 'OFFER' && firstOffer) {
    return (
      <>
        {error ? <ErrorBanner message={error} /> : null}
        <MensajeroOfferScreen
          offer={firstOffer}
          onAccept={() => void acceptOffer(firstOffer.service_id)}
          onOmit={omitFirstOffer}
          isAccepting={claimingServiceId === firstOffer.service_id}
          disabled={!canOperate}
        />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>Mensajero</Text>
          <Text style={styles.subtitle}>{user?.name ?? user?.phone ?? 'Sesión activa'}</Text>
        </View>

        {!canOperate ? (
          <Text style={styles.warn}>La sesión no tiene actor_id (UUID) válido para operar.</Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {activeService ? (
          <RutafyCard style={styles.activeCard}>
            <Text style={styles.sectionTitle}>Servicio activo</Text>
            <View style={styles.activeHeader}>
              <Text style={styles.code}>{activeService.service_code}</Text>
              <ServiceStatusBadge status={activeService.status} />
            </View>
            <Text style={styles.meta}>
              {getStatusLabel(activeService.status)} · {activeService.origin}
            </Text>
            <Text style={styles.meta}>→ {activeService.destination}</Text>
          </RutafyCard>
        ) : null}

        <Text style={styles.listTitle}>Mis servicios ({myServices.length})</Text>

        <FlatList
          data={myServices}
          keyExtractor={(item) => item.service_id}
          refreshControl={
            <RefreshControl refreshing={busy} onRefresh={() => void refreshAll(false)} />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loadingMy ? (
              <ActivityIndicator style={styles.loader} color={RutafyColors.brand} />
            ) : (
              <Text style={styles.empty}>No tienes servicios asignados.</Text>
            )
          }
          renderItem={({ item }) => <ServiceListItem service={item} />}
        />

        <Pressable
          style={[styles.logoutBtn, authLoading && styles.disabled]}
          onPress={() => void logout()}
          disabled={authLoading}>
          <Text style={styles.logoutLabel}>Cerrar sesión</Text>
        </Pressable>

        <Text style={styles.pollHint}>Actualización automática cada 15 s</Text>
      </SafeAreaView>
    </View>
  );
}

function SessionBanner({ message }: { message: string }) {
  return (
    <View style={bannerStyles.wrap}>
      <Text style={bannerStyles.text}>{message}</Text>
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={[bannerStyles.wrap, bannerStyles.error]}>
      <Text style={bannerStyles.text}>{message}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  error: { backgroundColor: '#FEE2E2' },
  text: { fontSize: 13, color: RutafyColors.textPrimary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  header: { gap: Spacing.one, marginBottom: Spacing.three, paddingTop: Spacing.two },
  title: { fontSize: 28, fontWeight: '700', color: RutafyColors.textPrimary },
  subtitle: { fontSize: 14, color: RutafyColors.textSecondary },
  warn: { marginBottom: Spacing.two, color: RutafyColors.textSecondary, fontSize: 14 },
  errorText: { marginBottom: Spacing.two, color: RutafyColors.danger, fontSize: 14 },
  activeCard: { marginBottom: Spacing.three, gap: Spacing.two },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: RutafyColors.textPrimary },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  code: { fontSize: 14, fontWeight: '600', color: RutafyColors.textPrimary },
  meta: { fontSize: 13, color: RutafyColors.textSecondary },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
    marginBottom: Spacing.two,
  },
  listContent: { gap: Spacing.two, paddingBottom: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.four, color: RutafyColors.textSecondary },
  loader: { marginVertical: Spacing.four },
  logoutBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  logoutLabel: { fontWeight: '600', color: RutafyColors.textPrimary },
  disabled: { opacity: 0.6 },
  pollHint: {
    textAlign: 'center',
    marginVertical: Spacing.two,
    fontSize: 12,
    color: RutafyColors.textSecondary,
  },
});
