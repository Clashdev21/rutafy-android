import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ControlProgressBar } from '@/components/control/ControlProgressBar';
import { ControlTimeline } from '@/components/control/ControlTimeline';
import { AppButton, AppCard, AppEmptyState, AppSkeletonCard, AppText } from '@/components/ui';
import { useControlPresentation } from '@/contexts/ControlPresentationContext';
import { fetchOperationalDigitalTwin } from '@/services/operationalDigitalTwinService';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import type { OperationalDigitalTwinDetail } from '@/types/operationalDigitalTwin';
import { formatBogotaDateTime } from '@/utils/bogotaDayRange';
import { asSafeText, mapEtaForDisplay, mapLocationLabel, mapProgressPercent, mapRiskForDisplay, mapTwinTimeline } from '@/utils/controlMobileDisplay';
import { resolveControlUiError, type ControlUiError } from '@/utils/controlMobileErrors';
import { shouldShowControlField } from '@/utils/controlMobilePresentation';

function paramId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export default function ControlContainerDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const containerId = decodeURIComponent(paramId(id));
  const { presentationMode, togglePresentationMode } = useControlPresentation();

  const [twin, setTwin] = useState<OperationalDigitalTwinDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ControlUiError | null>(null);

  const load = useCallback(async () => {
    if (!containerId.trim()) {
      setError({ kind: 'not_found', message: 'No encontramos esta unidad.' });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchOperationalDigitalTwin(containerId);
      setTwin(data);
      setError(null);
    } catch (e) {
      setError(resolveControlUiError(e));
    } finally {
      setLoading(false);
    }
  }, [containerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !twin) {
    return (
      <View style={[styles.screen, { padding: spacing.base }]}>
        <AppSkeletonCard />
      </View>
    );
  }

  if (error && !twin) {
    return (
      <View style={styles.screen}>
        <AppEmptyState
          icon="inbox"
          title="Unidad"
          description={error.message}
          actionLabel={error.kind === 'forbidden' ? undefined : 'Reintentar'}
          onAction={error.kind === 'forbidden' ? undefined : () => void load()}
        />
      </View>
    );
  }

  const eta = mapEtaForDisplay(twin?.eta);
  const risk = mapRiskForDisplay(twin?.risk);
  const progress = mapProgressPercent(twin?.journey_progress?.percent);
  const location = mapLocationLabel(
    twin?.current_location?.name,
    twin?.driver?.last_location_at ?? null,
  );
  const timeline = mapTwinTimeline(twin);
  const origin = asSafeText(twin?.declared_truth?.declared_port_code);
  const destination = asSafeText(twin?.declared_truth?.destination_code);
  const scheduled = formatBogotaDateTime(twin?.declared_truth?.scheduled_at) ?? 'Sin horario';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing['2xl'] }]}>
      <AppButton
        label={presentationMode ? 'Salir de presentación' : 'Presentar operación'}
        variant="secondary"
        onPress={togglePresentationMode}
      />

      <AppCard>
        <AppText variant="overline">Contenedor</AppText>
        <AppText variant="heading">{asSafeText(twin?.container_id, containerId)}</AppText>
        <AppText variant="body">{asSafeText(twin?.client_name, 'Cliente no disponible')}</AppText>
        <AppText variant="bodyMedium">
          {origin} → {destination}
        </AppText>
        <AppText variant="caption">Programado {scheduled}</AppText>
        {twin?.driver?.name || twin?.driver?.plate ? (
          <AppText variant="caption">
            {[twin?.driver?.plate, twin?.driver?.name].filter(Boolean).join(' · ')}
          </AppText>
        ) : (
          <AppText variant="caption">Sin conductor asignado</AppText>
        )}
      </AppCard>

      <AppCard>
        <AppText variant="overline">Estado actual</AppText>
        <AppText variant="heading">
          {asSafeText(twin?.current_phase_label, 'Estado en seguimiento')}
        </AppText>
      </AppCard>

      <AppCard>
        <AppText variant="overline">Progreso</AppText>
        <ControlProgressBar
          percent={progress}
          stage={twin?.journey_progress?.stage}
          stepLabel={twin?.journey_progress?.current_step_label}
        />
      </AppCard>

      <AppCard>
        <AppText variant="overline">ETA</AppText>
        <AppText variant="heading">{eta.label}</AppText>
        {eta.atLabel ? <AppText variant="body">{eta.atLabel}</AppText> : null}
        {eta.expired ? (
          <AppText variant="caption" color={colors.danger}>
            Estado vencido
          </AppText>
        ) : null}
        {eta.sourceLabel ? <AppText variant="caption">{eta.sourceLabel}</AppText> : null}
      </AppCard>

      <AppCard>
        <AppText variant="overline">Riesgo</AppText>
        <AppText variant="heading">{risk.levelLabel}</AppText>
        {shouldShowControlField('riskScore', presentationMode) && risk.score != null ? (
          <AppText variant="caption">Score {risk.score}</AppText>
        ) : null}
        {risk.reasons.length ? (
          risk.reasons.map((reason) => (
            <AppText key={reason} variant="body">
              {reason}
            </AppText>
          ))
        ) : (
          <AppText variant="caption">Sin novedades reportadas</AppText>
        )}
      </AppCard>

      <AppCard>
        <AppText variant="overline">Última ubicación</AppText>
        <AppText variant="bodyMedium">{location.name}</AppText>
        {location.updatedLabel ? (
          <AppText variant="caption">Actualizado {location.updatedLabel}</AppText>
        ) : (
          <AppText variant="caption">Sin última actualización</AppText>
        )}
      </AppCard>

      <AppCard>
        <AppText variant="overline">Timeline</AppText>
        <ControlTimeline items={timeline} />
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  content: {
    padding: spacing.base,
    gap: spacing.md,
  },
});
