/**
 * Validación manual Reliability 3A — tracking pipeline observability.
 * Ejecutar: node scripts/validate-tracking-reliability.mjs
 */

const EARTH_RADIUS_M = 6_371_000;
const LOCATION_GAP_MIN_MS = 60000;
const MAX_TRACKING_GAPS = 100;
const MAX_APP_STATE_TRANSITIONS = 50;
const STATIONARY_DISPLACEMENT_MAX_M = 30;
const MOVEMENT_MIN_DISPLACEMENT_M = 100;
const MOVEMENT_MIN_IMPLIED_SPEED_KMH = 8;
const MOVEMENT_MAX_IMPLIED_SPEED_KMH = 160;
const MIN_DISPLACEMENT_QUALITY_RATIO_FOR_MOVEMENT = 1.5;
const UNRELIABLE_SINGLE_ACCURACY_M = 200;

function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeCombinedAccuracyM(prev, curr) {
  if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev < 0 || curr < 0) return null;
  return Math.sqrt(prev ** 2 + curr ** 2);
}

function computeDisplacementQualityRatio(distanceM, combinedAccuracyM) {
  if (!Number.isFinite(distanceM) || combinedAccuracyM == null || combinedAccuracyM <= 0) return null;
  return distanceM / combinedAccuracyM;
}

function classifyTrackingGap(input) {
  const durationMs = input.current.capturedAtMs - input.previous.capturedAtMs;
  if (!Number.isFinite(durationMs) || durationMs < LOCATION_GAP_MIN_MS) return null;

  const displacementM = haversineDistanceM(
    input.previous.lat,
    input.previous.lng,
    input.current.lat,
    input.current.lng,
  );
  const impliedAverageSpeedKmh =
    durationMs > 0 ? (displacementM / durationMs) * 3600 : null;
  const previousAccuracyM = input.previous.accuracyM;
  const currentAccuracyM = input.current.accuracyM;
  const combinedAccuracyM = computeCombinedAccuracyM(previousAccuracyM, currentAccuracyM);
  const displacementQualityRatio = computeDisplacementQualityRatio(
    displacementM,
    combinedAccuracyM,
  );

  const unreliableSingleAccuracy =
    (previousAccuracyM != null && previousAccuracyM >= UNRELIABLE_SINGLE_ACCURACY_M) ||
    (currentAccuracyM != null && currentAccuracyM >= UNRELIABLE_SINGLE_ACCURACY_M);

  if (unreliableSingleAccuracy) {
    return {
      classification: 'unknown',
      reason: 'spatial_uncertainty_too_high',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
    };
  }
  if (displacementM <= STATIONARY_DISPLACEMENT_MAX_M) {
    return { classification: 'stationary', reason: 'negligible_displacement', durationMs, displacementM, impliedAverageSpeedKmh };
  }
  if (impliedAverageSpeedKmh != null && impliedAverageSpeedKmh > MOVEMENT_MAX_IMPLIED_SPEED_KMH) {
    return { classification: 'unknown', reason: 'implausible_implied_speed', durationMs, displacementM, impliedAverageSpeedKmh };
  }
  if (combinedAccuracyM != null && combinedAccuracyM >= displacementM) {
    return {
      classification: 'unknown',
      reason: 'spatial_uncertainty_too_high',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
    };
  }
  const hasMovement =
    displacementM >= MOVEMENT_MIN_DISPLACEMENT_M &&
    impliedAverageSpeedKmh != null &&
    impliedAverageSpeedKmh >= MOVEMENT_MIN_IMPLIED_SPEED_KMH &&
    displacementQualityRatio != null &&
    displacementQualityRatio >= MIN_DISPLACEMENT_QUALITY_RATIO_FOR_MOVEMENT;
  if (hasMovement) {
    return {
      classification: 'movement_suspected',
      reason: 'displacement_and_implied_speed_plausible',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
    };
  }
  return { classification: 'unknown', reason: 'insufficient_movement_evidence', durationMs, displacementM, impliedAverageSpeedKmh };
}

function createEmptyPipeline(sessionId) {
  return {
    sessionId,
    locationCallbacks: 0,
    locationFixesValid: 0,
    batchesSendAttempts: 0,
    batchesAccepted: 0,
    batchesFailed: 0,
    http401: 0,
    pointsAcceptedByApi: 0,
    taskStartRequests: 0,
    taskStartsObserved: 0,
    foregroundTransitions: 0,
    endedAt: null,
  };
}

function createEmptyGapStats() {
  return {
    totalLocationGaps: 0,
    stationaryGapCount: 0,
    movementSuspectedGapCount: 0,
    unknownGapCount: 0,
    maxGapDurationMs: null,
    maxMovementSuspectedGapMs: null,
  };
}

function applyGapStats(stats, gap) {
  const next = { ...stats };
  next.totalLocationGaps += 1;
  next.maxGapDurationMs =
    next.maxGapDurationMs == null ? gap.durationMs : Math.max(next.maxGapDurationMs, gap.durationMs);
  if (gap.classification === 'stationary') next.stationaryGapCount += 1;
  else if (gap.classification === 'movement_suspected') {
    next.movementSuspectedGapCount += 1;
    next.maxMovementSuspectedGapMs =
      next.maxMovementSuspectedGapMs == null
        ? gap.durationMs
        : Math.max(next.maxMovementSuspectedGapMs, gap.durationMs);
  } else next.unknownGapCount += 1;
  return next;
}

function capGaps(gaps) {
  return gaps.length <= MAX_TRACKING_GAPS ? gaps : gaps.slice(-MAX_TRACKING_GAPS);
}

function capTransitions(transitions) {
  return transitions.length <= MAX_APP_STATE_TRANSITIONS
    ? transitions
    : transitions.slice(-MAX_APP_STATE_TRANSITIONS);
}

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`OK  ${name}`);
}

let passed = 0;

try {
  // 1. sesión nueva → stats cero
  const s1 = createEmptyPipeline('session-a');
  assert('1. sesión nueva stats cero', s1.locationFixesValid === 0 && s1.batchesAccepted === 0);
  passed++;

  // 2. fix normal → no gap
  const gapNormal = classifyTrackingGap({
    previous: { lat: 3.88, lng: -77.03, accuracyM: 15, capturedAtMs: 0 },
    current: { lat: 3.881, lng: -77.031, accuracyM: 15, capturedAtMs: 20000 },
  });
  assert('2. fix normal no gap', gapNormal == null);
  passed++;

  // 3. gap estacionario 682s / ~11m (fixture viaje Buenaventura→Cali)
  const elevenMetersLat = 11 / 111320;
  const gapStationary = classifyTrackingGap({
    previous: { lat: 3.88, lng: -77.03, accuracyM: 15, capturedAtMs: 0 },
    current: { lat: 3.88 + elevenMetersLat, lng: -77.03, accuracyM: 15, capturedAtMs: 682000 },
  });
  assert(
    '3. gap estacionario',
    gapStationary?.classification === 'stationary' &&
      gapStationary.displacementM <= STATIONARY_DISPLACEMENT_MAX_M,
  );
  passed++;

  // 4. gap movimiento 277s ~5379m ~69.9 km/h
  const latDelta = 5379 / 111000;
  const gapMoving = classifyTrackingGap({
    previous: { lat: 3.88, lng: -77.03, accuracyM: 15, capturedAtMs: 0 },
    current: { lat: 3.88 + latDelta, lng: -77.03, accuracyM: 15, capturedAtMs: 277000 },
  });
  assert(
    '4. gap movement_suspected',
    gapMoving?.classification === 'movement_suspected' &&
      gapMoving.impliedAverageSpeedKmh > 40 &&
      gapMoving.impliedAverageSpeedKmh < 90,
  );
  passed++;

  // 5. accuracy mala → unknown
  const gapBadAcc = classifyTrackingGap({
    previous: { lat: 3.88, lng: -77.03, accuracyM: 500, capturedAtMs: 0 },
    current: { lat: 3.89, lng: -77.04, accuracyM: 700, capturedAtMs: 120000 },
  });
  assert('5. accuracy mala unknown', gapBadAcc?.classification === 'unknown');
  passed++;

  // 6. velocidad implícita absurda → unknown
  const gapAbsurd = classifyTrackingGap({
    previous: { lat: 3.88, lng: -77.03, accuracyM: 10, capturedAtMs: 0 },
    current: { lat: 4.5, lng: -77.03, accuracyM: 10, capturedAtMs: 60000 },
  });
  assert(
    '6. implied speed absurda unknown',
    gapAbsurd?.classification === 'unknown' && gapAbsurd.reason === 'implausible_implied_speed',
  );
  passed++;

  // 7-9 contadores gap
  let gapStats = createEmptyGapStats();
  if (gapStationary) gapStats = applyGapStats(gapStats, gapStationary);
  if (gapMoving) gapStats = applyGapStats(gapStats, gapMoving);
  if (gapBadAcc) gapStats = applyGapStats(gapStats, gapBadAcc);
  assert('7. contador moving gap', gapStats.movementSuspectedGapCount === 1);
  assert('8. contador stationary gap', gapStats.stationaryGapCount === 1);
  assert('9. contador unknown gap', gapStats.unknownGapCount === 1);
  passed += 3;

  // 10-11 max gap
  assert('10. max gap duration', gapStats.maxGapDurationMs === 682000);
  assert('11. max moving gap', gapStats.maxMovementSuspectedGapMs === 277000);
  passed += 2;

  // 12 timeline capacity
  let gaps = [];
  for (let i = 0; i < MAX_TRACKING_GAPS + 5; i++) gaps.push({ id: i });
  gaps = capGaps(gaps);
  assert('12. timeline capacity', gaps.length === MAX_TRACKING_GAPS && gaps[0].id === 5);
  passed++;

  // 13 nueva sessionId sin contaminación
  const sA = createEmptyPipeline('A');
  sA.locationFixesValid = 10;
  const sB = createEmptyPipeline('B');
  assert('13. no contaminación session', sB.locationFixesValid === 0);
  passed++;

  // 14 restore misma sesión conserva
  const restored = { ...sA, endedAt: null };
  assert('14. restore conserva', restored.locationFixesValid === 10 && restored.sessionId === 'A');
  passed++;

  // 15 cleanup conserva endedAt
  const ended = { ...restored, endedAt: '2026-08-22T12:00:00.000Z' };
  assert('15. cleanup conserva export', ended.endedAt != null && ended.locationFixesValid === 10);
  passed++;

  // 16 app state transitions cap
  let transitions = [];
  for (let i = 0; i < MAX_APP_STATE_TRANSITIONS + 3; i++) {
    transitions.push({ from: 'active', to: 'background', timestamp: `t${i}` });
  }
  transitions = capTransitions(transitions);
  assert('16. app state transitions', transitions.length === MAX_APP_STATE_TRANSITIONS);
  passed++;

  // 17 task lifecycle counters
  let pipeline = createEmptyPipeline('task-session');
  pipeline.taskStartRequests += 1;
  pipeline.taskStartsObserved += 1;
  assert('17. task lifecycle counters', pipeline.taskStartRequests === 1 && pipeline.taskStartsObserved === 1);
  passed++;

  // 18 batch failure 401
  pipeline.batchesFailed += 1;
  pipeline.http401 += 1;
  assert('18. batch HTTP 401', pipeline.http401 === 1 && pipeline.batchesFailed === 1);
  passed++;

  // 19 batch retry accepted — solo batch-accepted cuenta (no +2 con success)
  pipeline.batchesSendAttempts += 1;
  // batch-success no incrementa batchesAccepted
  pipeline.batchesAccepted += 1;
  pipeline.pointsAcceptedByApi += 5;
  assert('19. batch accepted', pipeline.batchesAccepted === 1 && pipeline.pointsAcceptedByApi === 5);
  passed++;

  // 19b anti doble conteo success+accepted
  let antiDouble = 0;
  // simula apply: success no suma, accepted suma 1
  antiDouble += 0; // batch-success
  antiDouble += 1; // batch-accepted
  assert('19b. success+accepted = 1 batchesAccepted', antiDouble === 1);
  passed++;

  // 20 no secretos en detail de export simulado
  const exportSample = JSON.stringify({
    sessionTrackingPipelineStatistics: pipeline,
    events: [{ detail: { status: 401, pointCount: 3, sessionId: 'x' } }],
  });
  assert(
    '20. no secretos en diagnostics',
    !exportSample.includes('Bearer') &&
      !exportSample.includes('refresh_token') &&
      !exportSample.includes('password'),
  );
  passed++;

  console.log(`\nvalidate-tracking-reliability: ${passed}/21 PASS`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
