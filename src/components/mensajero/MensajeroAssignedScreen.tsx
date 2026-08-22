import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { AppButton, AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
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

/** Panel ASSIGNED (MAP 1A). Sin placeholder de mapa. */
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
    <View style={styles.panel}>
      <AppText variant="heading">Servicio asignado</AppText>
      <AppText variant="caption">{code}</AppText>

      <View style={styles.routeBlock}>
        <AppText variant="overline">RECOGER EN</AppText>
        <AppText variant="bodyMedium">{service.origin}</AppText>
      </View>
      <View style={styles.routeBlock}>
        <AppText variant="overline">ENTREGAR EN</AppText>
        <AppText variant="bodyMedium">{service.destination}</AppText>
      </View>

      <AppText
        variant="caption"
        color={locationActive ? colors.success : colors.danger}
        style={styles.locationStatus}>
        {locationLabel}
      </AppText>

      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}

      <AppButton
        label={starting ? 'Iniciando…' : 'Iniciar servicio'}
        onPress={() => void handleStart()}
        disabled={controlsDisabled}
        loading={starting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  routeBlock: {
    gap: 4,
  },
  locationStatus: {
    textAlign: 'left',
  },
});
