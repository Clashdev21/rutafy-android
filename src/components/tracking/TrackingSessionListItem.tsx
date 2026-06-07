import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TrackingSessionStatusBadge } from '@/components/tracking/TrackingSessionStatusBadge';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { TrackingSessionDetail } from '@/types/tracking';
import {
  computeSessionDurationSeconds,
  formatTrackingDuration,
  formatTrackingPurpose,
  formatTimestamp,
  shortTrackingSessionId,
} from '@/utils/trackingSessionFormat';

type Props = {
  session: TrackingSessionDetail;
  onPress?: () => void;
};

export function TrackingSessionListItem({ session, onPress }: Props) {
  const duration = formatTrackingDuration(computeSessionDurationSeconds(session));
  const pointCount = session.stats?.point_count;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}>
      <View style={styles.header}>
        <Text style={styles.sessionId}>{shortTrackingSessionId(session.id)}</Text>
        <TrackingSessionStatusBadge status={session.status} />
      </View>
      <Text style={styles.vehicle} numberOfLines={1}>
        {session.vehicle_label || 'Sin etiqueta de vehículo'}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {formatTrackingPurpose(session.purpose)}
      </Text>
      <Text style={styles.meta}>
        {formatTimestamp(session.started_at)} · {duration}
        {pointCount != null ? ` · ${pointCount} pts` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: RutafyRadius.button,
    padding: Spacing.three,
    gap: Spacing.one,
    backgroundColor: RutafyColors.white,
  },
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sessionId: {
    fontSize: 14,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  vehicle: {
    fontSize: 15,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
  },
});
