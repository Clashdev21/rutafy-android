import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import { TabScrollScreen } from '@/components/layout/TabScrollScreen';
import { TransportistaPhaseHero } from '@/components/transportista/TransportistaPhaseHero';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';

export default function TransportistaInicioScreen() {
  const { activeService, error } = useTransportistaServicesContext();

  return (
    <TabScrollScreen>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Inicio</Text>
          <Text style={styles.subtitle}>Estado operacional de tu empresa</Text>
        </View>
        <NotificationBell />
      </View>

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
    </TabScrollScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  headerCopy: { flex: 1, gap: 4 },
  title: { fontSize: 28, fontWeight: '700', color: RutafyColors.textPrimary },
  subtitle: { fontSize: 14, color: RutafyColors.textSecondary },
  error: { color: RutafyColors.danger, fontSize: 14 },
  link: { alignSelf: 'flex-start' },
  linkText: { color: RutafyColors.brand, fontSize: 14, fontWeight: '600' },
  pollHint: {
    textAlign: 'center',
    fontSize: 12,
    color: RutafyColors.textSecondary,
    marginTop: Spacing.two,
  },
});
