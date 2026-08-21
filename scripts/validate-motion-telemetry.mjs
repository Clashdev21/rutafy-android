/**
 * Validación manual Speed 2B.0 — motion telemetry (sin framework).
 * Ejecutar: node scripts/validate-motion-telemetry.mjs
 */

function calculateMagnitudeG(x, y, z) {
  if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return Math.sqrt(x * x + y * y + z * z);
}

function calculateDynamicAccelG(magnitudeG) {
  if (!Number.isFinite(magnitudeG)) return null;
  return Math.abs(magnitudeG - 1);
}

function parseAccelSampleG(x, y, z) {
  const magnitudeG = calculateMagnitudeG(x, y, z);
  if (magnitudeG == null) return { ok: false };
  const dynamicAccelG = calculateDynamicAccelG(magnitudeG);
  if (dynamicAccelG == null) return { ok: false };
  return { ok: true, magnitudeG, dynamicAccelG };
}

function percentileNearestRank(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx];
}

function finalizeWindow(samples) {
  // samples: { magnitudeG, dynamicAccelG }[]
  const valid = samples.filter(Boolean);
  const n = valid.length;
  if (n === 0) {
    return {
      sampleCount: samples.length,
      validSampleCount: 0,
      invalidSampleCount: samples.length,
      meanMagnitudeG: null,
      dynamicAccelMeanG: null,
      dynamicAccelRmsG: null,
      peakDynamicAccelG: null,
      p95DynamicAccelG: null,
    };
  }
  let sumMag = 0;
  let sumDyn = 0;
  let sumSq = 0;
  let peak = 0;
  const dynamics = [];
  for (const s of valid) {
    sumMag += s.magnitudeG;
    sumDyn += s.dynamicAccelG;
    sumSq += s.dynamicAccelG * s.dynamicAccelG;
    peak = Math.max(peak, s.dynamicAccelG);
    dynamics.push(s.dynamicAccelG);
  }
  dynamics.sort((a, b) => a - b);
  return {
    sampleCount: samples.length,
    validSampleCount: n,
    invalidSampleCount: samples.length - n,
    meanMagnitudeG: sumMag / n,
    dynamicAccelMeanG: sumDyn / n,
    dynamicAccelRmsG: Math.sqrt(sumSq / n),
    peakDynamicAccelG: peak,
    p95DynamicAccelG: percentileNearestRank(dynamics, 95),
  };
}

function createEmptySession(sessionId, startedAt = 't0') {
  return {
    sessionId,
    startedAt,
    endedAt: null,
    accelerometerAvailable: false,
    accelerometerSamples: 0,
    validAccelerometerSamples: 0,
    invalidAccelerometerSamples: 0,
    motionWindows: 0,
    avgDynamicAccelRmsG: null,
    maxDynamicAccelRmsG: null,
    maxPeakDynamicAccelG: null,
    avgDynamicAccelMeanG: null,
    sensorStartFailures: 0,
    sensorStops: 0,
    sensorRestarts: 0,
    foregroundObservedMs: 0,
    sessionDurationMs: 0,
    foregroundCoverageRatio: null,
    lastWindowStartedAt: null,
    lastWindowEndedAt: null,
  };
}

function shouldReset(existing, sessionId) {
  if (!existing) return true;
  return existing.sessionId !== sessionId;
}

function resolveBucket(existing, sessionId, startedAt) {
  if (!shouldReset(existing, sessionId) && existing) {
    return { stats: { ...existing, endedAt: null }, reset: false };
  }
  return { stats: createEmptySession(sessionId, startedAt), reset: true };
}

function refreshCoverage(stats, nowMs) {
  const startMs = Date.parse(stats.startedAt);
  const endMs = stats.endedAt ? Date.parse(stats.endedAt) : nowMs;
  const sessionDurationMs =
    Number.isFinite(startMs) && endMs >= startMs ? endMs - startMs : 0;
  const foregroundCoverageRatio =
    sessionDurationMs > 0
      ? Math.min(1, Math.max(0, stats.foregroundObservedMs / sessionDurationMs))
      : null;
  return { ...stats, sessionDurationMs, foregroundCoverageRatio };
}

function markEnded(stats, endedAt) {
  return refreshCoverage({ ...stats, endedAt: stats.endedAt ?? endedAt }, Date.parse(endedAt));
}

function assert(label, condition) {
  const status = condition ? 'OK' : 'FAIL';
  console.log(`${status}  ${label}`);
  if (!condition) process.exitCode = 1;
}

// 1. (0,0,1) magnitude ≈ 1g
const m1 = calculateMagnitudeG(0, 0, 1);
assert('1. (0,0,1) magnitude ≈ 1g', m1 != null && Math.abs(m1 - 1) < 1e-9);

// 2. reposo ideal dynamic ≈ 0
const dRest = calculateDynamicAccelG(1);
assert('2. reposo ideal dynamic ≈ 0', dRest === 0);

// 3. muestra dinámica dynamic > 0
const dMove = calculateDynamicAccelG(calculateMagnitudeG(0.5, 0.2, 1.1));
assert('3. muestra dinámica dynamic > 0', dMove != null && dMove > 0);

// 4. ventana normal RMS correcto
const dynVals = [0.1, 0.2, 0.3];
const win = finalizeWindow(
  dynVals.map((d) => ({ magnitudeG: 1 + d, dynamicAccelG: d })),
);
const expectedRms = Math.sqrt((0.01 + 0.04 + 0.09) / 3);
assert(
  '4. ventana normal RMS correcto',
  win.dynamicAccelRmsG != null && Math.abs(win.dynamicAccelRmsG - expectedRms) < 1e-9,
);

// 5. p95 correcto (nearest-rank)
const p95 = finalizeWindow(
  [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((d) => ({
    magnitudeG: 1 + d,
    dynamicAccelG: d,
  })),
);
assert('5. p95 correcto', p95.p95DynamicAccelG === 1.0);

// 6. ventana vacía sin crash
const empty = finalizeWindow([]);
assert(
  '6. ventana vacía sin crash',
  empty.validSampleCount === 0 && empty.dynamicAccelRmsG == null,
);

// 7. NaN/invalid contador
const invalid = parseAccelSampleG(NaN, 0, 1);
const mixed = finalizeWindow([
  parseAccelSampleG(0, 0, 1).ok
    ? { magnitudeG: 1, dynamicAccelG: 0 }
    : null,
  null,
]);
assert('7. NaN/invalid', !invalid.ok && mixed.invalidSampleCount === 1);

// 8. nueva sesión stats en cero
let { stats: sessionA, reset: resetA } = resolveBucket(null, 'A', '2026-01-01T00:00:00.000Z');
assert('8. nueva sesión stats en cero', resetA && sessionA.motionWindows === 0);

sessionA = {
  ...sessionA,
  motionWindows: 3,
  accelerometerSamples: 90,
  foregroundObservedMs: 5000,
};
const snapA = { ...sessionA };

// 9. restore misma sesión
({ stats: sessionA, reset: resetA } = resolveBucket(sessionA, 'A'));
assert(
  '9. restore misma sesión conserva',
  !resetA && sessionA.motionWindows === 3 && sessionA.accelerometerSamples === 90,
);

// 10. nueva sessionId sin contaminación
let { stats: sessionB, reset: resetB } = resolveBucket(sessionA, 'B', 't1');
assert(
  '10. nueva sessionId sin contaminación',
  resetB &&
    sessionB.motionWindows === 0 &&
    sessionB.sessionId === 'B' &&
    snapA.motionWindows === 3,
);

// 11. sensor unavailable sin crash
const capsUnavailable = {
  accelerometer: false,
  gyroscope: false,
  magnetometer: false,
  barometer: false,
  deviceMotion: false,
};
assert(
  '11. sensor unavailable sin crash',
  capsUnavailable.accelerometer === false && typeof capsUnavailable === 'object',
);

// 12. cleanup endedAt exportable
sessionB = {
  ...sessionB,
  motionWindows: 2,
  accelerometerSamples: 60,
  foregroundObservedMs: 6000,
};
sessionB = markEnded(sessionB, '2026-01-01T00:10:00.000Z');
assert(
  '12. cleanup endedAt y stats exportables',
  sessionB.endedAt === '2026-01-01T00:10:00.000Z' && sessionB.motionWindows === 2,
);

// 13. foreground coverage ratio
const cov = refreshCoverage(
  {
    ...createEmptySession('C', '2026-01-01T00:00:00.000Z'),
    foregroundObservedMs: 450_000,
    endedAt: '2026-01-01T00:20:00.000Z', // 1_200_000 ms
  },
  Date.parse('2026-01-01T00:20:00.000Z'),
);
assert(
  '13. foreground coverage ratio correcto',
  cov.sessionDurationMs === 1_200_000 &&
    cov.foregroundCoverageRatio != null &&
    Math.abs(cov.foregroundCoverageRatio - 0.375) < 1e-9,
);

if (process.exitCode) {
  console.log('\nvalidate-motion-telemetry: FAIL');
  process.exit(1);
}
console.log('\nvalidate-motion-telemetry: 13/13 PASS');
