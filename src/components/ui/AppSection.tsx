import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/theme/spacing';

type Props = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AppSection({ title, subtitle, children, style }: Props) {
  return (
    <View style={[styles.section, style]}>
      {title ? <AppText variant="heading">{title}</AppText> : null}
      {subtitle ? (
        <AppText variant="caption" style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  subtitle: { marginTop: -spacing.xs },
});
