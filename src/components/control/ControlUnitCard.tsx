import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import type { ControlUnitCard } from '@/types/operationalControl';
import { formatRiskLabel } from '@/utils/controlMobileDisplay';
import { shouldShowControlField } from '@/utils/controlMobilePresentation';

type Props = {
  unit: ControlUnitCard;
  presentationMode?: boolean;
  onPress: () => void;
};

function riskColor(level: string | null): string {
  const key = (level ?? '').toUpperCase();
  if (key === 'CRITICO') return colors.danger;
  if (key === 'ALTO') return '#EA580C';
  if (key === 'MEDIO') return colors.warning;
  if (key === 'NORMAL') return colors.success;
  return colors.subtitle;
}

function stateColor(state: string): string {
  if (state === 'ALERTA') return colors.danger;
  if (state === 'EN RUTA') return '#1D4ED8';
  if (state === 'EN PUERTO') return '#7C3AED';
  if (state === 'FINALIZADO') return colors.success;
  return colors.navy;
}

export function ControlUnitCardView({ unit, presentationMode = false, onPress }: Props) {
  const showRisk = shouldShowControlField('riskLevel', presentationMode);

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <AppCard style={styles.card}>
        <View style={styles.top}>
          <AppText variant="heading" numberOfLines={1} style={styles.containerId}>
            {unit.containerId}
          </AppText>
          <View style={[styles.stateBadge, { backgroundColor: `${stateColor(unit.operationalState)}18` }]}>
            <AppText
              variant="caption"
              color={stateColor(unit.operationalState)}
              style={styles.stateText}
              numberOfLines={1}>
              {unit.operationalState}
            </AppText>
          </View>
        </View>

        <AppText variant="bodyMedium" numberOfLines={1}>
          {unit.origin} → {unit.destination}
        </AppText>

        <AppText variant="caption">
          {unit.scheduledLabel}
          {unit.lastUpdateLabel ? ` · ${unit.lastUpdateLabel}` : ''}
        </AppText>

        {unit.plate || unit.driverName ? (
          <AppText variant="caption" numberOfLines={1}>
            {[unit.plate, unit.driverName].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}

        {showRisk && unit.riskLevel ? (
          <AppText variant="caption" color={riskColor(unit.riskLevel)}>
            Riesgo {formatRiskLabel(unit.riskLevel)}
          </AppText>
        ) : null}
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  containerId: {
    flex: 1,
  },
  stateBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    flexShrink: 1,
    maxWidth: '52%',
  },
  stateText: {
    fontWeight: '600',
  },
});
