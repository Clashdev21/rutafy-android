import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { ServiceStatus } from '@/types/service';
import { getStatusLabel } from '@/utils/serviceStatus';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  REQUESTED: { bg: '#FEF9C3', text: '#854D0E' },
  OFFERED: { bg: '#FFEDD5', text: '#9A3412' },
  CLAIMED: { bg: '#DBEAFE', text: '#1E40AF' },
  STARTED: { bg: '#E0E7FF', text: '#3730A3' },
  CLOSED: { bg: '#DCFCE7', text: '#166534' },
  EXPIRED: { bg: '#F3F4F6', text: '#374151' },
  CANCELLED_BY_TRANSPORTER: { bg: '#FEE2E2', text: '#991B1B' },
  CANCELLED_BY_MESSENGER: { bg: '#FEE2E2', text: '#991B1B' },
};

type Props = {
  status: ServiceStatus | string;
};

export function ServiceStatusBadge({ status }: Props) {
  const key = String(status).toUpperCase();
  const colors = STATUS_COLORS[key] ?? { bg: '#F3F4F6', text: '#374151' };

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <ThemedText style={[styles.label, { color: colors.text }]}>
        {getStatusLabel(status)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
