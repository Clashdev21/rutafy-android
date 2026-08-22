import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

type Props = {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SettingsSection({ title, children, style }: Props) {
  return (
    <View style={[styles.section, style]}>
      <AppText variant="overline" color={colors.subtitle} style={styles.title}>
        {title}
      </AppText>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.xs },
  list: { gap: spacing.sm },
});
