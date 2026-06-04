import { apiClient } from '@/api/client';
import { TRACKING_SESSION_ENDPOINTS } from '@/api/endpoints';
import type {
  TrackingPointInput,
  TrackingSession,
  TrackingSessionPurpose,
} from '@/types/tracking';

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeSession(raw: unknown): TrackingSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const nested =
    row.session && typeof row.session === 'object'
      ? (row.session as Record<string, unknown>)
      : row;
  const id = pickStr(nested.id) ?? pickStr(nested.session_id);
  if (!id) return null;
  const purpose = pickStr(nested.purpose) as TrackingSessionPurpose | null;
  const vehicle_label = pickStr(nested.vehicle_label) ?? '';
  const status = (pickStr(nested.status) ?? 'active') as TrackingSession['status'];
  if (!purpose) return null;
  return {
    id,
    status,
    purpose,
    vehicle_label,
    consent_at: pickStr(nested.consent_at) ?? undefined,
    started_at: pickStr(nested.started_at) ?? undefined,
    ended_at: pickStr(nested.ended_at),
    last_heartbeat_at: pickStr(nested.last_heartbeat_at),
    metadata:
      nested.metadata && typeof nested.metadata === 'object'
        ? (nested.metadata as Record<string, unknown>)
        : null,
  };
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

export async function fetchTrackingSession(sessionId: string): Promise<TrackingSession | null> {
  const { data } = await apiClient.get(TRACKING_SESSION_ENDPOINTS.byId(sessionId));
  return normalizeSession(data);
}

export async function fetchMyTrackingSessions(): Promise<TrackingSession[]> {
  const { data } = await apiClient.get(TRACKING_SESSION_ENDPOINTS.my);
  if (Array.isArray(data)) {
    return data.map(normalizeSession).filter((s): s is TrackingSession => s !== null);
  }
  const row = data as Record<string, unknown> | null;
  const list = row?.sessions ?? row?.data;
  if (!Array.isArray(list)) return [];
  return list.map(normalizeSession).filter((s): s is TrackingSession => s !== null);
}
