import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';

type Props = {
  percent: number | null;
  stage?: string | null;
  stepLabel?: string | null;
};

export function ControlProgressBar({ percent, stage, stepLabel }: Props) {
  const width = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const label =
    percent == null
      ? 'Progreso no disponible'
      : `${width}%${stage ? ` · ${stage}` : ''}${stepLabel ? ` · ${stepLabel}` : ''}`;

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${width}%` }]} />
      </View>
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
});
