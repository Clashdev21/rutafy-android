import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TabScrollScreen } from '@/components/layout/TabScrollScreen';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { AuthUser } from '@/types/auth';

type RowProps = { label: string; value: string };

function InfoRow({ label, value }: RowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

type Props = {
  user: AuthUser | null;
  roleLabel: string;
  onLogout: () => void;
  logoutLoading?: boolean;
  children?: ReactNode;
};

export function RutafyCuentaScreen({
  user,
  roleLabel,
  onLogout,
  logoutLoading,
  children,
}: Props) {
  return (
    <TabScrollScreen>
      <Text style={styles.title}>Cuenta</Text>
      <Text style={styles.subtitle}>Perfil y preferencias de sesión</Text>

      <RutafyCard style={styles.card}>
        <Text style={styles.cardTitle}>Tu perfil</Text>
        <InfoRow label="Rol" value={roleLabel} />
        <InfoRow label="Nombre" value={user?.name?.trim() || '—'} />
        <InfoRow label="Teléfono" value={user?.phone?.trim() || '—'} />
        <InfoRow label="Correo" value={user?.email?.trim() || '—'} />
        {user?.actor_id ? <InfoRow label="ID operativo" value={user.actor_id} /> : null}
      </RutafyCard>

      {children}

      <RutafyButton
        label="Cerrar sesión"
        variant="danger"
        onPress={onLogout}
        disabled={logoutLoading}
      />
    </TabScrollScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: RutafyColors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    marginBottom: Spacing.one,
  },
  card: { gap: Spacing.three },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.navy,
  },
  row: { gap: 4 },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  rowValue: {
    fontSize: 15,
    color: RutafyColors.textPrimary,
  },
});
