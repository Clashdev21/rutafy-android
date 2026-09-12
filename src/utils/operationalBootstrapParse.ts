import type {
  OperationalBootstrapAction,
  OperationalBootstrapCapabilities,
  OperationalBootstrapJourney,
  OperationalBootstrapReason,
  OperationalBootstrapResponse,
  OperationalBootstrapTracking,
  OperationalBootstrapUnit,
} from '@/types/operationalBootstrap';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function pickNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isAction(value: unknown): value is OperationalBootstrapAction {
  return (
    value === 'NONE' ||
    value === 'CAPTURE_REQUIRED' ||
    value === 'CAPTURE_ACTIVE' ||
    value === 'CONFLICT' ||
    value === 'PENDING_ASSIGNMENT'
  );
}

function isReason(value: unknown): value is OperationalBootstrapReason {
  return (
    value === 'NO_OPERATIONAL_UNIT' ||
    value === 'NO_PLATE' ||
    value === 'NO_ACTIVE_JOURNEY' ||
    value === 'ACTIVE_JOURNEY_FOUND' ||
    value === 'CAPTURE_ALREADY_ACTIVE' ||
    value === 'MULTIPLE_ACTIVE_JOURNEYS' ||
    value === 'PLATE_MISMATCH' ||
    value === 'OWNERSHIP_INCONSISTENT' ||
    value === 'JOURNEY_COMPLETED' ||
    value === 'JOURNEYS_UNAVAILABLE' ||
    value === 'FORBIDDEN_ROLE'
  );
}

function parseUnit(raw: unknown): OperationalBootstrapUnit | null {
  const row = asRecord(raw);
  if (!row) return null;
  return {
    messenger_id: pickStr(row.messenger_id),
    plate: pickStr(row.plate),
    plate_normalized: pickStr(row.plate_normalized),
    vehicle_type: pickStr(row.vehicle_type),
  };
}

function parseJourney(raw: unknown): OperationalBootstrapJourney | null {
  const row = asRecord(raw);
  if (!row) return null;
  const journey_id = pickStr(row.journey_id);
  if (!journey_id) return null;
  return {
    journey_id,
    container_id: pickStr(row.container_id),
    corridor_code: pickStr(row.corridor_code),
    current_state: pickStr(row.current_state),
    current_leg: pickNum(row.current_leg),
    telemetry_mode: pickStr(row.telemetry_mode),
  };
}

function parseTracking(raw: unknown): OperationalBootstrapTracking {
  const row = asRecord(raw);
  if (!row) {
    return { active: false, tracking_session_id: null };
  }
  return {
    active: row.active === true,
    tracking_session_id: pickStr(row.tracking_session_id),
  };
}

function parseCapabilities(
  raw: unknown,
  action: OperationalBootstrapAction,
  captureShouldStop: boolean,
): OperationalBootstrapCapabilities {
  const row = asRecord(raw);
  const canStartDefault = action === 'CAPTURE_REQUIRED' && !captureShouldStop;
  return {
    can_start_capture:
      typeof row?.can_start_capture === 'boolean' ? row.can_start_capture : canStartDefault,
    start_path: pickStr(row?.start_path) ?? 'POST /v1/tracking-sessions/start',
  };
}

export function parseOperationalBootstrapResponse(
  raw: unknown,
): OperationalBootstrapResponse | null {
  const row = asRecord(raw);
  if (!row) return null;
  if (!isAction(row.action) || !isReason(row.reason)) return null;

  const capture_should_stop = row.capture_should_stop === true;
  return {
    action: row.action,
    reason: row.reason,
    operational_unit: parseUnit(row.operational_unit),
    journey: parseJourney(row.journey),
    tracking: parseTracking(row.tracking),
    capture_should_stop,
    capabilities: parseCapabilities(row.capabilities, row.action, capture_should_stop),
  };
}
