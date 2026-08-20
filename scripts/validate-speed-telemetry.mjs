/**
 * Validación manual Speed 2A / 2A.1 — ejecutar con:
 * node scripts/validate-speed-telemetry.mjs
 */

const EARTH_RADIUS_M = 6_371_000;

function mpsToKmh(mps) {
  return mps * 3.6;
}

function parseNativeSpeedMps(raw) {
  if (raw == null) return { ok: false, reason: 'native_null' };
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return { ok: false, reason: 'native_invalid' };
  }
  return { ok: true, speedNativeMps: raw, speedNativeKmh: mpsToKmh(raw) };
}

function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function calculateDerivedSpeedSample(previous, current) {
  if (!previous) return { ok: false, reason: 'no_previous' };
  if (
    !Number.isFinite(current.lat) ||
    !Number.isFinite(current.lng) ||
    !Number.isFinite(previous.lat) ||
    !Number.isFinite(previous.lng)
  ) {
    return { ok: false, reason: 'invalid_coords' };
  }
  const currentMs = Date.parse(current.capturedAt);
  if (!Number.isFinite(currentMs)) return { ok: false, reason: 'invalid_timestamp' };
  const deltaTimeMs = currentMs - previous.capturedAtMs;
  if (deltaTimeMs <= 0) return { ok: false, reason: 'invalid_delta_time' };
  const distanceFromPreviousM = haversineDistanceM(
    previous.lat,
    previous.lng,
    current.lat,
    current.lng,
  );
  const speedDerivedKmh = (distanceFromPreviousM / deltaTimeMs) * 3600;
  if (!Number.isFinite(speedDerivedKmh)) return { ok: false, reason: 'invalid_result' };
  return { ok: true, speedDerivedKmh, distanceFromPreviousM, deltaTimeMs };
}

function isPreviousFixFromDifferentSession(previous, sessionId) {
  if (!sessionId) return previous != null;
  if (!previous) return false;
  return previous.sessionId !== sessionId;
}

/** Réplica mínima del guard de sesión del observer. */
function tryDerivedAcrossSessions(previous, sessionId, current) {
  if (isPreviousFixFromDifferentSession(previous, sessionId)) {
    return { ok: false, reason: 'session_changed', skipped: true };
  }
  return calculateDerivedSpeedSample(previous, current);
}

function assert(label, condition) {
  const status = condition ? 'OK' : 'FAIL';
  console.log(`${status}  ${label}`);
  if (!condition) process.exitCode = 1;
}

const zero = parseNativeSpeedMps(0);
assert('1. 0 m/s → 0 km/h', zero.ok && zero.speedNativeKmh === 0);

const ten = parseNativeSpeedMps(10);
assert('2. 10 m/s → 36 km/h', ten.ok && ten.speedNativeKmh === 36);

const nil = parseNativeSpeedMps(null);
assert('3. null → unavailable', !nil.ok && nil.reason === 'native_null');

const neg = parseNativeSpeedMps(-1);
assert('4. speed negativo → unavailable', !neg.ok);

const prev = {
  sessionId: 'sess-a',
  lat: 4.6097,
  lng: -74.0817,
  capturedAtMs: Date.parse('2026-01-01T00:00:00.000Z'),
};
const curr = {
  lat: 4.6115,
  lng: -74.0817,
  capturedAt: '2026-01-01T00:00:20.000Z',
};
const derived = calculateDerivedSpeedSample(prev, curr);
assert(
  '5. deltaTime 20s + ~200m → ~36 km/h',
  derived.ok && Math.abs(derived.speedDerivedKmh - 36) < 2,
);

const sameTime = calculateDerivedSpeedSample(prev, {
  lat: 4.6115,
  lng: -74.0817,
  capturedAt: '2026-01-01T00:00:00.000Z',
});
assert('6. deltaTime 0 → rejected', !sameTime.ok && sameTime.reason === 'invalid_delta_time');

const earlierTs = calculateDerivedSpeedSample(prev, {
  lat: 4.6115,
  lng: -74.0817,
  capturedAt: '2025-12-31T23:59:00.000Z',
});
assert(
  '7. timestamp anterior → rejected',
  !earlierTs.ok && earlierTs.reason === 'invalid_delta_time',
);

const badCoords = calculateDerivedSpeedSample(prev, {
  lat: NaN,
  lng: -74,
  capturedAt: '2026-01-01T00:00:20.000Z',
});
assert('8. coordenadas inválidas → rejected', !badCoords.ok);

const crossSession = tryDerivedAcrossSessions(prev, 'sess-b', curr);
assert(
  '9. cambio de sessionId → NO calcular derived entre sesiones',
  !crossSession.ok && crossSession.reason === 'session_changed' && crossSession.skipped,
);

const sameSessionSecond = calculateDerivedSpeedSample(prev, curr);
assert(
  '10. segundo punto misma sesión → derived permitido',
  sameSessionSecond.ok && sameSessionSecond.speedDerivedKmh > 0,
);

console.log('\nValidación manual Speed 2A / 2A.1 completada.');
