import { Pressable, StyleSheet, View } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppIcon } from '@/components/ui/AppIcon';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { shadowStyles } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { Service } from '@/types/service';
import { getStatusLabel } from '@/utils/serviceStatus';

type Props = {
  service: Service;
  onPress?: () => void;
  etaLabel?: string;
  distanceLabel?: string;
};

export function ServiceListItem({ service, onPress, etaLabel, distanceLabel }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}>
      <View style={styles.header}>
        <View style={styles.codeWrap}>
          <AppText variant="overline">Contenedor</AppText>
          <AppText variant="heading" style={styles.code}>
            {service.service_code}
          </AppText>
        </View>
        <AppBadge status={service.status} label={getStatusLabel(service.status)} />
      </View>

      <View style={styles.metaRow}>
        {etaLabel ? (
          <MetaChip icon="schedule" label="ETA" value={etaLabel} />
        ) : null}
        {distanceLabel ? (
          <MetaChip icon="distance" label="Distancia" value={distanceLabel} />
        ) : null}
      </View>

      <View style={styles.route}>
        <AppText variant="caption" numberOfLines={1}>
          {service.origin}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          → {service.destination}
        </AppText>
      </View>

      {onPress ? (
        <View style={styles.footer}>
          <AppText variant="bodyMedium" color={colors.primary}>
            Ver detalle
          </AppText>
          <AppIcon name="chevron_right" size={18} color={colors.primary} />
        </View>
      ) : null}
    </Pressable>
  );
}

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: 'schedule' | 'distance';
  label: string;
  value: string;
}) {
  return (
    <View style={styles.chip}>
      <AppIcon name={icon} size={16} color={colors.subtitle} />
      <View>
        <AppText variant="overline">{label}</AppText>
        <AppText variant="bodyMedium">{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.base,
    gap: spacing.md,
    backgroundColor: colors.surface,
    ...shadowStyles.sm,
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  codeWrap: { flex: 1, gap: 2 },
  code: { fontSize: 18 },
  metaRow: { flexDirection: 'row', gap: spacing.base, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  route: { gap: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});
