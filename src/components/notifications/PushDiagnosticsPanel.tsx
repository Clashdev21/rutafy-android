import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { formatPushDiagTime, usePushDiagnostics } from '@/hooks/usePushDiagnostics';
import { retryPushRegistrationManual } from '@/services/pushRegistration';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';

export function PushDiagnosticsPanel() {
  const { user } = useAuth();
  const { events, state, permissionStatus, storedTokenPrefix, projectIdOk, refresh } =
    usePushDiagnostics(5000);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryPushRegistrationManual(user);
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Diagnóstico Push</Text>
      <Text style={styles.body}>
        Estado del registro de dispositivo para notificaciones Expo/FCM.
      </Text>

      <Text style={styles.row}>Permiso notificaciones: {permissionStatus}</Text>
      <Text style={styles.row}>Project ID: {projectIdOk ? 'OK' : 'Faltante'}</Text>
      <Text style={styles.row}>
        Expo token: {storedTokenPrefix ?? state?.lastTokenPrefix ?? 'no disponible'}
      </Text>
      <Text style={styles.row}>Actor ID: {state?.lastActorId ?? user?.actor_id ?? '—'}</Text>
      <Text style={styles.row}>
        Actor type: {state?.lastActorType ?? user?.actor_type ?? user?.appRole ?? '—'}
      </Text>
      <Text style={styles.row}>
        Último intento: {formatPushDiagTime(state?.lastPushRegisterAttemptAt)}
      </Text>
      <Text style={styles.row}>
        Último éxito: {formatPushDiagTime(state?.lastPushRegisterSuccessAt)}
      </Text>
      <Text style={styles.row}>
        Último HTTP: {state?.lastHttpStatus != null ? String(state.lastHttpStatus) : '—'}
      </Text>
      <Text style={styles.row}>
        Último error: {state?.lastPushRegisterError ?? '—'}
      </Text>

      <Pressable
        style={[styles.button, retrying && styles.disabled]}
        onPress={() => void handleRetry()}
        disabled={retrying}>
        {retrying ? (
          <ActivityIndicator color={RutafyColors.white} />
        ) : (
          <Text style={styles.buttonText}>Reintentar registro push</Text>
        )}
      </Pressable>

      <Text style={styles.subtitle}>Timeline ({events.length})</Text>
      {events.length === 0 ? (
        <Text style={styles.caption}>Sin eventos push registrados todavía.</Text>
      ) : (
        events
          .slice()
          .reverse()
          .slice(0, 8)
          .map((ev) => (
            <Text key={`${ev.timestamp}-${ev.type}`} style={styles.caption}>
              {formatPushDiagTime(ev.timestamp)} · {ev.type}
            </Text>
          ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: RutafyRadius.card,
    backgroundColor: RutafyColors.white,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.navy,
  },
  subtitle: {
    marginTop: Spacing.one,
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.navy,
  },
  body: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  row: {
    fontSize: 13,
    color: RutafyColors.textPrimary,
  },
  caption: {
    fontSize: 12,
    color: RutafyColors.textSecondary,
  },
  button: {
    marginTop: Spacing.one,
    backgroundColor: RutafyColors.brand,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  buttonText: {
    color: RutafyColors.white,
    fontWeight: '600',
  },
  disabled: { opacity: 0.7 },
});
