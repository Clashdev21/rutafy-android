import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { shadowStyles } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  muted?: boolean;
};

export function AppCard({ children, style, elevated = true, muted = false }: Props) {
  return (
    <View
      style={[
        styles.card,
        elevated && shadowStyles.sm,
        muted && styles.muted,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  muted: {
    backgroundColor: colors.surfaceMuted,
  },
});
