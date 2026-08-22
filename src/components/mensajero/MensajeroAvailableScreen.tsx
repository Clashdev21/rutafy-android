import { StyleSheet, Text, View } from 'react-native';

import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Props = {
  onToggleOffline: () => void;
  loading?: boolean;
  disabled?: boolean;
  locationLabel: string;
  locationActive: boolean;
};

/** Panel compacto AVAILABLE (MAP 1A). Sin radar ni bullets largos. */
export function MensajeroAvailableScreen({
  onToggleOffline,
  loading,
  disabled,
  locationLabel,
  locationActive,
}: Props) {
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>Buscando servicios</Text>
          <Text style={styles.subtitle}>Estás en línea y disponible para recibir solicitudes.</Text>
          <Text
            style={[
              styles.location,
              locationActive ? styles.locationActive : styles.locationInactive,
            ]}>
            {locationLabel}
          </Text>
        </View>
        <View style={styles.action}>
          <RutafyButton
            label="Offline"
            variant="secondary"
            onPress={onToggleOffline}
            loading={loading}
            disabled={disabled}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  subtitle: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  location: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  locationActive: {
    color: RutafyColors.success,
  },
  locationInactive: {
    color: RutafyColors.danger,
  },
  action: {
    minWidth: 108,
  },
});
