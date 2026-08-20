/**
 * Validación manual Speed 2A.2.1 — session-scoped speed stats.
 * Ejecutar: node scripts/validate-session-speed-stats.mjs
 *
 * Réplica pura de resolve/apply (sin AsyncStorage / test framework).
 */

function createEmpty(sessionId, startedAt = '2026-01-01T00:00:00.000Z') {
  return {
    sessionId,
    startedAt,
    endedAt: null,
    nativeSpeedSamples: 0,
    derivedSpeedSamples: 0,
    nativeSpeedUnavailable: 0,
    derivedSpeedUnavailable: 0,
    rejectedSpeedSamples: 0,
    lastNativeSpeedKmh: null,
    lastDerivedSpeedKmh: null,
    maxNativeSpeedKmh: null,
    maxDerivedSpeedKmh: null,
    avgNativeAvailableSpeedKmh: null,
    avgDerivedAvailableSpeedKmh: null,
    nativeZeroSamples: 0,
    nativeZeroWhileMoving: 0,
    nativeZeroWhileMovingRate: null,
    derivedGoodSamples: 0,
    derivedWeakSamples: 0,
    derivedRejectedSamples: 0,
    poorAccuracySamples: 0,
    longGapSpeedSamples: 0,
    implausibleSpeedSamples: 0,
    staleFixSamples: 0,
    mockedFixes: 0,
    lastDisplacementQualityRatio: null,
    lastCombinedAccuracyM: null,
    lastFixAgeMs: null,
    lastFixMocked: null,
    maxFixAgeMs: null,
    avgGoodDerivedSpeedKmh: null,
    maxGoodDerivedSpeedKmh: null,
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
  return { stats: createEmpty(sessionId, startedAt), reset: true };
}

function markEnded(stats, endedAt = '2026-01-01T01:00:00.000Z') {
  return { ...stats, endedAt: stats.endedAt ?? endedAt };
}

function incrementRunningAvg(prevAvg, count, value) {
  if (count <= 1) return value;
  const base = prevAvg ?? value;
  return base + (value - base) / count;
}

function applySpeedStat(type, stats, detail = {}) {
  const next = { ...stats };
  switch (type) {
    case 'speed-native':
    case 'speed-stat-native': {
      const kmh = detail.speedNativeKmh;
      if (typeof kmh !== 'number' || !Number.isFinite(kmh)) return null;
      next.nativeSpeedSamples += 1;
      next.lastNativeSpeedKmh = kmh;
      next.maxNativeSpeedKmh =
        next.maxNativeSpeedKmh == null ? kmh : Math.max(next.maxNativeSpeedKmh, kmh);
      next.avgNativeAvailableSpeedKmh = incrementRunningAvg(
        next.avgNativeAvailableSpeedKmh,
        next.nativeSpeedSamples,
        kmh,
      );
      return next;
    }
    case 'speed-derived':
    case 'speed-stat-derived': {
      const kmh = detail.speedDerivedKmh;
      if (typeof kmh !== 'number' || !Number.isFinite(kmh)) return null;
      next.derivedSpeedSamples += 1;
      next.lastDerivedSpeedKmh = kmh;
      next.maxDerivedSpeedKmh =
        next.maxDerivedSpeedKmh == null ? kmh : Math.max(next.maxDerivedSpeedKmh, kmh);
      next.avgDerivedAvailableSpeedKmh = incrementRunningAvg(
        next.avgDerivedAvailableSpeedKmh,
        next.derivedSpeedSamples,
        kmh,
      );
      return next;
    }
    case 'speed-stat-quality-good': {
      next.derivedGoodSamples += 1;
      const kmh = detail.speedDerivedKmh;
      if (typeof kmh === 'number' && Number.isFinite(kmh)) {
        next.maxGoodDerivedSpeedKmh =
          next.maxGoodDerivedSpeedKmh == null
            ? kmh
            : Math.max(next.maxGoodDerivedSpeedKmh, kmh);
        next.avgGoodDerivedSpeedKmh = incrementRunningAvg(
          next.avgGoodDerivedSpeedKmh,
          next.derivedGoodSamples,
          kmh,
        );
      }
      return next;
    }
    case 'speed-stat-native-zero':
      next.nativeZeroSamples += 1;
      return next;
    default:
      return null;
  }
}

/** Simula dual-write: lifetime nunca se resetea por cambio de sesión. */
function applyDual(lifetime, session, type, detail, sessionId) {
  const nextLifetime = applySpeedStat(type, lifetime, detail) ?? lifetime;
  let nextSession = session;
  if (session && session.sessionId === sessionId) {
    nextSession = applySpeedStat(type, session, detail) ?? session;
  }
  return { lifetime: nextLifetime, session: nextSession };
}

function assert(label, condition) {
  const status = condition ? 'OK' : 'FAIL';
  console.log(`${status}  ${label}`);
  if (!condition) process.exitCode = 1;
}

// --- A: sesión A comienza en cero ---
let { stats: sessionA, reset: resetA } = resolveBucket(null, 'A', 't0');
assert('A. sesión A comienza en cero', resetA && sessionA.nativeSpeedSamples === 0);

// --- B: acumula stats ---
let lifetime = createEmpty('lifetime-placeholder');
// lifetime bucket is separate shape in app; here we only track speed counters
lifetime = { ...createEmpty('L'), sessionId: 'L' };
({ lifetime, session: sessionA } = applyDual(
  lifetime,
  sessionA,
  'speed-stat-native',
  { speedNativeKmh: 36 },
  'A',
));
({ lifetime, session: sessionA } = applyDual(
  lifetime,
  sessionA,
  'speed-stat-derived',
  { speedDerivedKmh: 40 },
  'A',
));
({ lifetime, session: sessionA } = applyDual(
  lifetime,
  sessionA,
  'speed-stat-quality-good',
  { speedDerivedKmh: 40 },
  'A',
));
({ lifetime, session: sessionA } = applyDual(
  lifetime,
  sessionA,
  'speed-stat-native-zero',
  {},
  'A',
));
assert(
  'B. acumula stats (native/derived/good/zero)',
  sessionA.nativeSpeedSamples === 1 &&
    sessionA.derivedSpeedSamples === 1 &&
    sessionA.derivedGoodSamples === 1 &&
    sessionA.nativeZeroSamples === 1 &&
    sessionA.lastNativeSpeedKmh === 36,
);

const snapshotA = { ...sessionA };

// --- C: restore misma A conserva ---
({ stats: sessionA, reset: resetA } = resolveBucket(sessionA, 'A', 't-restore'));
assert(
  'C. restore misma A conserva stats',
  !resetA &&
    sessionA.nativeSpeedSamples === snapshotA.nativeSpeedSamples &&
    sessionA.derivedGoodSamples === 1 &&
    sessionA.endedAt === null,
);

// --- D + E: nueva sesión B empieza en cero; A no contamina B ---
let sessionB;
let resetB;
({ stats: sessionB, reset: resetB } = resolveBucket(sessionA, 'B', 't1'));
assert('D. nueva sesión B empieza en cero', resetB && sessionB.nativeSpeedSamples === 0);
assert(
  'E. stats A no contaminan B',
  sessionB.sessionId === 'B' &&
    sessionB.derivedGoodSamples === 0 &&
    sessionB.nativeZeroSamples === 0 &&
    snapshotA.nativeSpeedSamples === 1,
);

({ lifetime, session: sessionB } = applyDual(
  lifetime,
  sessionB,
  'speed-stat-native',
  { speedNativeKmh: 18 },
  'B',
));
assert(
  'E2. B acumula independiente',
  sessionB.nativeSpeedSamples === 1 && sessionB.lastNativeSpeedKmh === 18,
);

// --- F: cierre B conserva para export ---
sessionB = markEnded(sessionB, 't-end');
assert(
  'F. cierre B conserva stats para export',
  sessionB.endedAt === 't-end' &&
    sessionB.nativeSpeedSamples === 1 &&
    sessionB.sessionId === 'B',
);

const exportPayload = {
  statistics: {
    nativeSpeedSamples: lifetime.nativeSpeedSamples,
    gpsFixes: 999,
  },
  sessionSpeedStatistics: sessionB,
};
assert(
  'F2. export incluye sessionSpeedStatistics + statistics',
  exportPayload.sessionSpeedStatistics.endedAt === 't-end' &&
    exportPayload.statistics.gpsFixes === 999,
);

// --- G: lifetime sigue existiendo / no reseteado por cambio de sesión ---
assert(
  'G. lifetime stats siguen existiendo (A+B native)',
  lifetime.nativeSpeedSamples === 2 && lifetime.derivedSpeedSamples === 1,
);

if (process.exitCode) {
  console.log('\nvalidate-session-speed-stats: FAIL');
  process.exit(1);
}
console.log('\nvalidate-session-speed-stats: 7/7 PASS (A–G)');
