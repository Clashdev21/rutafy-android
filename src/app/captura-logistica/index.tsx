import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { useOperatorTrackingSession } from '@/hooks/useOperatorTrackingSession';
import type { TrackingSessionPurpose } from '@/types/tracking';

const PURPOSE_OPTIONS: { value: TrackingSessionPurpose; label: string }[] = [
  { value: 'operacion_interna', label: 'Operación interna' },
  { value: 'traslado_variante', label: 'Traslado variante' },
  { value: 'puerto', label: 'Puerto' },
  { value: 'patio', label: 'Patio' },
  { value: 'terminal', label: 'Terminal' },
];

const CONSENT_TEXT =
  'Autorizo iniciar una sesión de captura logística. Rutafy registrará ubicación, precisión GPS, velocidad aproximada, dirección, batería y estado de la app únicamente mientras esta sesión esté activa.';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function CapturaLogisticaScreen() {
  const insets = useSafeAreaInsets();
  const {
    isActive,
    shortSessionId,
    remoteStatus,
    purpose,
    setPurpose,
    vehicleLabel,
    setVehicleLabel,
    notes,
    setNotes,
    consentAccepted,
    setConsentAccepted,
    loading,
    busy,
    error,
    pointsSent,
    lastPointAt,
    elapsedSeconds,
    startCapture,
    endCapture,
  } = useOperatorTrackingSession();

  const formDisabled = isActive || busy || loading;

  const statusLabel = useMemo(() => {
    if (loading) return 'Cargando…';
    if (isActive) return 'Captura logística activa';
    return 'Inactiva';
  }, [loading, isActive]);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, Spacing.four) + Spacing.four },
      ]}
      keyboardShouldPersistTaps="handled">
      <RutafyCard style={styles.statusCard}>
        <Text style={styles.statusTitle}>{statusLabel}</Text>
        {isActive ? (
          <>
            <Text style={styles.statusLine}>Sesión: {shortSessionId}</Text>
            <Text style={styles.statusLine}>
              Estado remoto: {remoteStatus ?? 'active'}
            </Text>
            <Text style={styles.statusLine}>Tiempo: {formatDuration(elapsedSeconds)}</Text>
            <Text style={styles.statusLine}>Puntos enviados: {pointsSent}</Text>
            <Text style={styles.statusLine}>
              Último punto: {lastPointAt ? new Date(lastPointAt).toLocaleTimeString() : '—'}
            </Text>
          </>
        ) : (
          <Text style={styles.statusHint}>
            Completa el formulario e inicia una sesión de captura en primer plano.
          </Text>
        )}
      </RutafyCard>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!isActive ? (
        <RutafyCard style={styles.formCard}>
          <Text style={styles.sectionTitle}>Propósito</Text>
          <View style={styles.purposeRow}>
            {PURPOSE_OPTIONS.map((opt) => {
              const selected = purpose === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.purposeChip, selected && styles.purposeChipOn]}
                  onPress={() => setPurpose(opt.value)}
                  disabled={formDisabled}>
                  <Text style={[styles.purposeChipText, selected && styles.purposeChipTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Vehículo</Text>
          <TextInput
            style={styles.input}
            value={vehicleLabel}
            onChangeText={setVehicleLabel}
            placeholder="Tractor terminal SPB #12"
            placeholderTextColor={RutafyColors.textSecondary}
            editable={!formDisabled}
          />

          <Text style={styles.sectionTitle}>Notas (opcional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Observaciones del piloto"
            placeholderTextColor={RutafyColors.textSecondary}
            multiline
            editable={!formDisabled}
          />

          <Pressable
            style={styles.consentRow}
            onPress={() => setConsentAccepted((v) => !v)}
            disabled={formDisabled}>
            <View style={[styles.checkbox, consentAccepted && styles.checkboxOn]}>
              {consentAccepted ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.consentText}>{CONSENT_TEXT}</Text>
          </Pressable>
        </RutafyCard>
      ) : null}

      {loading ? (
        <ActivityIndicator color={RutafyColors.brand} style={styles.loader} />
      ) : null}

      <RutafyButton
        label={busy ? 'Procesando…' : 'Iniciar captura'}
        onPress={() => void startCapture()}
        disabled={formDisabled || !consentAccepted}
        loading={busy && !isActive}
      />

      {isActive ? (
        <RutafyButton
          label={busy ? 'Finalizando…' : 'Finalizar captura'}
          variant="danger"
          onPress={() => void endCapture()}
          disabled={busy}
          loading={busy}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  statusCard: { gap: Spacing.two },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  statusLine: {
    fontSize: 14,
    color: RutafyColors.textPrimary,
  },
  statusHint: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
  },
  formCard: { gap: Spacing.two },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
    marginTop: Spacing.one,
  },
  purposeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  purposeChip: {
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: RutafyRadius.button,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    backgroundColor: RutafyColors.white,
  },
  purposeChipOn: {
    borderColor: RutafyColors.brand,
    backgroundColor: '#E8F8F6',
  },
  purposeChipText: {
    fontSize: 12,
    color: RutafyColors.textPrimary,
  },
  purposeChipTextOn: {
    fontWeight: '600',
    color: RutafyColors.brand,
  },
  input: {
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: RutafyRadius.button,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
    color: RutafyColors.textPrimary,
    backgroundColor: RutafyColors.white,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: {
    backgroundColor: RutafyColors.brand,
    borderColor: RutafyColors.brand,
  },
  checkMark: {
    color: RutafyColors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  error: {
    fontSize: 13,
    color: RutafyColors.danger,
  },
  loader: { marginVertical: Spacing.two },
});
