import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackingSessionDetailRow } from '@/components/tracking/TrackingSessionDetailRow';
import { TrackingSessionStatusBadge } from '@/components/tracking/TrackingSessionStatusBadge';
import { TrackingSessionTimeline } from '@/components/tracking/TrackingSessionTimeline';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import { useTrackingSessionDetail } from '@/hooks/useTrackingSessionDetail';
import {
  buildTrackingTimeline,
  computeSessionDurationSeconds,
  formatAccuracyMeters,
  formatTrackingDuration,
  formatTrackingPurpose,
  formatTrackingStatus,
  formatTimestamp,
  shortTrackingSessionId,
} from '@/utils/trackingSessionFormat';

export default function TrackingSessionSummaryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const id = sessionId?.trim() ? String(sessionId) : null;
  const { session, loading, error, refresh } = useTrackingSessionDetail(id);

  const timeline = useMemo(
    () => (session ? buildTrackingTimeline(session) : []),
    [session],
  );

  const durationLabel = session
    ? formatTrackingDuration(computeSessionDurationSeconds(session))
    : '—';

  if (loading && !session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={RutafyColors.brand} size="large" />
      </View>
    );
  }

  if (error && !session) {
    return (
      <View style={[styles.center, styles.errorWrap]}>
        <Text style={styles.error}>{error}</Text>
        <RutafyButton label="Reintentar" onPress={() => void refresh()} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Sesión no encontrada.</Text>
      </View>
    );
  }

  const stats = session.stats;
  const pointCount = stats?.point_count;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, Spacing.four) + Spacing.four },
      ]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
      }>
      <RutafyCard style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Resumen operacional</Text>
            <Text style={styles.sessionId}>Sesión {shortTrackingSessionId(session.id)}</Text>
          </View>
          <TrackingSessionStatusBadge status={session.status} />
        </View>
        <Text style={styles.vehicle}>{session.vehicle_label || '—'}</Text>
      </RutafyCard>

      <RutafyCard style={styles.metricsCard}>
        <Text style={styles.sectionTitle}>Métricas</Text>
        <TrackingSessionDetailRow label="Tiempo total" value={durationLabel} />
        <TrackingSessionDetailRow label="Estado" value={formatTrackingStatus(session.status)} />
        <TrackingSessionDetailRow
          label="Propósito"
          value={formatTrackingPurpose(session.purpose)}
        />
        <TrackingSessionDetailRow
          label="Puntos GPS"
          value={pointCount != null ? String(pointCount) : '—'}
        />
        <TrackingSessionDetailRow
          label="Precisión promedio"
          value={formatAccuracyMeters(stats?.avg_accuracy_m)}
        />
        {stats?.max_accuracy_m != null ? (
          <TrackingSessionDetailRow
            label="Precisión máxima"
            value={formatAccuracyMeters(stats.max_accuracy_m)}
          />
        ) : null}
      </RutafyCard>

      <RutafyCard style={styles.metricsCard}>
        <Text style={styles.sectionTitle}>Detalle de sesión</Text>
        <TrackingSessionDetailRow label="Inicio" value={formatTimestamp(session.started_at)} />
        <TrackingSessionDetailRow
          label="Último heartbeat"
          value={formatTimestamp(session.last_heartbeat_at)}
        />
        <TrackingSessionDetailRow label="Cierre" value={formatTimestamp(session.ended_at)} />
        {session.actor_id ? (
          <TrackingSessionDetailRow label="Actor" value={session.actor_id} />
        ) : null}
      </RutafyCard>

      <RutafyCard style={styles.mapPlaceholder}>
        <Text style={styles.sectionTitle}>Recorrido</Text>
        <Text style={styles.mapHint}>
          Mapa con polyline disponible en una fase posterior. Los puntos del timeline reflejan las
          ubicaciones registradas cuando el backend las expone.
        </Text>
      </RutafyCard>

      <TrackingSessionTimeline events={timeline} />

      <Pressable
        style={styles.linkBtn}
        onPress={() => router.push('/captura-logistica/historial' as Href)}>
        <Text style={styles.linkBtnText}>Ver historial de capturas</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: RutafyColors.surfaceMuted,
  },
  errorWrap: { gap: Spacing.three },
  error: {
    fontSize: 14,
    color: RutafyColors.danger,
    textAlign: 'center',
  },
  headerCard: { gap: Spacing.two },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  headerText: { flex: 1, gap: 4 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  sessionId: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
  },
  vehicle: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
  },
  metricsCard: { gap: Spacing.two },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  mapPlaceholder: { gap: Spacing.two },
  mapHint: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
  },
  linkBtn: {
    borderWidth: 1,
    borderColor: RutafyColors.brand,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  linkBtnText: {
    fontWeight: '600',
    color: RutafyColors.brand,
  },
});
