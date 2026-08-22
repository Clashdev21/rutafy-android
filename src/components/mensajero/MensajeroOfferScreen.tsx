import { StyleSheet, Text, View } from 'react-native';

import { formatServiceTypeLabel, getServiceCode } from '@/components/mensajero/serviceDisplay';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import type { Service } from '@/types/service';

type Props = {
  offer: Service;
  onAccept: () => void;
  onOmit: () => void;
  isAccepting?: boolean;
  disabled?: boolean;
};

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaBlock}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Panel OFFER sobre mapa (MAP 1A). */
export function MensajeroOfferScreen({
  offer,
  onAccept,
  onOmit,
  isAccepting,
  disabled,
}: Props) {
  const code = getServiceCode(offer);
  const typeLabel = formatServiceTypeLabel(offer.service_type);
  const distance =
    offer.estimated_route_distance_km != null && Number.isFinite(offer.estimated_route_distance_km)
      ? `${offer.estimated_route_distance_km.toFixed(1)} km`
      : null;
  const duration =
    offer.estimated_route_duration_minutes != null &&
    Number.isFinite(offer.estimated_route_duration_minutes)
      ? `${Math.round(offer.estimated_route_duration_minutes)} min`
      : null;
  const routeMeta = [distance, duration].filter(Boolean).join(' · ');

  return (
    <View style={styles.panel}>
      <Text style={styles.kicker}>Nueva oferta</Text>
      <Text style={styles.title}>
        {typeLabel} · {code}
      </Text>
      <MetaLine label="Recoger" value={offer.origin} />
      <MetaLine label="Entregar" value={offer.destination} />
      {routeMeta ? <Text style={styles.routeMeta}>{routeMeta}</Text> : null}

      <View style={styles.actions}>
        <View style={styles.actionFlex}>
          <RutafyButton
            label={isAccepting ? 'Aceptando…' : 'Aceptar'}
            onPress={onAccept}
            loading={isAccepting}
            disabled={disabled || isAccepting}
          />
        </View>
        <View style={styles.actionFlex}>
          <RutafyButton
            label="Rechazar"
            variant="secondary"
            onPress={onOmit}
            disabled={disabled || isAccepting}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.two,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  metaBlock: {
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
    lineHeight: 20,
  },
  routeMeta: {
    fontSize: 12,
    color: RutafyColors.textSecondary,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionFlex: {
    flex: 1,
  },
});
