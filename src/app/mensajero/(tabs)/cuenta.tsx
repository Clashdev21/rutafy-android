import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { RutafyCuentaScreen } from '@/components/account/RutafyCuentaScreen';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { useMensajeroOperationsContext } from '@/contexts/MensajeroOperationsContext';
import { Spacing } from '@/constants/theme';

export default function MensajeroCuentaScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { isOnline, availabilitySyncing, canOperate, error, toggleAvailability } =
    useMensajeroOperationsContext();

  return (
    <RutafyCuentaScreen
      user={user}
      roleLabel="Mensajero"
      onLogout={() => void logout()}
      logoutLoading={authLoading}>
      <RutafyCard style={styles.availabilityCard}>
        <Text style={styles.cardTitle}>Disponibilidad</Text>
        <Text style={styles.cardBody}>
          {isOnline
            ? 'Estás en línea y puedes recibir ofertas nuevas.'
            : 'Estás desconectado. Activa tu disponibilidad desde Inicio o aquí.'}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.toggle, isOnline && styles.toggleOn, (!canOperate || availabilitySyncing) && styles.disabled]}
          onPress={() => void toggleAvailability()}
          disabled={!canOperate || availabilitySyncing}>
          {availabilitySyncing ? (
            <ActivityIndicator color={isOnline ? '#fff' : RutafyColors.textPrimary} />
          ) : (
            <Text style={[styles.toggleLabel, isOnline && styles.toggleLabelOn]}>
              {isOnline ? 'Pasar a offline' : 'Ponerte en línea'}
            </Text>
          )}
        </Pressable>
      </RutafyCard>
    </RutafyCuentaScreen>
  );
}

const styles = StyleSheet.create({
  availabilityCard: { gap: Spacing.two },
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
  error: { fontSize: 13, color: RutafyColors.danger },
  toggle: {
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: RutafyColors.brand,
    borderColor: RutafyColors.brand,
  },
  toggleLabel: { fontWeight: '600', color: RutafyColors.textPrimary },
  toggleLabelOn: { color: RutafyColors.white },
  disabled: { opacity: 0.6 },
});
