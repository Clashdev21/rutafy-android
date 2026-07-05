import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { AppButton, AppCard, AppIcon, AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import * as mensajeroService from '@/services/mensajeroService';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/utils/errors';

type Props = {
  service: Service;
  actorId: string;
  disabled?: boolean;
  locationLabel: string;
  locationActive: boolean;
  onStartSuccess: () => void | Promise<void>;
};

export function MensajeroAssignedScreen({
  service,
  actorId,
  disabled,
  locationLabel,
  locationActive,
  onStartSuccess,
}: Props) {
  const code = getServiceCode(service);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controlsDisabled = disabled || starting || !actorId;

  const handleStart = async () => {
    setStarting(true);
    setError(null);

    try {
      await mensajeroService.startService(service.service_id, actorId);
      await onStartSuccess();
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo iniciar el servicio'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapArea}>
        <View style={styles.mapPlaceholder}>
          <AppIcon name="map" size={40} color={colors.primary} />
          <AppText variant="caption" style={styles.mapHint}>
            Vista de ruta — mapa en vivo próximamente
          </AppText>
        </View>
      </View>

      <SafeAreaView style={styles.panel} edges={['bottom', 'left', 'right']}>
        <View style={styles.panelHeader}>
          <AppText variant="heading">Servicio asignado</AppText>
          <AppText variant="caption">{code}</AppText>
        </View>

        <AppCard style={styles.routeCard}>
          <RouteBlock label="RECOGER EN" value={service.origin} />
          <RouteBlock label="ENTREGAR EN" value={service.destination} />
        </AppCard>

        <AppText
          variant="caption"
          color={locationActive ? colors.success : colors.danger}
          style={styles.locationStatus}>
          {locationLabel}
        </AppText>

        {error ? (
          <AppText variant="caption" color={colors.danger} style={styles.errorText}>
            {error}
          </AppText>
        ) : null}

        <AppButton
          label={starting ? 'Iniciando…' : 'Iniciar servicio'}
          onPress={() => void handleStart()}
          disabled={controlsDisabled}
          loading={starting}
        />
      </SafeAreaView>
    </View>
  );
}

function RouteBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.routeBlock}>
      <AppText variant="overline">{label}</AppText>
      <AppText variant="bodyMedium">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapArea: { flex: 7, backgroundColor: '#E2E8F0' },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    margin: spacing.base,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  mapHint: { textAlign: 'center', paddingHorizontal: spacing.xl },
  panel: {
    flex: 3,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  panelHeader: { gap: 2 },
  routeCard: { gap: spacing.md },
  routeBlock: { gap: 4 },
  locationStatus: { textAlign: 'center' },
  errorText: { textAlign: 'center' },
});
