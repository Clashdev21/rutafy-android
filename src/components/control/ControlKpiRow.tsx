import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import type { ControlKpiCard } from '@/types/operationalControl';

type Props = {
  kpis: ControlKpiCard[];
};

export function ControlKpiRow({ kpis }: Props) {
  return (
    <View style={styles.wrap}>
      {kpis.map((kpi) => (
        <View key={kpi.id} style={styles.card}>
          <AppText variant="overline" numberOfLines={1}>
            {kpi.label}
          </AppText>
          <AppText variant="heading">{Number.isFinite(kpi.value) ? kpi.value : 0}</AppText>
        </View>
      ))}
    </View>
  );
}

type FilterChip = {
  id: string;
  label: string;
};

type FilterProps = {
  filters: FilterChip[];
  selected: string;
  onSelect: (id: string) => void;
};

export function ControlFilterRow({ filters, selected, onSelect }: FilterProps) {
  return (
    <View style={styles.filters}>
      {filters.map((filter) => {
        const active = filter.id === selected;
        return (
          <Pressable
            key={filter.id}
            onPress={() => onSelect(filter.id)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}>
            <AppText
              variant="caption"
              color={active ? colors.primaryDark : colors.subtitle}
              style={active ? styles.chipLabelActive : undefined}>
              {filter.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    width: '31%',
    minWidth: 96,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    maxHeight: 40,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderColor: colors.primary,
  },
  chipLabelActive: {
    fontWeight: '600',
  },
});
