import { apiClient } from '@/api/client';
import { TRACKING_SESSION_ENDPOINTS } from '@/api/endpoints';
import type {
  TrackingPoint,
  TrackingPointInput,
  TrackingSession,
  TrackingSessionDetail,
  TrackingSessionPurpose,
  TrackingSessionStats,
} from '@/types/tracking';

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function pickNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeStats(raw: unknown): TrackingSessionStats | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const point_count =
    pickNum(row.point_count) ?? pickNum(row.points_count) ?? pickNum(row.total_points);
  const avg_accuracy_m =
    pickNum(row.avg_accuracy_m) ??
    pickNum(row.avg_accuracy) ??
    pickNum(row.average_accuracy_m);
  const max_accuracy_m =
    pickNum(row.max_accuracy_m) ?? pickNum(row.max_accuracy) ?? pickNum(row.max_acc);
  if (point_count == null && avg_accuracy_m == null && max_accuracy_m == null) {
    return undefined;
  }
  return {
    point_count: point_count ?? undefined,
    avg_accuracy_m,
    max_accuracy_m,
  };
}

function normalizePoint(raw: unknown): TrackingPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const lat = pickNum(row.lat) ?? pickNum(row.latitude);
  const lng = pickNum(row.lng) ?? pickNum(row.longitude);
  const captured_at = pickStr(row.captured_at) ?? pickStr(row.capturedAt);
  if (lat == null || lng == null || !captured_at) return null;
  const app_state = pickStr(row.app_state);
  return {
    lat,
    lng,
    captured_at,
    accuracy_m: pickNum(row.accuracy_m) ?? pickNum(row.accuracy),
    speed_mps: pickNum(row.speed_mps) ?? pickNum(row.speed),
    app_state:
      app_state === 'foreground' || app_state === 'background' || app_state === 'killed'
        ? app_state
        : undefined,
  };
}

function normalizePoints(raw: unknown): TrackingPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePoint).filter((p): p is TrackingPoint => p !== null);
}

function extractSessionRoot(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.session && typeof row.session === 'object') {
    return row.session as Record<string, unknown>;
  }
  return row;
}

function normalizeSessionDetail(raw: unknown): TrackingSessionDetail | null {
  const nested = extractSessionRoot(raw);
  if (!nested) return null;

  const id = pickStr(nested.id) ?? pickStr(nested.session_id);
  if (!id) return null;
  const purpose = pickStr(nested.purpose) as TrackingSessionPurpose | null;
  const vehicle_label = pickStr(nested.vehicle_label) ?? '';
  const status = (pickStr(nested.status) ?? 'active') as TrackingSession['status'];
  if (!purpose) return null;

  const statsSource =
    nested.stats ??
    nested.summary ??
    nested.metrics ??
    (nested.metadata && typeof nested.metadata === 'object'
      ? (nested.metadata as Record<string, unknown>).stats
      : null);

  const statsFromRoot = normalizeStats(nested);
  const statsFromNested = normalizeStats(statsSource);
  const stats =
    statsFromRoot || statsFromNested
      ? { ...statsFromNested, ...statsFromRoot }
      : undefined;

  const recent_points = normalizePoints(
    nested.recent_points ?? nested.last_points ?? nested.points ?? nested.point_samples,
  );

  return {
    id,
    status,
    purpose,
    vehicle_label,
    owner_user_id: pickStr(nested.owner_user_id) ?? undefined,
    actor_id: pickStr(nested.actor_id) ?? undefined,
    actor_type: pickStr(nested.actor_type),
    consent_at: pickStr(nested.consent_at) ?? undefined,
    started_at: pickStr(nested.started_at) ?? undefined,
    ended_at: pickStr(nested.ended_at),
    last_heartbeat_at: pickStr(nested.last_heartbeat_at),
    metadata:
      nested.metadata && typeof nested.metadata === 'object'
        ? (nested.metadata as Record<string, unknown>)
        : null,
    stats,
    recent_points: recent_points.length > 0 ? recent_points : undefined,
  };
}

function normalizeSession(raw: unknown): TrackingSession | null {
  const detail = normalizeSessionDetail(raw);
  if (!detail) return null;
  const { stats: _stats, recent_points: _points, ...session } = detail;
  return session;
}

export type StartTrackingSessionParams = {
  purpose: TrackingSessionPurpose;
  vehicle_label: string;
  consent_accepted: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export async function startTrackingSession(
  params: StartTrackingSessionParams,
): Promise<TrackingSession> {
  const { data } = await apiClient.post(TRACKING_SESSION_ENDPOINTS.start, {
    purpose: params.purpose,
    vehicle_label: params.vehicle_label.trim(),
    consent_accepted: params.consent_accepted,
    notes: params.notes?.trim() || undefined,
    metadata: params.metadata ?? { source: 'android_mvp' },
  });
  const session = normalizeSession(data);
  if (!session) {
    throw new Error('Respuesta inválida al iniciar captura logística');
  }
  return session;
}

export async function sendTrackingPointsBatch(
  sessionId: string,
  points: TrackingPointInput[],
): Promise<{ accepted: number }> {
  const { data } = await apiClient.post(TRACKING_SESSION_ENDPOINTS.pointsBatch(sessionId), {
    points,
  });
  const row = data as Record<string, unknown> | null;
  const accepted =
    typeof row?.accepted === 'number'
      ? row.accepted
      : typeof row?.accepted_count === 'number'
        ? row.accepted_count
        : points.length;
  return { accepted };
}

export async function endTrackingSession(sessionId: string): Promise<TrackingSession> {
  const { data } = await apiClient.patch(TRACKING_SESSION_ENDPOINTS.end(sessionId), {});
  const session = normalizeSession(data);
  if (!session) {
    return {
      id: sessionId,
      status: 'ended',
      purpose: 'operacion_interna',
      vehicle_label: '',
    };
  }
  return session;
}

export async function fetchTrackingSessionDetail(
  sessionId: string,
): Promise<TrackingSessionDetail | null> {
  const { data } = await apiClient.get(TRACKING_SESSION_ENDPOINTS.byId(sessionId));
  return normalizeSessionDetail(data);
}

/** Compatibilidad con hidratación de captura activa. */
export async function fetchTrackingSession(sessionId: string): Promise<TrackingSession | null> {
  return fetchTrackingSessionDetail(sessionId);
}

export async function fetchMyTrackingSessions(): Promise<TrackingSessionDetail[]> {
  const { data } = await apiClient.get(TRACKING_SESSION_ENDPOINTS.my);
  if (Array.isArray(data)) {
    return data
      .map(normalizeSessionDetail)
      .filter((s): s is TrackingSessionDetail => s !== null);
  }
  const row = data as Record<string, unknown> | null;
  const list = row?.sessions ?? row?.data;
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizeSessionDetail)
    .filter((s): s is TrackingSessionDetail => s !== null);
}
