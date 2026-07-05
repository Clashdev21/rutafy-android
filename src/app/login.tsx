import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { AppButton, AppCard, AppInput, AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { getHomeHrefForUser } from '@/utils/roles';

export default function LoginScreen() {
  const { login, isLoading, isAuthenticated, user, error: authError } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const busy = isLoading || submitting;
  const displayError = localError ?? authError;

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      router.replace(getHomeHrefForUser(user));
    }
  }, [isLoading, isAuthenticated, user]);

  const handleSubmit = async () => {
    if (!phone.trim() || !password.trim()) {
      setLocalError('Ingresa teléfono y contraseña');
      return;
    }

    setLocalError(null);
    setSubmitting(true);
    try {
      const me = await login({ phone, password });
      router.replace(getHomeHrefForUser(me));
    } catch {
      /* error ya en context o local */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.inner}>
          <View style={styles.hero}>
            <RutafyLogo variant="stack" iconSize={72} />
            <AppText variant="heading" style={styles.title}>
              Acceso operativo
            </AppText>
          </View>

          <AppCard style={styles.card}>
            <AppInput
              placeholder="Teléfono"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!busy}
            />
            <AppInput
              placeholder="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              editable={!busy}
            />

            {displayError ? (
              <AppText variant="caption" color={colors.danger} style={styles.error}>
                {displayError}
              </AppText>
            ) : null}

            <AppButton
              label="Entrar"
              loading={busy}
              disabled={busy}
              onPress={() => void handleSubmit()}
            />

            <Pressable style={styles.linkRow} onPress={() => router.push('/register' as Href)}>
              <AppText variant="caption" style={styles.linkText}>
                ¿No tienes cuenta?{' '}
                <AppText variant="caption" color={colors.primary}>
                  Crear cuenta
                </AppText>
              </AppText>
            </Pressable>
          </AppCard>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  inner: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing['2xl'],
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.base,
  },
  title: { textAlign: 'center' },
  card: { gap: spacing.md },
  error: { textAlign: 'center' },
  linkRow: { alignItems: 'center', marginTop: spacing.xs },
  linkText: { textAlign: 'center' },
});
