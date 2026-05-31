import { StyleSheet, Text, View } from 'react-native';

import { RutafyRadius, RutafyStatusBadgeColors } from '@/constants/rutafyTheme';
import type { ServiceStatus } from '@/types/service';
import { getStatusLabel } from '@/utils/serviceStatus';

type Props = {
  status: ServiceStatus | string;
};

export function ServiceStatusBadge({ status }: Props) {
  const key = String(status).toUpperCase();
  const colors = RutafyStatusBadgeColors[key] ?? { bg: '#F3F4F6', text: '#374151' };

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{getStatusLabel(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: RutafyRadius.button,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
