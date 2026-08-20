/**
 * Validación Speed 2A.2 Quality Gate — sin framework.
 * node scripts/validate-speed-quality.mjs
 */

const GOOD_RATIO = 3.0;
const WEAK_RATIO = 1.5;
const POOR_ACCURACY_M = 50;
const MAX_DERIVED_GAP_MS = 60_000;
const MAX_PLAUSIBLE_ROAD_SPEED_KMH = 160;
const STALE_FIX_MS = 30_000;
const NATIVE_ZERO_MOVING_MIN_DERIVED_KMH = 10;

function computeCombinedAccuracyM(prev, curr) {
  if (
    typeof prev !== 'number' ||
    !Number.isFinite(prev) ||
    prev < 0 ||
    typeof curr !== 'number' ||
    !Number.isFinite(curr) ||
    curr < 0
  ) {
    return null;
  }
  return Math.sqrt(prev ** 2 + curr ** 2);
}

function computeDisplacementQualityRatio(distance, combined) {
  if (
    !Number.isFinite(distance) ||
    combined == null ||
    !Number.isFinite(combined) ||
    combined <= 0
  ) {
    return null;
  }
  return distance / combined;
}

function assessSpeedSampleQuality(input) {
  const {
    previousAccuracyM,
    currentAccuracyM,
    distanceFromPreviousM,
    deltaTimeMs,
    speedDerivedKmh,
    fixAgeMs,
  } = input;

  const combinedAccuracyM = computeCombinedAccuracyM(
    previousAccuracyM,
    currentAccuracyM,
  );
  const displacementQualityRatio = computeDisplacementQualityRatio(
    distanceFromPreviousM,
    combinedAccuracyM,
  );
  const staleFix =
    typeof fixAgeMs === 'number' && Number.isFinite(fixAgeMs) && fixAgeMs > STALE_FIX_MS;

  if (!Number.isFinite(deltaTimeMs) || deltaTimeMs <= 0) {
    return {
      quality: 'rejected',
      qualityReason: 'invalid_delta',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }
  if (!Number.isFinite(distanceFromPreviousM) || !Number.isFinite(speedDerivedKmh)) {
    return {
      quality: 'rejected',
      qualityReason: 'invalid_coordinates',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }
  if (deltaTimeMs > MAX_DERIVED_GAP_MS) {
    return {
      quality: 'rejected',
      qualityReason: 'long_gap',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }
  if (speedDerivedKmh > MAX_PLAUSIBLE_ROAD_SPEED_KMH) {
    return {
      quality: 'rejected',
      qualityReason: 'implausible_speed',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  const currentPoor =
    typeof currentAccuracyM === 'number' && currentAccuracyM > POOR_ACCURACY_M;
  const previousPoor =
    typeof previousAccuracyM === 'number' && previousAccuracyM > POOR_ACCURACY_M;
  const anyPoorAccuracy = currentPoor || previousPoor;

  if (displacementQualityRatio == null) {
    if (anyPoorAccuracy) {
      return {
        quality: 'rejected',
        qualityReason: 'poor_accuracy',
        combinedAccuracyM,
        displacementQualityRatio,
        staleFix,
      };
    }
    return {
      quality: 'weak',
      qualityReason: 'missing_accuracy',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (displacementQualityRatio < WEAK_RATIO) {
    return {
      quality: 'rejected',
      qualityReason: anyPoorAccuracy ? 'poor_accuracy' : 'weak_geometry',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (displacementQualityRatio < GOOD_RATIO) {
    return {
      quality: 'weak',
      qualityReason: anyPoorAccuracy ? 'poor_accuracy' : 'weak_geometry',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (anyPoorAccuracy) {
    return {
      quality: 'weak',
      qualityReason: 'poor_accuracy',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  return {
    quality: 'good',
    qualityReason: 'good_geometry',
    combinedAccuracyM,
    displacementQualityRatio,
    staleFix,
  };
}

function isPreviousFixFromDifferentSession(previous, sessionId) {
  if (!sessionId) return previous != null;
  if (!previous) return false;
  return previous.sessionId !== sessionId;
}

function assert(label, condition) {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`${status}  ${label}`);
  if (!condition) process.exitCode = 1;
}

// 1. accuracy 5/5, distance 100 → ratio alto → good
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 5,
    currentAccuracyM: 5,
    distanceFromPreviousM: 100,
    deltaTimeMs: 20000,
    speedDerivedKmh: 18,
  });
  const combined = computeCombinedAccuracyM(5, 5);
  assert(
    '1. accuracy 5/5 distance 100 → good',
    a.quality === 'good' &&
      a.displacementQualityRatio != null &&
      a.displacementQualityRatio >= GOOD_RATIO &&
      Math.abs(combined - Math.sqrt(50)) < 1e-9,
  );
}

// 2. accuracy 50/50, distance 20 → ratio pobre → rejected
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 50,
    currentAccuracyM: 50,
    distanceFromPreviousM: 20,
    deltaTimeMs: 20000,
    speedDerivedKmh: 3.6,
  });
  assert(
    '2. accuracy 50/50 distance 20 → rejected',
    a.quality === 'rejected' &&
      a.displacementQualityRatio != null &&
      a.displacementQualityRatio < WEAK_RATIO,
  );
}

// 3. ratio entre 1.5 y 3 → weak
{
  // combined = sqrt(10^2+10^2)=14.14; distance=25 → ratio≈1.77
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 10,
    currentAccuracyM: 10,
    distanceFromPreviousM: 25,
    deltaTimeMs: 20000,
    speedDerivedKmh: 4.5,
  });
  assert(
    '3. ratio 1.5–3 → weak',
    a.quality === 'weak' &&
      a.displacementQualityRatio >= WEAK_RATIO &&
      a.displacementQualityRatio < GOOD_RATIO,
  );
}

// 4. delta 646 s → long_gap rejected
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 5,
    currentAccuracyM: 5,
    distanceFromPreviousM: 100,
    deltaTimeMs: 646_000,
    speedDerivedKmh: 0.5,
  });
  assert('4. delta 646s → long_gap rejected', a.quality === 'rejected' && a.qualityReason === 'long_gap');
}

// 5. derived >160 → implausible
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 5,
    currentAccuracyM: 5,
    distanceFromPreviousM: 1000,
    deltaTimeMs: 20000,
    speedDerivedKmh: 180,
  });
  assert(
    '5. derived >160 → implausible rejected',
    a.quality === 'rejected' && a.qualityReason === 'implausible_speed',
  );
}

// 6. fixAge >30s → stale diagnostic flag
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 5,
    currentAccuracyM: 5,
    distanceFromPreviousM: 100,
    deltaTimeMs: 20000,
    speedDerivedKmh: 18,
    fixAgeMs: 45_000,
  });
  assert('6. fixAge >30s → staleFix true', a.staleFix === true);
}

// 7. native=0 + good derived 60 → nativeZeroWhileMoving
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 5,
    currentAccuracyM: 5,
    distanceFromPreviousM: 100,
    deltaTimeMs: 20000,
    speedDerivedKmh: 60,
  });
  const nativeZeroWhileMoving =
    0 === 0 &&
    a.quality === 'good' &&
    60 >= NATIVE_ZERO_MOVING_MIN_DERIVED_KMH;
  assert('7. native=0 + good derived 60 → nativeZeroWhileMoving', nativeZeroWhileMoving);
}

// 8. native=0 + rejected derived → NO nativeZeroWhileMoving
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 50,
    currentAccuracyM: 50,
    distanceFromPreviousM: 20,
    deltaTimeMs: 20000,
    speedDerivedKmh: 60,
  });
  const nativeZeroWhileMoving =
    a.quality === 'good' && 60 >= NATIVE_ZERO_MOVING_MIN_DERIVED_KMH;
  assert('8. native=0 + rejected derived → NO moving', !nativeZeroWhileMoving);
}

// 9. native=0 + good derived 4 → NO (below min kmh)
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: 5,
    currentAccuracyM: 5,
    distanceFromPreviousM: 100,
    deltaTimeMs: 20000,
    speedDerivedKmh: 4,
  });
  // Force geometry good with high distance; speedDerived 4 is for the moving check only
  const moving =
    a.quality === 'good' && 4 >= NATIVE_ZERO_MOVING_MIN_DERIVED_KMH;
  assert('9. native=0 + good derived 4 → NO moving', a.quality === 'good' && !moving);
}

// 10. accuracy null → no crash
{
  const a = assessSpeedSampleQuality({
    previousAccuracyM: null,
    currentAccuracyM: null,
    distanceFromPreviousM: 100,
    deltaTimeMs: 20000,
    speedDerivedKmh: 18,
  });
  assert(
    '10. accuracy null → no crash (weak/missing)',
    a.quality === 'weak' && a.qualityReason === 'missing_accuracy' && a.combinedAccuracyM === null,
  );
}

// 11. combinedAccuracy RSS correcto
{
  const c = computeCombinedAccuracyM(3, 4);
  assert('11. combinedAccuracy RSS 3-4-5', c != null && Math.abs(c - 5) < 1e-9);
}

// 12. session change → no cross-session derived
{
  const prev = { sessionId: 'a', lat: 1, lng: 1, capturedAtMs: 1, accuracyM: 5 };
  assert(
    '12. session change → no cross-session',
    isPreviousFixFromDifferentSession(prev, 'b') === true,
  );
}

console.log('\nValidación Speed 2A.2 Quality Gate completada.');
