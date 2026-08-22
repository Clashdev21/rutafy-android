import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { MensajeroAssignedScreen } from '@/components/mensajero/MensajeroAssignedScreen';
import { MensajeroAvailableScreen } from '@/components/mensajero/MensajeroAvailableScreen';
import { MensajeroInServiceScreen } from '@/components/mensajero/MensajeroInServiceScreen';
import { MensajeroOfflineScreen } from '@/components/mensajero/MensajeroOfflineScreen';
import { MensajeroOfferScreen } from '@/components/mensajero/MensajeroOfferScreen';
import {
  MensajeroOperationalMap,
  type MensajeroOperationalMapHandle,
} from '@/components/mensajero/MensajeroOperationalMap';
import {
  serviceDestinationCoordinate,
  serviceOriginCoordinate,
} from '@/components/mensajero/serviceMapCoords';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { shadowStyles } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { OperationalMapMode } from '@/types/map';

export function MensajeroInicioView() {
  const { user } = useAuth();
  const actorId = user?.actor_id?.trim() ?? '';
  const mapRef = useRef<MensajeroOperationalMapHandle>(null);

  const {
    firstOffer,
    activeService,
    uiState,
    claimingServiceId,
    availabilitySyncing,
    error,
    pushOfferNotice,
    canOperate,
    gpsStatus,
    hasLocationFix,
    lastKnownPosition,
    toggleAvailability,
    acceptOffer,
    omitFirstOffer,
    handleCloseSuccess,
    refreshAll,
  } = useMensajeroOperationsContext();

  const controlsDisabled = !canOperate || availabilitySyncing;
  const locationLabel =
    gpsStatus === 'active' && hasLocationFix
      ? 'Ubicación activa'
      : gpsStatus === 'permission-pending'
        ? 'Permiso de ubicación pendiente'
        : 'Ubicación no disponible';
  const locationActive = gpsStatus === 'active' && hasLocationFix;

  const mapMode: OperationalMapMode = useMemo(() => {
    switch (uiState) {
      case 'OFFLINE':
        return 'offline';
      case 'AVAILABLE':
        return 'available';
      case 'OFFER':
        return 'offer';
      case 'ASSIGNED':
        return 'assigned';
      case 'IN_SERVICE':
        return 'in_service';
      default:
        return 'offline';
    }
  }, [uiState]);

  const routeService =
    uiState === 'OFFER' ? firstOffer : uiState === 'ASSIGNED' || uiState === 'IN_SERVICE'
      ? activeService
      : null;

  const origin = serviceOriginCoordinate(routeService);
  const destination = serviceDestinationCoordinate(routeService);

  const showOnlinePill = uiState === 'AVAILABLE' || uiState === 'OFFER';
  const showRecenter = Boolean(lastKnownPosition);

  return (
    <View style={styles.wrap}>
      <MensajeroOperationalMap
        ref={mapRef}
        messengerPosition={lastKnownPosition}
        origin={origin}
        destination={destination}
        mode={mapMode}
        mapPaddingBottom={uiState === 'IN_SERVICE' ? 280 : 180}
      />

      <SafeAreaView style={styles.topOverlay} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          {showOnlinePill ? (
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>En línea</Text>
            </View>
          ) : (
            <View />
          )}
          <NotificationBell />
        </View>

        {!canOperate ? <Banner message="La sesión no tiene actor_id válido para operar." /> : null}
        {pushOfferNotice ? <Banner message={pushOfferNotice} variant="warn" /> : null}
        {error ? <Banner message={error} variant="error" /> : null}
      </SafeAreaView>

      {showRecenter ? (
        <Pressable
          style={styles.recenterBtn}
          onPress={() => mapRef.current?.recenter()}
          accessibilityRole="button"
          accessibilityLabel="Recentrar mapa en mi ubicación">
          <View style={styles.recenterInner}>
            <View style={styles.recenterRing} />
            <View style={styles.recenterCore} />
          </View>
        </Pressable>
      ) : null}

      <SafeAreaView style={styles.bottomSafe} edges={['bottom', 'left', 'right']}>
        <View style={styles.bottomPanel}>
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
              locationLabel={locationLabel}
              locationActive={locationActive}
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
            <MensajeroAssignedScreen
              service={activeService}
              actorId={actorId}
              disabled={!canOperate}
              locationLabel={locationLabel}
              locationActive={locationActive}
              onStartSuccess={() => void refreshAll({ silent: false, source: 'startService' })}
            />
          ) : null}

          {uiState === 'IN_SERVICE' && activeService ? (
            <MensajeroInServiceScreen
              service={activeService}
              actorId={actorId}
              disabled={!canOperate}
              locationLabel={locationLabel}
              locationActive={locationActive}
              onCloseSuccess={() => void handleCloseSuccess()}
            />
          ) : null}
        </View>
      </SafeAreaView>
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
  wrap: {
    flex: 1,
    backgroundColor: colors.border,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: Spacing.three,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
    minHeight: 44,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: RutafyColors.brandTintBorder,
    borderRadius: RutafyRadius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    ...shadowStyles.sm,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  onlineText: {
    color: RutafyColors.brand,
    fontSize: 12,
    fontWeight: '600',
  },
  recenterBtn: {
    position: 'absolute',
    right: Spacing.three,
    bottom: 200,
    zIndex: 15,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowStyles.md,
  },
  recenterInner: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  recenterCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  bottomSafe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  bottomPanel: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    backgroundColor: colors.surface,
    borderRadius: radius.bottomSheet,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowStyles.lg,
  },
});

const bannerStyles = StyleSheet.create({
  wrap: {
    marginTop: Spacing.two,
    backgroundColor: '#FEF3C7',
    borderRadius: radius.card,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  error: { backgroundColor: '#FEE2E2' },
  text: { fontSize: 13, color: RutafyColors.textPrimary },
});
