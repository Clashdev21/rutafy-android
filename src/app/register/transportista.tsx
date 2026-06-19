import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/useAuth';
import { authScreenStyles as styles } from '@/constants/authScreenStyles';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { getHomeHrefForUser } from '@/utils/roles';

export default function RegisterTransportistaScreen() {
  const { registerTransportista, isLoading, isAuthenticated, user, error: authError } =
    useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [email, setEmail] = useState('');
  const [plate, setPlate] = useState('');
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
    if (!name.trim()) {
      setLocalError('Ingresa tu nombre');
      return;
    }
    if (!phone.trim()) {
      setLocalError('Ingresa tu teléfono');
      return;
    }
    if (!password.trim()) {
      setLocalError('Ingresa una contraseña');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden');
      return;
    }
    if (!companyName.trim()) {
      setLocalError('Ingresa el nombre de la empresa');
      return;
    }
    if (!docNumber.trim()) {
      setLocalError('Ingresa el número de documento');
      return;
    }

    setLocalError(null);
    setSubmitting(true);
    try {
      const me = await registerTransportista({
        name: name.trim(),
        phone: phone.trim(),
        password,
        company_name: companyName.trim(),
        doc_number: docNumber.trim(),
        email: email.trim() || undefined,
        plate: plate.trim() || undefined,
      });
      router.replace(getHomeHrefForUser(me));
    } catch {
      /* error en contexto o local */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeScroll}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[styles.inner, { paddingBottom: Spacing.four * 2 }]}
            keyboardShouldPersistTaps="handled">
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backLabel}>← Volver</Text>
            </Pressable>

            <View style={styles.hero}>
              <Text style={styles.cardTitle}>Cuenta transportista</Text>
              <Text style={styles.cardSubtitle}>
                Crea tu cuenta operativa para solicitar mensajería
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                placeholder="Tu nombre"
                placeholderTextColor={RutafyColors.textSecondary}
                value={name}
                onChangeText={setName}
                autoComplete="name"
                editable={!busy}
              />

              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 3001234567"
                placeholderTextColor={RutafyColors.textSecondary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!busy}
              />

              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={RutafyColors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                editable={!busy}
              />

              <Text style={styles.label}>Confirmar contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={RutafyColors.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                editable={!busy}
              />

              <Text style={styles.label}>Nombre de empresa</Text>
              <TextInput
                style={styles.input}
                placeholder="Razón social o nombre comercial"
                placeholderTextColor={RutafyColors.textSecondary}
                value={companyName}
                onChangeText={setCompanyName}
                editable={!busy}
              />

              <Text style={styles.label}>Número de documento</Text>
              <TextInput
                style={styles.input}
                placeholder="NIT / CC / documento"
                placeholderTextColor={RutafyColors.textSecondary}
                value={docNumber}
                onChangeText={setDocNumber}
                editable={!busy}
              />

              <Text style={styles.label}>Correo (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={RutafyColors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoComplete="email"
                editable={!busy}
              />

              <Text style={styles.label}>Placa (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: ABC123"
                placeholderTextColor={RutafyColors.textSecondary}
                value={plate}
                onChangeText={setPlate}
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
                  <Text style={styles.buttonLabel}>Crear cuenta</Text>
                )}
              </Pressable>
            </View>

            <Pressable
              style={styles.linkRow}
              onPress={() => router.replace('/login' as Href)}>
              <Text style={styles.linkText}>
                ¿Ya tienes cuenta? <Text style={styles.linkAction}>Iniciar sesión</Text>
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
