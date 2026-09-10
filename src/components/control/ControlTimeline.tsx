import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import type { ControlTimelineItem } from '@/utils/controlMobileDisplay';

type Props = {
  items: ControlTimelineItem[];
};

export function ControlTimeline({ items }: Props) {
  if (!items.length) {
    return (
      <AppText variant="caption">Sin eventos de timeline para esta unidad.</AppText>
    );
  }

  return (
    <View style={styles.wrap}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <View key={`${item.label}-${item.atIso ?? index}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, item.current && styles.dotCurrent]} />
              {last ? null : <View style={styles.line} />}
            </View>
            <View style={styles.body}>
              <AppText variant={item.current ? 'bodyMedium' : 'body'}>{item.label}</AppText>
              <AppText variant="caption" color={item.current ? colors.primaryDark : colors.subtitle}>
                {item.atLabel}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    minHeight: 48,
  },
  rail: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.borderMuted,
    marginTop: 6,
  },
  dotCurrent: {
    backgroundColor: colors.primary,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  body: {
    flex: 1,
    paddingBottom: spacing.base,
    gap: 2,
  },
});
