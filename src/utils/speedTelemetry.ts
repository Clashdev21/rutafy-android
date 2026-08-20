import type {
  DerivedSpeedCalculateResult,
  NativeSpeedParseResult,
  SpeedTelemetryPreviousFix,
} from '@/types/speedTelemetry';

const EARTH_RADIUS_M = 6_371_000;

/** Convierte m/s → km/h (factor 3.6). */
export function mpsToKmh(mps: number): number {
  return mps * 3.6;
}

/**
 * Parsea velocidad nativa del OS (Expo Location coords.speed en m/s).
 * null / undefined / NaN / negativo → unavailable (no sustituir por 0).
 * 0 m/s es velocidad cero válida.
 */
export function parseNativeSpeedMps(raw: unknown): NativeSpeedParseResult {
  if (raw == null) {
    return { ok: false, reason: 'native_null' };
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return { ok: false, reason: 'native_invalid' };
  }
  return {
    ok: true,
    speedNativeMps: raw,
    speedNativeKmh: mpsToKmh(raw),
  };
}

function parseCapturedAtMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Distancia geodésica Haversine entre dos puntos (metros). */
export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Velocidad derivada entre dos fixes consecutivos.
 * speedDerivedKmh = (distanceM / deltaTimeMs) * 3600
 */
export function calculateDerivedSpeedSample(
  previous: SpeedTelemetryPreviousFix | null,
  current: { lat: number; lng: number; capturedAt: string },
): DerivedSpeedCalculateResult {
  if (!previous) {
    return { ok: false, reason: 'no_previous' };
  }

  const { lat, lng, capturedAt } = current;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'invalid_coords' };
  }
  if (!Number.isFinite(previous.lat) || !Number.isFinite(previous.lng)) {
    return { ok: false, reason: 'invalid_coords' };
  }

  const currentMs = parseCapturedAtMs(capturedAt);
  const previousMs = previous.capturedAtMs;
  if (currentMs == null || !Number.isFinite(previousMs)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  const deltaTimeMs = currentMs - previousMs;
  if (deltaTimeMs <= 0) {
    return { ok: false, reason: 'invalid_delta_time' };
  }

  const distanceFromPreviousM = haversineDistanceM(
    previous.lat,
    previous.lng,
    lat,
    lng,
  );
  if (!Number.isFinite(distanceFromPreviousM)) {
    return { ok: false, reason: 'invalid_distance' };
  }

  const speedDerivedKmh = (distanceFromPreviousM / deltaTimeMs) * 3600;
  if (!Number.isFinite(speedDerivedKmh)) {
    return { ok: false, reason: 'invalid_result' };
  }

  return {
    ok: true,
    speedDerivedKmh,
    distanceFromPreviousM,
    deltaTimeMs,
  };
}

/**
 * ¿El fix anterior pertenece a otra sesión? (pure — testeable)
 * Si sessionId actual es null, tratar como sesión distinta / inválida.
 */
export function isPreviousFixFromDifferentSession(
  previous: SpeedTelemetryPreviousFix | null,
  sessionId: string | null,
): boolean {
  if (!sessionId) return previous != null;
  if (!previous) return false;
  return previous.sessionId !== sessionId;
}
