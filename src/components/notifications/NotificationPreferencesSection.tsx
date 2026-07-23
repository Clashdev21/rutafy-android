import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '@/services/notificationsInboxService';
import { trackCommunicationsEvent } from '@/services/communicationsAnalytics';
import type { NotificationPreferences } from '@/types/notificationsInbox';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { getApiErrorMessage } from '@/utils/errors';

type ToggleKey =
  | 'offers_enabled'
  | 'service_updates_enabled'
  | 'tracking_alerts_enabled'
  | 'reminders_enabled'
  | 'promotions_enabled';

const TOGGLES: Array<{ key: ToggleKey; label: string; description: string }> = [
  {
    key: 'offers_enabled',
    label: 'Ofertas',
    description: 'Nuevas solicitudes y ofertas de despacho',
  },
  {
    key: 'service_updates_enabled',
    label: 'Servicios',
    description: 'Actualizaciones del estado de tus servicios',
  },
  {
    key: 'tracking_alerts_enabled',
    label: 'Tracking',
    description: 'Alertas operativas de captura y seguimiento',
  },
  {
    key: 'reminders_enabled',
    label: 'Recordatorios',
    description: 'Recordatorios de tareas y vencimientos',
  },
  {
    key: 'promotions_enabled',
    label: 'Promociones',
    description: 'Novedades comerciales y campañas',
  },
];

function boolOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ToggleKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotificationPreferences();
      setPrefs(data);
    } catch (e) {
      setError(getApiErrorMessage(e, 'No se pudieron cargar preferencias'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = useCallback(
    async (key: ToggleKey, nextValue: boolean) => {
      if (!prefs) return;
      const previous = prefs;
      const optimistic = { ...prefs, [key]: nextValue };
      setPrefs(optimistic);
      setSavingKey(key);
      setError(null);
      try {
        const saved = await updateNotificationPreferences({ [key]: nextValue });
        setPrefs(saved);
        trackCommunicationsEvent('notification_preferences_changed', {
          key,
          value: nextValue,
        });
      } catch (e) {
        setPrefs(previous);
        setError(getApiErrorMessage(e, 'No se pudo guardar la preferencia'));
      } finally {
        setSavingKey(null);
      }
    },
    [prefs],
  );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Preferencias de notificaciones</Text>
      <Text style={styles.body}>
        Controla qué mensajes quieres recibir. Las alertas críticas no se pueden desactivar.
      </Text>

      {loading ? <ActivityIndicator color={RutafyColors.brand} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && prefs
        ? TOGGLES.map((toggle) => {
            const value = boolOrDefault(prefs[toggle.key], true);
            const disabled = savingKey === toggle.key;
            return (
              <View key={toggle.key} style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>{toggle.label}</Text>
                  <Text style={styles.rowBody}>{toggle.description}</Text>
                </View>
                <Switch
                  value={value}
                  disabled={disabled}
                  onValueChange={(next) => void onToggle(toggle.key, next)}
                  trackColor={{ false: RutafyColors.borderMuted, true: RutafyColors.brand }}
                />
              </View>
            );
          })
        : null}

      {!loading && prefs?.critical_alerts_enabled === false ? null : (
        <Text style={styles.criticalNote}>Alertas críticas: siempre activas</Text>
      )}

      {error ? (
        <Pressable onPress={() => void load()}>
          <Text style={styles.retry}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: RutafyColors.borderMuted,
    borderRadius: RutafyRadius.card,
    backgroundColor: RutafyColors.white,
    marginTop: Spacing.two,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.navy,
  },
  body: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  copy: { flex: 1, gap: 2 },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
  },
  rowBody: {
    fontSize: 12,
    color: RutafyColors.textSecondary,
  },
  criticalNote: {
    fontSize: 12,
    color: RutafyColors.textSecondary,
  },
  error: { fontSize: 13, color: RutafyColors.danger },
  retry: {
    fontSize: 13,
    fontWeight: '600',
    color: RutafyColors.brand,
  },
});
