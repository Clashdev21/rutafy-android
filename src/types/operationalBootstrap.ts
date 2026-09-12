export const OPERATIONAL_BOOTSTRAP_ACTIONS = [
  'NONE',
  'CAPTURE_REQUIRED',
  'CAPTURE_ACTIVE',
  'CONFLICT',
  'PENDING_ASSIGNMENT',
] as const;

export type OperationalBootstrapAction = (typeof OPERATIONAL_BOOTSTRAP_ACTIONS)[number];

export const OPERATIONAL_BOOTSTRAP_REASONS = [
  'NO_OPERATIONAL_UNIT',
  'NO_PLATE',
  'NO_ACTIVE_JOURNEY',
  'ACTIVE_JOURNEY_FOUND',
  'CAPTURE_ALREADY_ACTIVE',
  'MULTIPLE_ACTIVE_JOURNEYS',
  'PLATE_MISMATCH',
  'OWNERSHIP_INCONSISTENT',
  'JOURNEY_COMPLETED',
  'JOURNEYS_UNAVAILABLE',
  'FORBIDDEN_ROLE',
] as const;

export type OperationalBootstrapReason = (typeof OPERATIONAL_BOOTSTRAP_REASONS)[number];

export type OperationalBootstrapJourney = {
  journey_id: string;
  container_id: string | null;
  corridor_code: string | null;
  current_state: string | null;
  current_leg: number | null;
  telemetry_mode: string | null;
};

export type OperationalBootstrapTracking = {
  active: boolean;
  tracking_session_id: string | null;
};

export type OperationalBootstrapUnit = {
  messenger_id: string | null;
  plate: string | null;
  plate_normalized: string | null;
  vehicle_type: string | null;
};

export type OperationalBootstrapCapabilities = {
  can_start_capture: boolean;
  start_path: string;
};

export type OperationalBootstrapResponse = {
  action: OperationalBootstrapAction;
  reason: OperationalBootstrapReason;
  operational_unit: OperationalBootstrapUnit | null;
  journey: OperationalBootstrapJourney | null;
  tracking: OperationalBootstrapTracking;
  capture_should_stop: boolean;
  capabilities: OperationalBootstrapCapabilities;
};

export type StoredMensajeroBootstrap = {
  journeyId: string | null;
  trackingSessionId: string | null;
  lastBootstrapAction: OperationalBootstrapAction | null;
  lastBootstrapAt: string | null;
};

export type MensajeroBootstrapSource =
  | 'session_ready'
  | 'foreground'
  | 'reconnect'
  | 'focus'
  | 'refresh';
