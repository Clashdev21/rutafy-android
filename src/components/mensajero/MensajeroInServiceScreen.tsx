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

export function MensajeroInServiceScreen({ service, disabled }: Props) {
  const code = getServiceCode(service);

  const onFinish = () => {
    Alert.alert(
      'Finalizar servicio',
      'El cierre con evidencia fotográfica se conectará en la siguiente fase.',
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>En ruta</Text>
          </View>
          <Text style={styles.headerTitle}>Servicio en curso</Text>
          <Text style={styles.headerSubtitle}>Sigue la ruta hasta completar la entrega</Text>
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <View style={styles.codeRow}>
          <Text style={styles.codeLabel}>Código</Text>
          <Text style={styles.codeValue}>{code}</Text>
        </View>
        <RouteBlock label="RECOGER EN" value={service.origin} />
        <RouteBlock label="ENTREGAR EN" value={service.destination} />

        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderTitle}>Evidencia de entrega</Text>
          <Text style={styles.placeholderBody}>
            La captura de foto y confirmación se habilitarán cuando el API de cierre esté
            conectado.
          </Text>
        </View>
      </View>

      <SafeAreaView style={styles.footer} edges={['bottom', 'left', 'right']}>
        <RutafyButton label="Finalizar servicio" onPress={onFinish} disabled={disabled} />
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
    gap: Spacing.two,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: RutafyColors.brandTint,
    borderRadius: RutafyRadius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RutafyColors.success,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.brand,
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
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    padding: Spacing.three,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 16,
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
  placeholderCard: {
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    borderStyle: 'dashed',
    padding: Spacing.four,
    gap: Spacing.one,
  },
  placeholderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
  },
  placeholderBody: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
});
