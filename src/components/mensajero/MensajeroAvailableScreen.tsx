import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MensajeroSearchingRadar } from '@/components/mensajero/MensajeroSearchingRadar';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Props = {
  onToggleOffline: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function MensajeroAvailableScreen({ onToggleOffline, loading, disabled }: Props) {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>En línea</Text>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.center}>
        <MensajeroSearchingRadar />
        <Text style={styles.title}>Buscando servicios para ti</Text>
        <Text style={styles.subtitle}>
          Estamos revisando solicitudes cercanas. Recibirás una notificación en cuanto haya una
          oferta disponible.
        </Text>
        <View style={styles.tips}>
          <Text style={styles.tip}>• Mantén la app abierta para responder rápido</Text>
          <Text style={styles.tip}>• Las ofertas expiran en pocos minutos</Text>
        </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <RutafyButton
          label="Pasar a offline"
          variant="secondary"
          onPress={onToggleOffline}
          loading={loading}
          disabled={disabled}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RutafyColors.surfaceMuted,
  },
  safe: { paddingHorizontal: Spacing.four },
  topBar: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: RutafyColors.brandTint,
    borderWidth: 1,
    borderColor: RutafyColors.brandTintBorder,
    borderRadius: RutafyRadius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RutafyColors.success,
  },
  badgeText: {
    color: RutafyColors.brand,
    fontSize: 12,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: RutafyColors.navy,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: RutafyColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  tips: {
    marginTop: Spacing.two,
    gap: Spacing.one,
    alignSelf: 'stretch',
    maxWidth: 320,
  },
  tip: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
});
