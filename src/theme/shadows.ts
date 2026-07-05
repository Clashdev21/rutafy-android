import { Platform, type ViewStyle } from 'react-native';

import { colors } from '@/theme/colors';

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

function shadow(
  offsetY: number,
  opacity: number,
  radius: number,
  elevation: number,
): ShadowStyle {
  return Platform.select({
    ios: {
      shadowColor: colors.navyMuted,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: { elevation },
    default: {
      shadowColor: colors.navyMuted,
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
  }) as ShadowStyle;
}

export const shadowStyles = {
  sm: shadow(1, 0.06, 4, 2),
  md: shadow(2, 0.08, 8, 4),
  lg: shadow(4, 0.12, 16, 8),
} as const;
