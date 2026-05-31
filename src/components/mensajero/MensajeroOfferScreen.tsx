import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { Service } from '@/types/service';

type Props = {
  offer: Service;
  onAccept: () => void;
  onOmit: () => void;
  isAccepting?: boolean;
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

export function MensajeroOfferScreen({
  offer,
  onAccept,
  onOmit,
  isAccepting,
  disabled,
}: Props) {
  const code = getServiceCode(offer);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nueva oferta</Text>
          <Text style={styles.headerSubtitle}>Acepta antes de que expire</Text>
        </View>
      </SafeAreaView>

      <View style={styles.body}>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Código de servicio</Text>
          <Text style={styles.codeValue}>{code}</Text>
        </View>
        <RouteBlock label="RECOGER EN" value={offer.origin} />
        <RouteBlock label="ENTREGAR EN" value={offer.destination} />
      </View>

      <SafeAreaView style={styles.footer} edges={['bottom', 'left', 'right']}>
        <RutafyButton
          label={isAccepting ? 'Aceptando…' : 'Aceptar'}
          onPress={onAccept}
          loading={isAccepting}
          disabled={disabled || isAccepting}
        />
        <RutafyButton
          label="Omitir"
          variant="secondary"
          onPress={onOmit}
          disabled={disabled || isAccepting}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RutafyColors.surface,
  },
  safe: {
    borderBottomWidth: 1,
    borderBottomColor: RutafyColors.border,
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
    color: RutafyColors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  codeCard: {
    backgroundColor: RutafyColors.surfaceMuted,
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
});
