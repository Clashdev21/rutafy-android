import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Props = {
  onToggleOnline: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function MensajeroOfflineScreen({ onToggleOnline, loading, disabled }: Props) {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.content}>
          <Text style={styles.title}>Desconectado</Text>
          <Text style={styles.subtitle}>Activa tu disponibilidad para recibir servicios.</Text>
          <RutafyButton
            label="Ponerte en línea"
            onPress={onToggleOnline}
            loading={loading}
            disabled={disabled}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  safe: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: RutafyColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: RutafyColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.two,
  },
});
