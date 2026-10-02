import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  APP_ENV,
  STAGING_BADGE_LABEL,
  shouldShowEnvironmentBadge,
} from '@/config/appEnv'
import { RutafyColors, RutafyTypography } from '@/constants/rutafyTheme'

/**
 * Indicador persistente de staging. Overlay absoluto, sin captura de toques.
 */
export function EnvironmentBadge () {
  const insets = useSafeAreaInsets()

  if (!shouldShowEnvironmentBadge(APP_ENV)) return null

  return (
    <View
      pointerEvents="none"
      style={[styles.layer, { paddingTop: insets.top + 6 }]}
    >
      <View style={styles.pill} accessibilityRole="text">
        <Text style={styles.label}>{STAGING_BADGE_LABEL}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  pill: {
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  label: {
    color: RutafyColors.white,
    fontSize: 10,
    letterSpacing: 0.6,
    fontFamily: RutafyTypography.fontFamilySemiBold,
  },
})
