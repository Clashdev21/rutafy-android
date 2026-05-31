import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import * as mensajeroService from '@/services/mensajeroService';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/utils/errors';
import { extractValidClosePinDigits } from '@/utils/transportistaClosePin';

type Props = {
  service: Service;
  actorId: string;
  disabled?: boolean;
  onCloseSuccess: () => void | Promise<void>;
};

function RouteBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.routeBlock}>
      <Text style={styles.routeLabel}>{label}</Text>
      <Text style={styles.routeValue}>{value}</Text>
    </View>
  );
}

export function MensajeroInServiceScreen({
  service,
  actorId,
  disabled,
  onCloseSuccess,
}: Props) {
  const code = getServiceCode(service);
  const [closePin, setClosePin] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const pinValid = closePin.trim().length === 4;
  const controlsDisabled = disabled || closing || !actorId;

  const handleClose = async () => {
    const pin = extractValidClosePinDigits(closePin.trim());
    if (!pin) {
      setValidationError('Ingresa un PIN de cierre de 4 dígitos.');
      return;
    }

    setClosing(true);
    setValidationError(null);

    try {
      await mensajeroService.closeService(service.service_id, {
        actor_role: 'mensajero',
        actor_id: actorId,
        messenger_id: actorId,
        close_pin: pin,
      });
      setClosePin('');
      await onCloseSuccess();
    } catch (e) {
      const msg = getApiErrorMessage(e, 'No se pudo cerrar el servicio');
      if (msg === 'invalid_close_pin') {
        setValidationError('PIN incorrecto.');
      } else {
        setValidationError(msg);
      }
    } finally {
      setClosing(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>En ruta</Text>
          </View>
          <Text style={styles.headerTitle}>Servicio en curso</Text>
          <Text style={styles.headerSubtitle}>
            Ingresa el PIN que te entregó el transportista para finalizar
          </Text>
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <View style={styles.codeRow}>
          <Text style={styles.codeLabel}>Código</Text>
          <Text style={styles.codeValue}>{code}</Text>
        </View>
        <RouteBlock label="RECOGER EN" value={service.origin} />
        <RouteBlock label="ENTREGAR EN" value={service.destination} />

        <View style={styles.pinSection}>
          <Text style={styles.pinLabel}>PIN de cierre</Text>
          <TextInput
            style={styles.pinInput}
            value={closePin}
            onChangeText={(text) => {
              setClosePin(text.replace(/\D/g, '').slice(0, 4));
              if (validationError) setValidationError(null);
            }}
            placeholder="••••"
            placeholderTextColor={RutafyColors.textSecondary}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            editable={!controlsDisabled}
            accessibilityLabel="PIN de cierre"
          />
          <Text style={styles.pinHint}>Solo dígitos. Lo recibes del transportista al entregar.</Text>
        </View>

        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : null}

        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>Evidencia de entrega</Text>
          <Text style={styles.placeholderBody}>
            La captura de foto se habilitará en una fase posterior. Puedes cerrar con PIN.
          </Text>
        </View>
      </View>

      <SafeAreaView style={styles.footer} edges={['bottom', 'left', 'right']}>
        <RutafyButton
          label={closing ? 'Finalizando…' : 'Finalizar servicio'}
          onPress={() => void handleClose()}
          disabled={!pinValid || controlsDisabled}
          loading={closing}
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
    gap: Spacing.two,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: RutafyColors.brandTint,
    borderRadius: RutafyRadius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RutafyColors.success,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.brand,
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
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    padding: Spacing.three,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 16,
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
  pinSection: { gap: Spacing.two },
  pinLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  pinInput: {
    backgroundColor: RutafyColors.surface,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    borderRadius: RutafyRadius.button,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 8,
    textAlign: 'center',
    color: RutafyColors.navy,
  },
  pinHint: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 14,
    color: RutafyColors.danger,
    fontWeight: '500',
  },
  placeholderCard: {
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    borderStyle: 'dashed',
    padding: Spacing.four,
    gap: Spacing.one,
  },
  placeholderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
  },
  placeholderBody: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
});
