import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { RutafyCuentaScreen } from '@/components/account/RutafyCuentaScreen';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

export default function TransportistaCuentaScreen() {
  const { user, logout, isLoading } = useAuth();

  return (
    <RutafyCuentaScreen
      user={user}
      roleLabel="Transportista"
      onLogout={() => void logout()}
      logoutLoading={isLoading}>
      <RutafyCard style={styles.linkCard}>
        <Text style={styles.cardTitle}>Piloto logístico</Text>
        <Text style={styles.cardBody}>
          Modo operador para captura de ruta GPS (terminal / tractor).
        </Text>
        <Pressable
          style={styles.linkBtn}
          onPress={() => router.push('/captura-logistica' as Href)}>
          <Text style={styles.linkBtnText}>Captura logística</Text>
        </Pressable>
      </RutafyCard>
    </RutafyCuentaScreen>
  );
}

const styles = StyleSheet.create({
  linkCard: { gap: Spacing.two, marginTop: Spacing.two },
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
  linkBtn: {
    borderWidth: 1,
    borderColor: RutafyColors.brand,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  linkBtnText: {
    fontWeight: '600',
    color: RutafyColors.brand,
  },
});
