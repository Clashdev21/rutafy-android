/**
 * Validación Speed 2B.1 — motion classification + timeline (sin framework).
 * Ejecutar: node scripts/validate-motion-classification.mjs
 */

const MOTION_LOW_MAX_RMS_G = 0.04;
const MOTION_MEDIUM_MAX_RMS_G = 0.08;
const MOTION_HIGH_PEAK_MIN_G = 0.12;
const MOTION_TIMELINE_BUCKET_MS = 30_000;
const MAX_MOTION_TIMELINE_BUCKETS = 720;
const MOTION_WINDOW_DURATION_MS = 3000;

function classifyMotionActivity(metrics) {
  const rmsG =
    typeof metrics.dynamicAccelRmsG === 'number' && Number.isFinite(metrics.dynamicAccelRmsG)
      ? metrics.dynamicAccelRmsG
      : null;
  const p95G =
    typeof metrics.p95DynamicAccelG === 'number' && Number.isFinite(metrics.p95DynamicAccelG)
      ? metrics.p95DynamicAccelG
      : null;
  const peakG =
    typeof metrics.peakDynamicAccelG === 'number' && Number.isFinite(metrics.peakDynamicAccelG)
      ? metrics.peakDynamicAccelG
      : null;

  if (rmsG == null) {
    return { activityLevel: null, reason: 'invalid_rms', rmsG: null, p95G, peakG };
  }

  let activityLevel;
  let reason;
  if (rmsG <= MOTION_LOW_MAX_RMS_G) {
    activityLevel = 'low';
    reason = `rms<=${MOTION_LOW_MAX_RMS_G}`;
  } else if (rmsG <= MOTION_MEDIUM_MAX_RMS_G) {
    activityLevel = 'medium';
    reason = `rms<=${MOTION_MEDIUM_MAX_RMS_G}`;
  } else {
    activityLevel = 'high';
    reason = `rms>${MOTION_MEDIUM_MAX_RMS_G}`;
  }
  return { activityLevel, reason, rmsG, p95G, peakG };
}

function dominantActivityLevel(low, medium, high) {
  const total = low + medium + high;
  if (total <= 0) return null;
  if (high >= medium && high >= low) return 'high';
  if (medium >= low) return 'medium';
  return 'low';
}

function createEmptySession(sessionId) {
  return {
    sessionId,
    startedAt: 't0',
    endedAt: null,
    motionWindows: 0,
    lowActivityWindows: 0,
    mediumActivityWindows: 0,
    highActivityWindows: 0,
    lowActivityRatio: null,
    mediumActivityRatio: null,
    highActivityRatio: null,
    longestLowActivitySequenceWindows: 0,
    longestHighActivitySequenceWindows: 0,
    activityTransitions: 0,
    lastActivityLevel: null,
    highPeakWindows: 0,
    coverageGapCount: 0,
    currentLowSequenceWindows: 0,
    currentHighSequenceWindows: 0,
  };
}

function applyWindow(stats, rms, peak = 0) {
  const c = classifyMotionActivity({
    dynamicAccelRmsG: rms,
    peakDynamicAccelG: peak,
  });
  const next = { ...stats };
  next.motionWindows += 1;
  if (peak >= MOTION_HIGH_PEAK_MIN_G) next.highPeakWindows += 1;

  const level = c.activityLevel;
  if (level != null) {
    if (level === 'low') next.lowActivityWindows += 1;
    else if (level === 'medium') next.mediumActivityWindows += 1;
    else next.highActivityWindows += 1;

    if (next.lastActivityLevel != null && next.lastActivityLevel !== level) {
      next.activityTransitions += 1;
    }

    if (level === 'low') {
      next.currentLowSequenceWindows += 1;
      next.currentHighSequenceWindows = 0;
      next.longestLowActivitySequenceWindows = Math.max(
        next.longestLowActivitySequenceWindows,
        next.currentLowSequenceWindows,
      );
    } else if (level === 'high') {
      next.currentHighSequenceWindows += 1;
      next.currentLowSequenceWindows = 0;
      next.longestHighActivitySequenceWindows = Math.max(
        next.longestHighActivitySequenceWindows,
        next.currentHighSequenceWindows,
      );
    } else {
      next.currentLowSequenceWindows = 0;
      next.currentHighSequenceWindows = 0;
    }
    next.lastActivityLevel = level;
  }

  const classified =
    next.lowActivityWindows + next.mediumActivityWindows + next.highActivityWindows;
  if (classified > 0) {
    next.lowActivityRatio = next.lowActivityWindows / classified;
    next.mediumActivityRatio = next.mediumActivityWindows / classified;
    next.highActivityRatio = next.highActivityWindows / classified;
  }
  return { stats: next, classification: c };
}

function applyCoverageGap(stats) {
  return {
    ...stats,
    coverageGapCount: stats.coverageGapCount + 1,
    currentLowSequenceWindows: 0,
    currentHighSequenceWindows: 0,
  };
}

/** Mini timeline aggregator */
function createTimeline() {
  return { open: null, buckets: [] };
}

function pushTimeline(tl, endedAtMs, level, rms) {
  if (!tl.open) {
    tl.open = {
      startedAtMs: endedAtMs - MOTION_WINDOW_DURATION_MS,
      windowCount: 0,
      low: 0,
      medium: 0,
      high: 0,
      sumRms: 0,
      rmsCount: 0,
    };
  }
  while (
    endedAtMs - tl.open.startedAtMs >= MOTION_TIMELINE_BUCKET_MS &&
    tl.open.windowCount > 0
  ) {
    const boundary = tl.open.startedAtMs + MOTION_TIMELINE_BUCKET_MS;
    tl.buckets.push({
      startedAtMs: tl.open.startedAtMs,
      endedAtMs: boundary,
      windowCount: tl.open.windowCount,
      low: tl.open.low,
      medium: tl.open.medium,
      high: tl.open.high,
      avgRms: tl.open.rmsCount ? tl.open.sumRms / tl.open.rmsCount : null,
      dominant: dominantActivityLevel(tl.open.low, tl.open.medium, tl.open.high),
    });
    tl.open = {
      startedAtMs: boundary,
      windowCount: 0,
      low: 0,
      medium: 0,
      high: 0,
      sumRms: 0,
      rmsCount: 0,
    };
  }
  tl.open.windowCount += 1;
  if (level === 'low') tl.open.low += 1;
  else if (level === 'medium') tl.open.medium += 1;
  else if (level === 'high') tl.open.high += 1;
  if (typeof rms === 'number') {
    tl.open.sumRms += rms;
    tl.open.rmsCount += 1;
  }
}

function flushTimeline(tl, nowMs) {
  if (!tl.open || tl.open.windowCount === 0) {
    tl.open = null;
    return;
  }
  tl.buckets.push({
    startedAtMs: tl.open.startedAtMs,
    endedAtMs: nowMs,
    windowCount: tl.open.windowCount,
    low: tl.open.low,
    medium: tl.open.medium,
    high: tl.open.high,
    avgRms: tl.open.rmsCount ? tl.open.sumRms / tl.open.rmsCount : null,
    dominant: dominantActivityLevel(tl.open.low, tl.open.medium, tl.open.high),
  });
  tl.open = null;
}

function capBuckets(buckets, max = MAX_MOTION_TIMELINE_BUCKETS) {
  if (buckets.length <= max) return buckets;
  return buckets.slice(buckets.length - max);
}

function resolveTimeline(existing, sessionId) {
  if (existing && existing.sessionId === sessionId) {
    return { timeline: existing, reset: false };
  }
  return { timeline: { sessionId, buckets: [] }, reset: true };
}

function assert(label, condition) {
  const status = condition ? 'OK' : 'FAIL';
  console.log(`${status}  ${label}`);
  if (!condition) process.exitCode = 1;
}

// 1–3 levels
assert('1. RMS bajo → low', classifyMotionActivity({ dynamicAccelRmsG: 0.02 }).activityLevel === 'low');
assert(
  '2. RMS medio → medium',
  classifyMotionActivity({ dynamicAccelRmsG: 0.05 }).activityLevel === 'medium',
);
assert('3. RMS alto → high', classifyMotionActivity({ dynamicAccelRmsG: 0.12 }).activityLevel === 'high');

// 4 thresholds exact
assert(
  '4a. threshold exacto LOW',
  classifyMotionActivity({ dynamicAccelRmsG: MOTION_LOW_MAX_RMS_G }).activityLevel === 'low',
);
assert(
  '4b. threshold exacto MEDIUM',
  classifyMotionActivity({ dynamicAccelRmsG: MOTION_MEDIUM_MAX_RMS_G }).activityLevel ===
    'medium',
);

// 5 invalid
assert(
  '5. valores inválidos → null level',
  classifyMotionActivity({ dynamicAccelRmsG: NaN }).activityLevel === null,
);

// 6–9 session stats
let session = createEmptySession('A');
({ stats: session } = applyWindow(session, 0.02));
({ stats: session } = applyWindow(session, 0.02));
({ stats: session } = applyWindow(session, 0.02));
({ stats: session } = applyWindow(session, 0.05));
({ stats: session } = applyWindow(session, 0.15));
({ stats: session } = applyWindow(session, 0.15));
assert(
  '6. ratios sesión',
  session.lowActivityWindows === 3 &&
    session.mediumActivityWindows === 1 &&
    session.highActivityWindows === 2 &&
    Math.abs(session.lowActivityRatio - 0.5) < 1e-9,
);
assert('7. longest low sequence', session.longestLowActivitySequenceWindows === 3);
assert('8. longest high sequence', session.longestHighActivitySequenceWindows === 2);
assert('9. transition counter', session.activityTransitions === 2);

// 10 timeline aggregation
const tl = createTimeline();
let t0 = 1_000_000;
for (let i = 0; i < 12; i++) {
  // 12 × 3s = 36s → al menos 1 bucket cerrado
  pushTimeline(tl, t0 + (i + 1) * MOTION_WINDOW_DURATION_MS, 'low', 0.02);
}
assert(
  '10. timeline bucket aggregation',
  tl.buckets.length >= 1 && tl.buckets[0].windowCount > 0 && tl.buckets[0].dominant === 'low',
);

// 11 max capacity
let many = [];
for (let i = 0; i < MAX_MOTION_TIMELINE_BUCKETS + 50; i++) {
  many.push({ i });
}
many = capBuckets(many, MAX_MOTION_TIMELINE_BUCKETS);
assert('11. timeline max capacity', many.length === MAX_MOTION_TIMELINE_BUCKETS);

// 12 nueva sesión limpia timeline
const { timeline: tlB, reset: resetB } = resolveTimeline(
  { sessionId: 'A', buckets: [{ x: 1 }] },
  'B',
);
assert('12. nueva sesión limpia timeline', resetB && tlB.buckets.length === 0);

// 13 restore misma
const { timeline: tlA, reset: resetA } = resolveTimeline(
  { sessionId: 'A', buckets: [{ x: 1 }, { x: 2 }] },
  'A',
);
assert('13. restore misma sesión conserva', !resetA && tlA.buckets.length === 2);

// 14 cleanup conserva
flushTimeline(tl, t0 + 40_000);
const exportPayload = {
  sessionMotionStatistics: { ...session, endedAt: 't-end' },
  sessionMotionTimeline: { sessionId: 'A', buckets: tl.buckets },
};
assert(
  '14. cleanup conserva',
  exportPayload.sessionMotionStatistics.endedAt === 't-end' &&
    exportPayload.sessionMotionTimeline.buckets.length >= 1,
);

// 15 background gap ≠ low
session = applyCoverageGap(session);
const lowsBefore = session.lowActivityWindows;
assert(
  '15. background gap no se interpreta como low',
  session.coverageGapCount === 1 &&
    session.lowActivityWindows === lowsBefore &&
    session.currentLowSequenceWindows === 0,
);

if (process.exitCode) {
  console.log('\nvalidate-motion-classification: FAIL');
  process.exit(1);
}
console.log('\nvalidate-motion-classification: 15/15 PASS');
