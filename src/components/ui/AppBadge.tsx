import { StyleSheet, Text, View } from 'react-native';

import { RutafyStatusBadgeColors } from '@/constants/rutafyTheme';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { getStatusLabel } from '@/utils/serviceStatus';

type Props = {
  status: string;
  label?: string;
};

export function AppBadge({ status, label }: Props) {
  const palette = RutafyStatusBadgeColors[status] ?? {
    bg: colors.surfaceMuted,
    text: colors.subtitle,
  };
  const text = label ?? getStatusLabel(status);

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  text: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
});
