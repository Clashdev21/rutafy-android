import { StyleSheet, Text, View } from 'react-native';

import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Props = {
  label: string;
  value: string;
};

export function TrackingSessionDetailRow({ label, value }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    fontSize: 15,
    color: RutafyColors.textPrimary,
    lineHeight: 22,
  },
});
