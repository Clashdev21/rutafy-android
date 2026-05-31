import { Pressable, StyleSheet, View } from 'react-native';

import { ServiceStatusBadge } from '@/components/services/ServiceStatusBadge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Service } from '@/types/service';

type Props = {
  service: Service;
  onPress?: () => void;
};

export function ServiceListItem({ service, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}>
      <View style={styles.header}>
        <ThemedText type="smallBold">{service.service_code}</ThemedText>
        <ServiceStatusBadge status={service.status} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {service.origin}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        → {service.destination}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
    backgroundColor: '#FFFFFF',
  },
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
