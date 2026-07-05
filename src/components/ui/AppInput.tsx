import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

type Props = TextInputProps & {
  error?: boolean;
};

export function AppInput({ style, error, placeholderTextColor, ...rest }: Props) {
  return (
    <TextInput
      style={[styles.input, error && styles.inputError, style]}
      placeholderTextColor={placeholderTextColor ?? colors.subtitle}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
  },
  inputError: {
    borderColor: colors.danger,
  },
});
