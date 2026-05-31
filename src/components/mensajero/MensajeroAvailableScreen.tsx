import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Props = {
  onToggleOffline: () => void;
  onLogout?: () => void;
  loading?: boolean;
  disabled?: boolean;
};

export function MensajeroAvailableScreen({
  onToggleOffline,
  onLogout,
  loading,
  disabled,
}: Props) {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.topBar}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>En línea</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable
              onPress={onToggleOffline}
              disabled={disabled || loading}
              style={styles.offlineLink}>
              <Text style={styles.offlineLinkText}>Pasar a offline</Text>
            </Pressable>
            {onLogout ? (
              <Pressable onPress={onLogout}>
                <Text style={styles.logoutText}>Salir</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.center}>
        <View style={styles.radar}>
          <View style={styles.radarRing} />
          <View style={styles.radarDot} />
        </View>
        <Text style={styles.title}>Buscando servicios para ti</Text>
        <Text style={styles.subtitle}>Te avisaremos en cuanto aparezca una oferta</Text>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <RutafyButton
          label="Pasar a offline"
          variant="secondary"
          onPress={onToggleOffline}
          loading={loading}
          disabled={disabled}
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
  safe: { paddingHorizontal: Spacing.four },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  badge: {
    backgroundColor: RutafyColors.brandTint,
    borderWidth: 1,
    borderColor: RutafyColors.brandTintBorder,
    borderRadius: RutafyRadius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  badgeText: {
    color: RutafyColors.brand,
    fontSize: 12,
    fontWeight: '600',
  },
  topActions: { alignItems: 'flex-end', gap: Spacing.one },
  offlineLink: { paddingVertical: Spacing.one },
  offlineLinkText: {
    color: RutafyColors.brand,
    fontSize: 12,
    fontWeight: '600',
  },
  logoutText: {
    color: RutafyColors.textSecondary,
    fontSize: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  radar: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: RutafyColors.brandTint,
    borderWidth: 4,
    borderColor: 'rgba(42,157,143,0.15)',
  },
  radarDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: RutafyColors.brand,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: RutafyColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
});
