import { StyleSheet, View, type ViewProps } from 'react-native';

import { RutafyColors, RutafyRadius, RutafyShadow } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type RutafyCardProps = ViewProps & {
  padded?: boolean;
};

export function RutafyCard({ style, padded = true, children, ...rest }: RutafyCardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    ...RutafyShadow.card,
  },
  padded: {
    padding: Spacing.four,
  },
});
