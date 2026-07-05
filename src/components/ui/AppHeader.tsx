import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/theme/spacing';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppHeader({ title, subtitle, right, style }: Props) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.copy}>
        <AppText variant="title">{title}</AppText>
        {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.base,
    marginBottom: spacing.base,
  },
  copy: { flex: 1, gap: spacing.xs },
});
