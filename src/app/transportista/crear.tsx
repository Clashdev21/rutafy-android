import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTransportistaServicesContext } from '@/contexts/TransportistaServicesContext';
import { Spacing } from '@/constants/theme';
import * as transportistaService from '@/services/transportistaService';
import { getApiErrorMessage } from '@/utils/errors';

export default function TransportistaCrearScreen() {
  const { user } = useAuth();
  const { refresh } = useTransportistaServicesContext();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyId = user?.actor_id?.trim() ?? '';

  const handleCreate = async () => {
    if (!companyId) {
      setError('No hay actor_id en la sesión para crear servicios.');
      return;
    }
    if (!origin.trim() || !destination.trim()) {
      setError('Ingresa origen y destino.');
      return;
    }
    if (origin.trim() === destination.trim()) {
      setError('Origen y destino no pueden ser iguales.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await transportistaService.createServiceMinimal({
        requester_company_id: companyId,
        service_type: 'DOCS',
        request_mode: 'NOW',
        origin: origin.trim(),
        destination: destination.trim(),
      });
      await refresh();
      router.back();
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudo crear el servicio'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.form}>
        <ThemedText type="small" themeColor="textSecondary">
          Servicio inmediato (NOW) · tipo DOCS
        </ThemedText>

        <TextInput
          style={styles.input}
          placeholder="Origen"
          placeholderTextColor="#94A3B8"
          value={origin}
          onChangeText={setOrigin}
          editable={!submitting}
        />
        <TextInput
          style={styles.input}
          placeholder="Destino"
          placeholderTextColor="#94A3B8"
          value={destination}
          onChangeText={setDestination}
          editable={!submitting}
        />

        {error ? (
          <ThemedText themeColor="textSecondary" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={() => void handleCreate()}
          disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonLabel}>Crear servicio</ThemedText>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
  form: { gap: Spacing.three },
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
  },
  buttonDisabled: { opacity: 0.7 },
  buttonLabel: { color: '#fff', fontWeight: '600' },
});
