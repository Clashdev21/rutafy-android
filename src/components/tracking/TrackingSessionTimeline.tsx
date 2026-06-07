import { StyleSheet, Text, View } from 'react-native';

import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { TrackingTimelineEvent } from '@/types/tracking';
import { formatTimestamp } from '@/utils/trackingSessionFormat';

type Props = {
  events: TrackingTimelineEvent[];
};

export function TrackingSessionTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <RutafyCard style={styles.card}>
        <Text style={styles.title}>Timeline</Text>
        <Text style={styles.empty}>Sin eventos registrados todavía.</Text>
      </RutafyCard>
    );
  }

  return (
    <RutafyCard style={styles.card}>
      <Text style={styles.title}>Timeline</Text>
      <View style={styles.list}>
        {events.map((event, index) => (
          <View key={event.id} style={styles.item}>
            <View style={styles.rail}>
              <View style={styles.dot} />
              {index < events.length - 1 ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.content}>
              <Text style={styles.eventLabel}>{event.label}</Text>
              <Text style={styles.eventTime}>{formatTimestamp(event.at)}</Text>
              {event.detail ? <Text style={styles.eventDetail}>{event.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </RutafyCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  empty: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
  },
  list: { gap: Spacing.one },
  item: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rail: {
    width: 16,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RutafyColors.brand,
    marginTop: 4,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: RutafyColors.borderMuted,
    marginTop: 4,
    minHeight: 24,
  },
  content: {
    flex: 1,
    paddingBottom: Spacing.two,
    gap: 2,
  },
  eventLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
  },
  eventTime: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
  },
  eventDetail: {
    fontSize: 12,
    color: RutafyColors.textSecondary,
    fontFamily: 'monospace',
  },
});
