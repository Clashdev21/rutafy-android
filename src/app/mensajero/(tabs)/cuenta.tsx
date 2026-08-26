import { type Href, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { NotificationPreferencesSection } from '@/components/notifications/NotificationPreferencesSection';
import { RutafyCuentaScreen } from '@/components/account/RutafyCuentaScreen';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors } from '@/constants/rutafyTheme';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';
import { Spacing } from '@/constants/theme';

export default function MensajeroCuentaScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { isOnline } = useMensajeroOperationsContext();

  return (
    <RutafyCuentaScreen
      user={user}
      roleLabel="Mensajero"
      onLogout={() => void logout()}
      logoutLoading={authLoading}
      onEditProfile={() => router.push('/mensajero/editar-perfil' as Href)}>
      <RutafyCard style={styles.statusCard}>
        <Text style={styles.cardTitle}>Estado operativo</Text>
        <Text style={styles.cardBody}>
          {isOnline
            ? 'Disponible — gestiona tu disponibilidad desde Inicio.'
            : 'No disponible — actívate desde Inicio para recibir ofertas.'}
        </Text>
        <View style={styles.badgeRow}>
          <View style={[styles.dot, isOnline ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.badgeLabel}>{isOnline ? 'En línea' : 'Offline'}</Text>
        </View>
      </RutafyCard>

      <NotificationPreferencesSection />
    </RutafyCuentaScreen>
  );
}

const styles = StyleSheet.create({
  statusCard: { gap: Spacing.two },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.navy,
  },
  cardBody: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOn: { backgroundColor: RutafyColors.success },
  dotOff: { backgroundColor: RutafyColors.textSecondary },
  badgeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
  },
});
