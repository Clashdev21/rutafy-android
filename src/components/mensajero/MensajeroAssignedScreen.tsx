import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
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

function RouteBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.routeBlock}>
      <Text style={styles.routeLabel}>{label}</Text>
      <Text style={styles.routeValue}>{value}</Text>
    </View>
  );
}

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
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Servicio asignado</Text>
          <Text style={styles.headerSubtitle}>Confirma la ruta antes de salir a recoger</Text>
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Código RTF</Text>
          <Text style={styles.codeValue}>{code}</Text>
        </View>
        <RouteBlock label="RECOGER EN" value={service.origin} />
        <RouteBlock label="ENTREGAR EN" value={service.destination} />
        <Text
          style={[
            styles.locationStatus,
            locationActive ? styles.locationActive : styles.locationInactive,
          ]}>
          {locationLabel}
        </Text>
      </View>

      <SafeAreaView style={styles.footer} edges={['bottom', 'left', 'right']}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <RutafyButton
          label={starting ? 'Iniciando…' : 'Iniciar servicio'}
          onPress={() => void handleStart()}
          disabled={controlsDisabled}
          loading={starting}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
  safe: {
    borderBottomWidth: 1,
    borderBottomColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  headerSubtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  codeCard: {
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: RutafyColors.navy,
  },
  routeBlock: { gap: Spacing.one },
  routeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  routeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
    lineHeight: 22,
  },
  locationStatus: {
    fontSize: 13,
    fontWeight: '600',
  },
  locationActive: {
    color: RutafyColors.success,
  },
  locationInactive: {
    color: RutafyColors.danger,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
  errorText: {
    fontSize: 14,
    color: RutafyColors.danger,
    textAlign: 'center',
  },
});
