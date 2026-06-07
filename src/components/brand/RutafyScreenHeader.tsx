import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { RutafyColors, RutafyTypography } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
};

export function RutafyScreenHeader({ title, subtitle, showLogo = false }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, Spacing.three) }]}>
      {showLogo ? <RutafyLogo variant="icon" iconSize={40} style={styles.logo} /> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    backgroundColor: RutafyColors.white,
    borderBottomWidth: 1,
    borderBottomColor: RutafyColors.border,
  },
  logo: { marginBottom: Spacing.two },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: RutafyColors.navy,
    fontFamily: RutafyTypography.fontFamilyBold,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: RutafyColors.textSecondary,
    fontFamily: RutafyTypography.fontFamily,
  },
});
