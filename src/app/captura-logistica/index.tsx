import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OperatorTrackingHealthPanel } from '@/components/tracking/OperatorTrackingHealthPanel';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppText } from '@/components/ui/AppText';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { useOperatorTrackingSession } from '@/hooks/useOperatorTrackingSession';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import type { TrackingSessionPurpose } from '@/types/tracking';
import {
  formatTimestamp,
  formatTrackingDuration,
  formatTrackingPurpose,
  formatTrackingStatus,
} from '@/utils/trackingSessionFormat';

const PURPOSE_OPTIONS: { value: TrackingSessionPurpose; label: string }[] = [
  { value: 'operacion_interna', label: 'Operación interna' },
  { value: 'traslado_variante', label: 'Traslado variante' },
  { value: 'puerto', label: 'Puerto' },
  { value: 'patio', label: 'Patio' },
  { value: 'terminal', label: 'Terminal' },
];

const CONSENT_TEXT =
  'Autorizo iniciar una sesión de captura logística. Rutafy registrará ubicación, precisión GPS, velocidad aproximada, dirección, batería y estado de la app únicamente mientras esta sesión esté activa.';

export default function CapturaLogisticaScreen() {
  const insets = useSafeAreaInsets();
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);
  const {
    isActive,
    storedSession,
    shortSessionId,
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
    closingAction,
    error,
    successMessage,
    pointsSent,
    lastPointAt,
    elapsedSeconds,
    startCapture,
    endCapture,
    cancelCapture,
    healthRefreshKey,
  } = useOperatorTrackingSession();

  const formDisabled = isActive || busy || loading;

  const statusLabel = useMemo(() => {
    if (loading) return 'Cargando…';
    if (isActive) return 'Captura logística activa';
    return 'Inactiva';
  }, [loading, isActive]);

  const activePurposeLabel = storedSession
    ? formatTrackingPurpose(storedSession.purpose)
    : formatTrackingPurpose(purpose);

  const handleEndCapture = async () => {
    const endedId = await endCapture();
    if (endedId) {
      router.push(`/captura-logistica/${encodeURIComponent(endedId)}` as Href);
    }
  };

  const handleConfirmCancel = async () => {
    setCancelDialogVisible(false);
    await cancelCapture();
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, Spacing.four) + Spacing.four },
      ]}
      keyboardShouldPersistTaps="handled">
      <AppCard style={styles.statusCard}>
        <AppText variant="heading">{statusLabel}</AppText>
        {isActive && storedSession ? (
          <>
            <AppText variant="body">Sesión: {shortSessionId}</AppText>
            <AppText variant="body">Propósito: {activePurposeLabel}</AppText>
            <AppText variant="body">Vehículo: {storedSession.vehicleLabel}</AppText>
            <AppText variant="body">
              Inicio: {formatTimestamp(storedSession.startedAt)}
            </AppText>
            <AppText variant="body">Estado: {formatTrackingStatus('active')}</AppText>
            <AppText variant="body">Tiempo: {formatTrackingDuration(elapsedSeconds)}</AppText>
            <AppText variant="body">Puntos capturados: {pointsSent}</AppText>
            <AppText variant="caption" color={colors.subtitle}>
              Último punto: {lastPointAt ? new Date(lastPointAt).toLocaleTimeString() : '—'}
            </AppText>
          </>
        ) : (
          <AppText variant="body" color={colors.subtitle}>
            Completa el formulario e inicia una sesión de captura en primer plano.
          </AppText>
        )}
      </AppCard>

      {successMessage && !isActive ? (
        <AppCard muted style={styles.successCard}>
          <AppText variant="body" color={colors.primary}>
            {successMessage}
          </AppText>
        </AppCard>
      ) : null}

      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}

      {__DEV__ && isActive ? (
        <OperatorTrackingHealthPanel refreshKey={healthRefreshKey} />
      ) : null}

      <Pressable
        style={styles.linkBtn}
        onPress={() => router.push('/captura-logistica/historial' as Href)}>
        <AppText variant="bodyMedium" color={colors.primary}>
          Historial de capturas
        </AppText>
      </Pressable>

      {isActive && storedSession?.sessionId ? (
        <Pressable
          style={styles.linkBtnSecondary}
          onPress={() =>
            router.push(
              `/captura-logistica/${encodeURIComponent(storedSession.sessionId)}` as Href,
            )
          }>
          <AppText variant="bodyMedium" color={colors.primary}>
            Ver resumen operacional
          </AppText>
        </Pressable>
      ) : null}

      {!isActive ? (
        <AppCard style={styles.formCard}>
          <AppText variant="overline">Propósito</AppText>
          <View style={styles.purposeRow}>
            {PURPOSE_OPTIONS.map((opt) => {
              const selected = purpose === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.purposeChip, selected && styles.purposeChipOn]}
                  onPress={() => setPurpose(opt.value)}
                  disabled={formDisabled}>
                  <AppText
                    variant="caption"
                    color={selected ? colors.primary : colors.textPrimary}
                    style={selected ? styles.purposeChipTextOn : undefined}>
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppText variant="overline">Vehículo</AppText>
          <TextInput
            style={styles.input}
            value={vehicleLabel}
            onChangeText={setVehicleLabel}
            placeholder="Tractor terminal SPB #12"
            placeholderTextColor={RutafyColors.textSecondary}
            editable={!formDisabled}
          />

          <AppText variant="overline">Notas (opcional)</AppText>
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
              {consentAccepted ? (
                <AppText variant="caption" color={colors.white}>
                  ✓
                </AppText>
              ) : null}
            </View>
            <AppText variant="caption" color={colors.subtitle} style={styles.consentText}>
              {CONSENT_TEXT}
            </AppText>
          </Pressable>
        </AppCard>
      ) : null}

      {loading ? (
        <ActivityIndicator color={RutafyColors.brand} style={styles.loader} />
      ) : null}

      {!isActive ? (
        <AppButton
          label={busy ? 'Procesando…' : 'Iniciar captura'}
          onPress={() => void startCapture()}
          disabled={formDisabled || !consentAccepted}
          loading={busy && !closingAction}
        />
      ) : null}

      {isActive ? (
        <View style={styles.activeActions}>
          <AppButton
            label={
              closingAction === 'end'
                ? 'Finalizando…'
                : 'Finalizar captura'
            }
            onPress={() => void handleEndCapture()}
            disabled={busy}
            loading={closingAction === 'end'}
          />
          <AppButton
            label={
              closingAction === 'cancel'
                ? 'Cancelando…'
                : 'Cancelar captura'
            }
            variant="danger"
            onPress={() => setCancelDialogVisible(true)}
            disabled={busy}
            loading={closingAction === 'cancel'}
          />
        </View>
      ) : null}

      <AppDialog
        visible={cancelDialogVisible}
        title="Cancelar captura"
        message="¿Seguro que deseas cancelar esta captura? Los puntos ya enviados se conservan, pero dejará de registrarse ubicación."
        confirmLabel="Sí, cancelar"
        cancelLabel="Volver"
        destructive
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setCancelDialogVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.base,
  },
  statusCard: { gap: spacing.sm },
  successCard: { borderColor: colors.primary },
  formCard: { gap: spacing.sm },
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
  purposeChipTextOn: {
    fontWeight: '600',
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
  consentText: {
    flex: 1,
    lineHeight: 18,
  },
  linkBtn: {
    borderWidth: 1,
    borderColor: RutafyColors.brand,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  linkBtnSecondary: {
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    backgroundColor: RutafyColors.white,
  },
  loader: { marginVertical: Spacing.two },
  activeActions: { gap: spacing.sm },
});
