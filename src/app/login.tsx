import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { RutafyLogo } from '@/components/brand/RutafyLogo';
import { authScreenStyles as styles } from '@/constants/authScreenStyles';
import { RutafyColors } from '@/constants/rutafyTheme';
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

            <Pressable
              style={styles.linkRow}
              onPress={() => router.push('/register' as Href)}>
              <Text style={styles.linkText}>
                ¿No tienes cuenta? <Text style={styles.linkAction}>Crear cuenta</Text>
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
