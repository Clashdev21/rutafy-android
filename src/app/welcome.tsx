import { type Href, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { AppButton, AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>
          <View style={styles.hero}>
            <RutafyLogo variant="stack" iconSize={96} />
            <View style={styles.divider} />
            <AppText variant="bodyMedium" style={styles.tagline}>
              Logística conectada{'\n'}en tiempo real
            </AppText>
          </View>

          <View style={styles.actions}>
            <AppButton label="Iniciar sesión" onPress={() => router.push('/login' as Href)} />
            <AppButton
              label="Crear cuenta"
              variant="secondary"
              onPress={() => router.push('/register' as Href)}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['4xl'],
    paddingBottom: spacing['3xl'],
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingTop: spacing['2xl'],
  },
  divider: {
    width: 48,
    height: 2,
    backgroundColor: colors.border,
    borderRadius: 1,
  },
  tagline: {
    textAlign: 'center',
    color: colors.subtitle,
    lineHeight: 26,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.base,
  },
});
