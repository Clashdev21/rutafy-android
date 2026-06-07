import { Image } from 'expo-image';
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { brandImages } from '@/constants/brandAssets';
import { RutafyColors, RutafyTypography } from '@/constants/rutafyTheme';

type Props = {
  variant?: 'icon' | 'full';
  theme?: 'light' | 'dark';
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
};

export function RutafyLogo({
  variant = 'full',
  theme = 'light',
  iconSize = 56,
  style,
}: Props) {
  const isDark = theme === 'dark';
  const titleColor = isDark ? RutafyColors.white : RutafyColors.navy;
  const taglineColor = isDark ? RutafyColors.brandLight : RutafyColors.textSecondary;

  const iconStyle: StyleProp<ImageStyle> = {
    width: iconSize,
    height: iconSize,
    borderRadius: 14,
  };

  if (variant === 'icon') {
    return (
      <Image
        source={brandImages.logoIcon}
        style={iconStyle}
        contentFit="contain"
        accessibilityLabel="Rutafy"
      />
    );
  }

  return (
    <View style={[styles.full, style]}>
      <Image
        source={brandImages.logoIcon}
        style={iconStyle}
        contentFit="contain"
        accessibilityLabel="Rutafy"
      />
      <View style={styles.copy}>
        <Text
          style={[
            styles.title,
            { color: titleColor, fontFamily: RutafyTypography.fontFamilyBold },
          ]}>
          Rutafy
        </Text>
        <Text
          style={[
            styles.tagline,
            { color: taglineColor, fontFamily: RutafyTypography.fontFamilyMedium },
          ]}>
          Logística operativa
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  copy: { gap: 2 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
  },
});
