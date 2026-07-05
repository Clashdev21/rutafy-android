import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

type Props = {
  icon?: AppIconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
};

export function AppEmptyState({
  icon = 'inbox',
  title,
  description,
  actionLabel,
  onAction,
  loading,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <AppIcon name={icon} size={32} color={colors.primary} />
      </View>
      <AppText variant="heading" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" style={styles.description}>
        {description}
      </AppText>
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          variant="secondary"
          loading={loading}
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(22,163,74,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { textAlign: 'center' },
  description: { textAlign: 'center', color: colors.subtitle },
  action: { marginTop: spacing.sm, minWidth: 180 },
});
