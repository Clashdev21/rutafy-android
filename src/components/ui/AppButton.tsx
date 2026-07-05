import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      disabled={isDisabled}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.textPrimary : colors.white} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' && styles.labelOnDark,
            variant === 'secondary' && styles.labelPrimary,
            variant === 'danger' && styles.labelOnDark,
            variant === 'ghost' && styles.labelPrimary,
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
  label: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  labelOnDark: { color: colors.white },
  labelPrimary: { color: colors.textPrimary },
});
