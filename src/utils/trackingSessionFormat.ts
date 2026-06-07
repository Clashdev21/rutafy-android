import type {
  TrackingSession,
  TrackingSessionDetail,
  TrackingSessionPurpose,
  TrackingSessionStatus,
  TrackingTimelineEvent,
} from '@/types/tracking';

export const TRACKING_PURPOSE_LABELS: Record<TrackingSessionPurpose, string> = {
  operacion_interna: 'Operación interna',
  traslado_variante: 'Traslado variante',
  puerto: 'Puerto',
  patio: 'Patio',
  terminal: 'Terminal',
};

export const TRACKING_STATUS_LABELS: Record<TrackingSessionStatus, string> = {
  active: 'Activa',
  ended: 'Finalizada',
  abandoned: 'Abandonada',
};

export function shortTrackingSessionId(id: string): string {
  const compact = id.replace(/-/g, '');
  return compact.length > 8 ? compact.slice(0, 8) : compact;
}

export function formatTrackingPurpose(purpose: TrackingSessionPurpose): string {
  return TRACKING_PURPOSE_LABELS[purpose] ?? purpose;
}

export function formatTrackingStatus(status: TrackingSessionStatus): string {
  return TRACKING_STATUS_LABELS[status] ?? status;
}

export function formatTrackingDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}h ${rem}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

export function computeSessionDurationSeconds(session: TrackingSession): number {
  if (!session.started_at) return 0;
  const started = new Date(session.started_at).getTime();
  if (!Number.isFinite(started)) return 0;
  const endSource = session.ended_at ?? (session.status === 'active' ? new Date().toISOString() : null);
  if (!endSource) return 0;
  const ended = new Date(endSource).getTime();
  if (!Number.isFinite(ended)) return 0;
  return Math.max(0, Math.floor((ended - started) / 1000));
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString();
}

export function formatAccuracyMeters(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} m`;
}

export function buildTrackingTimeline(session: TrackingSessionDetail): TrackingTimelineEvent[] {
  const events: TrackingTimelineEvent[] = [];

  if (session.started_at) {
    events.push({
      id: 'started',
      kind: 'session_start',
      label: 'Inicio de captura',
      at: session.started_at,
    });
  }

  if (session.consent_at && session.consent_at !== session.started_at) {
    events.push({
      id: 'consent',
      kind: 'consent',
      label: 'Consentimiento registrado',
      at: session.consent_at,
    });
  }

  const points = [...(session.recent_points ?? [])].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
  );

  for (const point of points) {
    const accuracy =
      point.accuracy_m != null && Number.isFinite(point.accuracy_m)
        ? ` · ±${point.accuracy_m.toFixed(0)} m`
        : '';
    const state = point.app_state ? ` · ${point.app_state}` : '';
    events.push({
      id: `point-${point.captured_at}`,
      kind: 'point',
      label: 'Punto GPS registrado',
      at: point.captured_at,
      detail: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}${accuracy}${state}`,
    });
  }

  if (session.last_heartbeat_at) {
    events.push({
      id: 'heartbeat',
      kind: 'heartbeat',
      label: 'Último heartbeat',
      at: session.last_heartbeat_at,
    });
  }

  if (session.ended_at) {
    events.push({
      id: 'ended',
      kind: 'session_end',
      label: 'Cierre de sesión',
      at: session.ended_at,
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
