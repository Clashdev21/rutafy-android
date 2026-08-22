import { type Href, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { NotificationPreferencesSection } from '@/components/notifications/NotificationPreferencesSection';
import { PushDiagnosticsPanel } from '@/components/notifications/PushDiagnosticsPanel';
import { RutafyCuentaScreen } from '@/components/account/RutafyCuentaScreen';
import { SettingsRow, SettingsSection } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/**
 * Cuenta transportista — sin tab Operación.
 * Captura logística accesible aquí sin copy "Piloto logístico".
 */
export default function TransportistaCuentaScreen() {
  const { user, logout, isLoading } = useAuth();

  return (
    <RutafyCuentaScreen
      user={user}
      roleLabel="Transportista"
      onLogout={() => void logout()}
      logoutLoading={isLoading}>
      <View style={styles.block}>
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
      </View>

      <NotificationPreferencesSection />
      <PushDiagnosticsPanel />
    </RutafyCuentaScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two, marginTop: Spacing.one },
});
