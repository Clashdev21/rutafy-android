import { StyleSheet, View, type ViewProps } from 'react-native';

import { RutafyColors, RutafyRadius, RutafyShadow } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type RutafyHeroCardProps = ViewProps;

export function RutafyHeroCard({ style, children, ...rest }: RutafyHeroCardProps) {
  return (
    <View style={[styles.wrap, RutafyShadow.card, style]} {...rest}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RutafyRadius.card,
    overflow: 'hidden',
    backgroundColor: RutafyColors.brand,
  },
  inner: {
    padding: Spacing.four,
    gap: Spacing.two,
    backgroundColor: RutafyColors.brand,
  },
});
