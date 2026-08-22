import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationBell } from '@/components/notifications/NotificationBell';
import {
  AppHeader,
  AppText,
  SettingsRow,
  SettingsSection,
} from '@/components/ui';
import { getTabBarScrollPadding } from '@/constants/tabBarLayout';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/**
 * Hub operacional del mensajero: captura y diagnóstico.
 * No muestra datos técnicos inline — solo navegación.
 */
export default function MensajeroOperacionScreen() {
  const insets = useSafeAreaInsets();
  const bottom = getTabBarScrollPadding(insets.bottom);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader
          title="Operación"
          subtitle="Herramientas logísticas y dispositivo"
          right={<NotificationBell href="/mensajero/notificaciones" />}
        />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
          showsVerticalScrollIndicator={false}>
          <SettingsSection title="Captura logística">
            <SettingsRow
              icon="route"
              title="Captura logística"
              subtitle="Iniciar y administrar seguimiento"
              onPress={() => router.push('/captura-logistica' as Href)}
            />
            <SettingsRow
              icon="history"
              title="Historial de capturas"
              subtitle="Consultar sesiones anteriores"
              onPress={() => router.push('/captura-logistica/historial' as Href)}
            />
          </SettingsSection>

          <SettingsSection title="Dispositivo">
            <SettingsRow
              icon="map"
              title="Estado del dispositivo"
              subtitle="Ubicación, sensores y notificaciones"
              onPress={() => router.push('/mensajero/dispositivo' as Href)}
            />
          </SettingsSection>

          <AppText variant="caption" color={colors.subtitle} style={styles.hint}>
            Las métricas técnicas detalladas están en el diagnóstico y en la
            exportación. Esta pantalla solo organiza el acceso.
          </AppText>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  content: { gap: spacing.xl },
  hint: { lineHeight: 18 },
});
