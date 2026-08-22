import { StyleSheet, Text, View } from 'react-native';

import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Props = {
  onToggleOnline: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/** Contenido del panel inferior OFFLINE (MAP 1A). El mapa vive en MensajeroInicioView. */
export function MensajeroOfflineScreen({ onToggleOnline, loading, disabled }: Props) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Desconectado</Text>
      <Text style={styles.subtitle}>Activa tu disponibilidad para recibir servicios.</Text>
      <RutafyButton
        label="Ponerte en línea"
        onPress={onToggleOnline}
        loading={loading}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: RutafyColors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.one,
  },
});
