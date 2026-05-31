import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.formWrap}>
          <ThemedText type="title" style={styles.title}>
            Rutafy
          </ThemedText>
          <ThemedText type="subtitle" style={styles.subtitle}>
            Entrar
          </ThemedText>

          <TextInput
            style={styles.input}
            placeholder="Teléfono"
            placeholderTextColor="#94A3B8"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!busy}
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="#94A3B8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            editable={!busy}
          />

          {displayError ? (
            <ThemedText style={styles.error} themeColor="textSecondary">
              {displayError}
            </ThemedText>
          ) : null}

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={() => void handleSubmit()}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.buttonLabel}>Entrar</ThemedText>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  formWrap: { gap: Spacing.three },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.two },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0F172A',
  },
  error: { textAlign: 'center' },
  button: {
    backgroundColor: '#2A9D8F',
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonLabel: { color: '#fff', fontWeight: '600' },
});
