import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function AppChip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      disabled={!onPress}>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipSelected: {
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderColor: colors.primary,
  },
  label: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    color: colors.subtitle,
  },
  labelSelected: {
    color: colors.primaryDark,
    fontFamily: fontFamily.semiBold,
  },
});
