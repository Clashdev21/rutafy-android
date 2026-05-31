import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransportistaPhaseHero } from '@/components/transportista/TransportistaPhaseHero';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';

export default function TransportistaInicioScreen() {
  const { activeService, error } = useTransportistaServicesContext();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Inicio</Text>
        <Text style={styles.subtitle}>Estado operacional de tu empresa</Text>

        <TransportistaPhaseHero activeService={activeService} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <RutafyButton
          label="Crear servicio"
          onPress={() => router.push('/transportista/crear' as Href)}
        />

        {activeService ? (
          <Pressable
            style={styles.link}
            onPress={() =>
              router.push(`/transportista/${activeService.service_id}` as Href)
            }>
            <Text style={styles.linkText}>Ver detalle del servicio activo</Text>
          </Pressable>
        ) : null}

        <Text style={styles.pollHint}>Actualización automática cada 5 s</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
  safe: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  title: { fontSize: 28, fontWeight: '700', color: RutafyColors.textPrimary },
  subtitle: { fontSize: 14, color: RutafyColors.textSecondary },
  error: { color: RutafyColors.danger, fontSize: 14 },
  link: { alignSelf: 'flex-start' },
  linkText: { color: RutafyColors.brand, fontSize: 14, fontWeight: '600' },
  pollHint: {
    marginTop: 'auto',
    textAlign: 'center',
    fontSize: 12,
    color: RutafyColors.textSecondary,
  },
});
