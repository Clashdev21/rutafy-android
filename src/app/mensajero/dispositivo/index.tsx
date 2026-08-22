import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppHeader,
  AppText,
  SettingsRow,
  SettingsSection,
} from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/**
 * Hub de diagnóstico del dispositivo (navegación).
 * Reutiliza pantallas existentes; no duplica lógica de sensores/tracking.
 */
export default function MensajeroDispositivoScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader
          title="Estado del dispositivo"
          subtitle="Diagnóstico operativo"
          right={
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              hitSlop={8}
              style={styles.headerBtn}>
              <AppText variant="bodyMedium" color={colors.primary}>
                Cerrar
              </AppText>
            </Pressable>
          }
        />

        <ScrollView contentContainerStyle={styles.content}>
          <SettingsSection title="Ubicación y seguimiento">
            <SettingsRow
              icon="map"
              title="Ubicación y seguimiento"
              subtitle="GPS, tracking y captura"
              onPress={() => router.push('/captura-logistica/diagnostico' as Href)}
            />
          </SettingsSection>

          <SettingsSection title="Sensores">
            <SettingsRow
              icon="route"
              title="Sensores"
              subtitle="Incluidos en el export de diagnóstico de captura"
              onPress={() => router.push('/captura-logistica/diagnostico' as Href)}
            />
          </SettingsSection>

          <SettingsSection title="Notificaciones">
            <SettingsRow
              icon="notifications"
              title="Notificaciones push"
              subtitle="Registro del dispositivo"
              onPress={() => router.push('/mensajero/dispositivo/notificaciones' as Href)}
            />
          </SettingsSection>

          <SettingsSection title="Detalles técnicos">
            <SettingsRow
              icon="inbox"
              title="Exportar diagnóstico"
              subtitle="Abrir pantalla de diagnóstico y compartir"
              onPress={() => router.push('/captura-logistica/diagnostico' as Href)}
            />
          </SettingsSection>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  content: { gap: spacing.xl, paddingBottom: spacing['3xl'] },
  headerBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
});
