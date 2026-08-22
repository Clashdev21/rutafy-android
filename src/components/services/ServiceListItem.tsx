import { Pressable, StyleSheet, View } from 'react-native';

import {
  formatServiceRelativeTime,
  formatServiceTypeLabel,
  getServiceCode,
} from '@/components/mensajero/serviceDisplay';
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
  /** Solo mostrar si hay valor real (no inventar ETA). */
  etaLabel?: string;
  distanceLabel?: string;
};

export function ServiceListItem({ service, onPress, etaLabel, distanceLabel }: Props) {
  const typeLabel = formatServiceTypeLabel(service.service_type);
  const code = getServiceCode(service);
  const relative =
    formatServiceRelativeTime(service.updated_at) ??
    formatServiceRelativeTime(service.created_at);
  const hasMeta = Boolean(etaLabel || distanceLabel);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${typeLabel} ${code}`}>
      <View style={styles.header}>
        <View style={styles.codeWrap}>
          <AppText variant="overline" color={colors.subtitle}>
            {typeLabel}
          </AppText>
          <AppText variant="heading" style={styles.code}>
            {code}
          </AppText>
        </View>
        <AppBadge status={service.status} label={getStatusLabel(service.status)} />
      </View>

      <View style={styles.route}>
        <View style={styles.routeRow}>
          <View style={[styles.dot, styles.dotOrigin]} />
          <View style={styles.routeCopy}>
            <AppText variant="overline">Recoger</AppText>
            <AppText variant="bodyMedium" numberOfLines={2}>
              {service.origin}
            </AppText>
          </View>
        </View>
        <View style={styles.connector} />
        <View style={styles.routeRow}>
          <View style={[styles.dot, styles.dotDest]} />
          <View style={styles.routeCopy}>
            <AppText variant="overline">Entregar</AppText>
            <AppText variant="bodyMedium" numberOfLines={2}>
              {service.destination}
            </AppText>
          </View>
        </View>
      </View>

      {hasMeta ? (
        <View style={styles.metaRow}>
          {etaLabel ? (
            <MetaChip icon="schedule" label="ETA" value={etaLabel} />
          ) : null}
          {distanceLabel ? (
            <MetaChip icon="distance" label="Distancia" value={distanceLabel} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.footer}>
        <AppText variant="caption" color={colors.subtitle}>
          {getStatusLabel(service.status)}
          {relative ? ` · ${relative}` : ''}
        </AppText>
        {onPress ? (
          <View style={styles.footerCta}>
            <AppText variant="bodyMedium" color={colors.primary}>
              Ver
            </AppText>
            <AppIcon name="chevron_right" size={18} color={colors.primary} />
          </View>
        ) : null}
      </View>
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
  route: { gap: 0 },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  routeCopy: { flex: 1, gap: 2 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  dotOrigin: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  dotDest: {
    backgroundColor: colors.primary,
  },
  connector: {
    width: 2,
    height: 12,
    marginLeft: 4,
    backgroundColor: colors.border,
  },
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  footerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
