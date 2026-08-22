import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';

type Props = {
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  rightValue?: string;
  showChevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

/** Fila de ajustes / navegación — hit target ≥ 44px. */
export function SettingsRow({
  title,
  subtitle,
  icon,
  rightValue,
  showChevron = true,
  onPress,
  disabled,
}: Props) {
  const content = (
    <>
      {icon ? (
        <View style={styles.iconWrap}>
          <AppIcon name={icon} size={22} color={colors.navy} />
        </View>
      ) : null}
      <View style={styles.copy}>
        <AppText variant="bodyMedium" style={styles.title}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.subtitle} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {rightValue ? (
        <AppText variant="caption" color={colors.subtitle} style={styles.right}>
          {rightValue}
        </AppText>
      ) : null}
      {showChevron && onPress ? (
        <AppIcon name="chevron_right" size={20} color={colors.subtitle} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.92 },
  disabled: { opacity: 0.55 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  title: { color: colors.textPrimary },
  right: { maxWidth: 96, textAlign: 'right' },
});
