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
  consent_at?: string;
  started_at?: string;
  ended_at?: string | null;
  last_heartbeat_at?: string | null;
  metadata?: Record<string, unknown> | null;
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
  purpose: TrackingSessionPurpose;
  vehicleLabel: string;
  startedAt: string;
};
