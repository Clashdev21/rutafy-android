import { StyleSheet, Text, View } from 'react-native';

import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { TrackingSessionStatus } from '@/types/tracking';
import { formatTrackingStatus } from '@/utils/trackingSessionFormat';

type Props = {
  status: TrackingSessionStatus;
};

const STATUS_COLORS: Record<TrackingSessionStatus, { bg: string; text: string }> = {
  active: { bg: '#DCFCE7', text: RutafyColors.brandDark },
  ended: { bg: '#E2E8F0', text: RutafyColors.textSecondary },
  abandoned: { bg: '#FEE2E2', text: RutafyColors.danger },
};

export function TrackingSessionStatusBadge({ status }: Props) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.ended;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{formatTrackingStatus(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: RutafyRadius.button,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
