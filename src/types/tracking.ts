export type TrackingSessionPurpose =
  | 'operacion_interna'
  | 'traslado_variante'
  | 'puerto'
  | 'patio'
  | 'terminal';

export type TrackingPointAppState = 'foreground' | 'background' | 'killed';

export type TrackingSessionStatus = 'active' | 'ended' | 'abandoned';

export type TrackingSession = {
  id: string;
  status: TrackingSessionStatus;
  purpose: TrackingSessionPurpose;
  vehicle_label: string;
  owner_user_id?: string;
  actor_id?: string;
  actor_type?: string | null;
  consent_at?: string;
  started_at?: string;
  ended_at?: string | null;
  last_heartbeat_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TrackingSessionStats = {
  point_count?: number;
  avg_accuracy_m?: number | null;
  max_accuracy_m?: number | null;
};

export type TrackingPoint = {
  lat: number;
  lng: number;
  captured_at: string;
  accuracy_m?: number | null;
  speed_mps?: number | null;
  app_state?: TrackingPointAppState;
};

export type TrackingSessionDetail = TrackingSession & {
  stats?: TrackingSessionStats;
  recent_points?: TrackingPoint[];
};

export type TrackingTimelineEventKind =
  | 'session_start'
  | 'consent'
  | 'point'
  | 'heartbeat'
  | 'session_end';

export type TrackingTimelineEvent = {
  id: string;
  kind: TrackingTimelineEventKind;
  label: string;
  at: string;
  detail?: string;
};

export type TrackingPointInput = {
  lat: number;
  lng: number;
  captured_at: string;
  accuracy_m?: number | null;
  speed_mps?: number | null;
  heading?: number | null;
  battery_level?: number | null;
  app_state: TrackingPointAppState;
  metadata?: Record<string, unknown>;
};

export type StoredTrackingSession = {
  sessionId: string;
  ownerUserId: string;
  actorId: string;
  actorType: string | null;
  purpose: TrackingSessionPurpose;
  vehicleLabel: string;
  startedAt: string;
};
