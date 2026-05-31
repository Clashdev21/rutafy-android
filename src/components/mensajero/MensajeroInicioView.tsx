import { StyleSheet, Text, View } from 'react-native';

import { MensajeroAssignedScreen } from '@/components/mensajero/MensajeroAssignedScreen';
import { MensajeroAvailableScreen } from '@/components/mensajero/MensajeroAvailableScreen';
import { MensajeroInServiceScreen } from '@/components/mensajero/MensajeroInServiceScreen';
import { MensajeroOfflineScreen } from '@/components/mensajero/MensajeroOfflineScreen';
import { MensajeroOfferScreen } from '@/components/mensajero/MensajeroOfferScreen';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

export function MensajeroInicioView() {
  const {
    firstOffer,
    activeService,
    uiState,
    claimingServiceId,
    availabilitySyncing,
    error,
    canOperate,
    toggleAvailability,
    acceptOffer,
    omitFirstOffer,
  } = useMensajeroOperationsContext();

  const controlsDisabled = !canOperate || availabilitySyncing;

  return (
    <View style={styles.wrap}>
      {!canOperate ? <Banner message="La sesión no tiene actor_id válido para operar." /> : null}
      {error ? <Banner message={error} variant="error" /> : null}

      {uiState === 'OFFLINE' ? (
        <MensajeroOfflineScreen
          onToggleOnline={() => void toggleAvailability()}
          loading={availabilitySyncing}
          disabled={controlsDisabled}
        />
      ) : null}

      {uiState === 'AVAILABLE' ? (
        <MensajeroAvailableScreen
          onToggleOffline={() => void toggleAvailability()}
          loading={availabilitySyncing}
          disabled={controlsDisabled}
        />
      ) : null}

      {uiState === 'OFFER' && firstOffer ? (
        <MensajeroOfferScreen
          offer={firstOffer}
          onAccept={() => void acceptOffer(firstOffer.service_id)}
          onOmit={omitFirstOffer}
          isAccepting={claimingServiceId === firstOffer.service_id}
          disabled={!canOperate}
        />
      ) : null}

      {uiState === 'ASSIGNED' && activeService ? (
        <MensajeroAssignedScreen service={activeService} disabled={!canOperate} />
      ) : null}

      {uiState === 'IN_SERVICE' && activeService ? (
        <MensajeroInServiceScreen service={activeService} disabled={!canOperate} />
      ) : null}
    </View>
  );
}

function Banner({ message, variant = 'warn' }: { message: string; variant?: 'warn' | 'error' }) {
  return (
    <View style={[bannerStyles.wrap, variant === 'error' && bannerStyles.error]}>
      <Text style={bannerStyles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
});

const bannerStyles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  error: { backgroundColor: '#FEE2E2' },
  text: { fontSize: 13, color: RutafyColors.textPrimary },
});
