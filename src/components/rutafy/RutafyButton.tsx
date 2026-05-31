import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'danger';

type RutafyButtonProps = PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function RutafyButton({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  disabled,
  style,
  ...rest
}: RutafyButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      disabled={isDisabled}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? RutafyColors.textPrimary : '#fff'} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' && styles.labelPrimary,
            variant === 'secondary' && styles.labelSecondary,
            variant === 'danger' && styles.labelDanger,
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: RutafyColors.brand },
  secondary: {
    backgroundColor: RutafyColors.white,
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
  },
  danger: { backgroundColor: RutafyColors.danger },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.55 },
  label: { fontSize: 16, fontWeight: '600' },
  labelPrimary: { color: RutafyColors.white },
  labelSecondary: { color: RutafyColors.textPrimary },
  labelDanger: { color: RutafyColors.white },
});
