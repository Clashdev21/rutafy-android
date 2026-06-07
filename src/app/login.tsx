import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { RutafyColors, RutafyRadius, RutafyShadow, RutafyTypography } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
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
            <RutafyLogo variant="full" iconSize={52} />
            <Text style={styles.heroText}>
              Plataforma logística para operación en campo, terminales y rutas.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Acceso operativo</Text>
            <Text style={styles.cardSubtitle}>Ingresa con tu cuenta de mensajero o transportista</Text>

            <TextInput
              style={styles.input}
              placeholder="Teléfono"
              placeholderTextColor={RutafyColors.textSecondary}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!busy}
            />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor={RutafyColors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              editable={!busy}
            />

            {displayError ? <Text style={styles.error}>{displayError}</Text> : null}

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={() => void handleSubmit()}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator color={RutafyColors.white} />
              ) : (
                <Text style={styles.buttonLabel}>Entrar</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: RutafyColors.loginBackground,
  },
  safe: { flex: 1, justifyContent: 'center' },
  inner: {
    padding: Spacing.four,
    gap: Spacing.four,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: RutafyColors.textSecondary,
    fontFamily: RutafyTypography.fontFamily,
  },
  card: {
    backgroundColor: RutafyColors.white,
    borderRadius: RutafyRadius.card,
    padding: Spacing.four,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    ...RutafyShadow.card,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: RutafyColors.navy,
    fontFamily: RutafyTypography.fontFamilyBold,
  },
  cardSubtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    marginBottom: Spacing.one,
    fontFamily: RutafyTypography.fontFamily,
  },
  input: {
    borderWidth: 1,
    borderColor: RutafyColors.border,
    borderRadius: RutafyRadius.button,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    backgroundColor: RutafyColors.white,
    color: RutafyColors.textPrimary,
    fontFamily: RutafyTypography.fontFamily,
  },
  error: {
    textAlign: 'center',
    color: RutafyColors.danger,
    fontSize: 14,
    fontFamily: RutafyTypography.fontFamily,
  },
  button: {
    backgroundColor: RutafyColors.brand,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonLabel: {
    color: RutafyColors.white,
    fontWeight: '600',
    fontSize: 16,
    fontFamily: RutafyTypography.fontFamilySemiBold,
  },
});
