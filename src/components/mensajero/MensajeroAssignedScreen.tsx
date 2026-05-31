import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { Service } from '@/types/service';

type Props = {
  service: Service;
  disabled?: boolean;
};

function RouteBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.routeBlock}>
      <Text style={styles.routeLabel}>{label}</Text>
      <Text style={styles.routeValue}>{value}</Text>
    </View>
  );
}

export function MensajeroAssignedScreen({ service, disabled }: Props) {
  const code = getServiceCode(service);

  const onStart = () => {
    Alert.alert(
      'Iniciar servicio',
      'La conexión con el API de inicio estará disponible en la siguiente fase. Por ahora puedes revisar la ruta asignada.',
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Servicio asignado</Text>
          <Text style={styles.headerSubtitle}>Confirma la ruta antes de salir a recoger</Text>
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Código RTF</Text>
          <Text style={styles.codeValue}>{code}</Text>
        </View>
        <RouteBlock label="RECOGER EN" value={service.origin} />
        <RouteBlock label="ENTREGAR EN" value={service.destination} />
      </View>

      <SafeAreaView style={styles.footer} edges={['bottom', 'left', 'right']}>
        <RutafyButton label="Iniciar servicio" onPress={onStart} disabled={disabled} />
        <Text style={styles.hint}>El inicio en ruta se habilitará cuando el API esté conectado.</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
  safe: {
    borderBottomWidth: 1,
    borderBottomColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  headerSubtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  codeCard: {
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: RutafyColors.navy,
  },
  routeBlock: { gap: Spacing.one },
  routeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  routeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
  hint: {
    fontSize: 12,
    color: RutafyColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
