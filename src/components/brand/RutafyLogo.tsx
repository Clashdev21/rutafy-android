import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { brandImages, LOGO_FULL_ASPECT_RATIO } from '@/constants/brandAssets';
import { spacing } from '@/theme/spacing';

type Variant = 'icon' | 'full' | 'stack';

type Props = {
  variant?: Variant;
  /** Alto del isotipo o wordmark según variante. */
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
};

export function RutafyLogo({
  variant = 'full',
  iconSize = 56,
  style,
}: Props) {
  if (variant === 'stack') {
    const isotypeSize = iconSize;
    const wordmarkHeight = Math.round(iconSize * 0.42);
    const wordmarkWidth = Math.round(wordmarkHeight * LOGO_FULL_ASPECT_RATIO);

    return (
      <View style={[styles.stack, style]}>
        <Image
          source={brandImages.logoIcon}
          style={{
            width: isotypeSize,
            height: isotypeSize,
            borderRadius: Math.round(isotypeSize * 0.22),
          }}
          contentFit="contain"
          accessibilityLabel="Rutafy isotipo"
        />
        <Image
          source={brandImages.logoFull}
          style={{ width: wordmarkWidth, height: wordmarkHeight, marginTop: spacing.md }}
          contentFit="contain"
          accessibilityLabel="Rutafy"
        />
      </View>
    );
  }

  if (variant === 'icon') {
    return (
      <Image
        source={brandImages.logoIcon}
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: Math.round(iconSize * 0.22),
        }}
        contentFit="contain"
        accessibilityLabel="Rutafy"
      />
    );
  }

  const fullHeight = iconSize;
  const fullWidth = Math.round(fullHeight * LOGO_FULL_ASPECT_RATIO);

  return (
    <Image
      source={brandImages.logoFull}
      style={[
        styles.fullLogo,
        { width: fullWidth, height: fullHeight },
        style as object,
      ]}
      contentFit="contain"
      accessibilityLabel="Rutafy"
    />
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center' },
  fullLogo: { maxWidth: '100%' },
});
