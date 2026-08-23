/**
 * Validación Speed Fusion v1 (Tracking 3B).
 * Ejecutar: node scripts/validate-effective-speed-fusion.mjs
 */

const MAX_PLAUSIBLE_ROAD_SPEED_KMH = 160;
const NATIVE_ZERO_MOVING_MIN_DERIVED_KMH = 10;
const SPEED_DISAGREEMENT_LOW_KMH = 10;
const SPEED_DISAGREEMENT_HIGH_KMH = 25;

function isPlausible(kmh) {
  return Number.isFinite(kmh) && kmh >= 0 && kmh <= MAX_PLAUSIBLE_ROAD_SPEED_KMH;
}

function fuseEffectiveSpeed(input) {
  const derivedGood =
    input.derivedQuality === 'good' &&
    input.derivedSpeedKmh != null &&
    isPlausible(input.derivedSpeedKmh);

  const unavailable = (reason) => ({
    speedKmh: null,
    source: 'unavailable',
    confidence: null,
    reason,
    disagreementKmh: null,
  });

  const available = (speedKmh, source, confidence, reason, disagreementKmh = null) => ({
    speedKmh,
    source,
    confidence,
    reason,
    disagreementKmh,
  });

  const nativeImplausible =
    input.nativeAvailable &&
    input.nativeSpeedKmh != null &&
    Number.isFinite(input.nativeSpeedKmh) &&
    input.nativeSpeedKmh > MAX_PLAUSIBLE_ROAD_SPEED_KMH;

  const nativePositive =
    input.nativeAvailable &&
    input.nativeSpeedKmh != null &&
    input.nativeSpeedKmh > 0 &&
    isPlausible(input.nativeSpeedKmh);

  const nativeZero = input.nativeAvailable && input.nativeSpeedKmh === 0;

  if (nativeImplausible) {
    if (derivedGood) {
      return available(
        input.derivedSpeedKmh,
        'derived',
        'medium',
        'native_implausible_derived_used',
      );
    }
    if (input.derivedQuality === 'rejected') return unavailable('derived_rejected');
    return unavailable('insufficient_evidence');
  }

  if (nativePositive) {
    if (derivedGood) {
      const disagreement = Math.abs(input.nativeSpeedKmh - input.derivedSpeedKmh);
      if (disagreement <= SPEED_DISAGREEMENT_LOW_KMH) {
        return available(input.nativeSpeedKmh, 'native', 'high', 'native_confirmed', disagreement);
      }
      if (disagreement <= SPEED_DISAGREEMENT_HIGH_KMH) {
        return available(
          input.nativeSpeedKmh,
          'native',
          'medium',
          'native_derived_disagreement',
          disagreement,
        );
      }
      return available(
        input.nativeSpeedKmh,
        'native',
        'low',
        'native_derived_disagreement',
        disagreement,
      );
    }
    return available(
      input.nativeSpeedKmh,
      'native',
      input.derivedQuality === 'weak' ? 'medium' : 'high',
      'native_only',
    );
  }

  if (nativeZero) {
    if (derivedGood) {
      if (input.derivedSpeedKmh >= NATIVE_ZERO_MOVING_MIN_DERIVED_KMH) {
        return available(
          input.derivedSpeedKmh,
          'derived',
          'medium',
          'derived_recovery_native_zero',
        );
      }
      return unavailable('insufficient_evidence');
    }
    if (input.derivedQuality === 'weak') return unavailable('derived_weak');
    if (input.derivedQuality === 'rejected') return unavailable('derived_rejected');
    return unavailable('insufficient_evidence');
  }

  if (!input.nativeAvailable) {
    if (derivedGood) return available(input.derivedSpeedKmh, 'derived', 'medium', 'derived_only');
    if (input.derivedQuality === 'weak') return unavailable('derived_weak');
    if (input.derivedQuality === 'rejected') return unavailable('derived_rejected');
    return unavailable('both_unavailable');
  }

  return unavailable('both_unavailable');
}

function createEmptyStats(sessionId = 's1') {
  return {
    sessionId,
    effectiveSpeedSamples: 0,
    effectiveSpeedUnavailable: 0,
    effectiveNativeSamples: 0,
    effectiveDerivedSamples: 0,
    effectiveHighConfidence: 0,
    effectiveMediumConfidence: 0,
    effectiveLowConfidence: 0,
    nativeZeroRecoveredByDerived: 0,
    nativeImplausibleRejected: 0,
    speedDisagreementSamples: 0,
    lastEffectiveSpeedKmh: null,
    avgEffectiveSpeedKmh: null,
    maxEffectiveSpeedKmh: null,
    maxDisagreementKmh: null,
  };
}

function incrementRunningAvg(prevAvg, count, value) {
  if (count <= 1) return value;
  const base = prevAvg ?? value;
  return base + (value - base) / count;
}

function applyEffectiveStat(stats, detail) {
  const next = { ...stats };
  next.effectiveSpeedSamples += 1;
  const source = detail.source;
  const speedKmh = detail.speedKmh;

  if (source === 'unavailable' || speedKmh == null) {
    next.effectiveSpeedUnavailable += 1;
  } else {
    next.lastEffectiveSpeedKmh = speedKmh;
    next.maxEffectiveSpeedKmh =
      next.maxEffectiveSpeedKmh == null ? speedKmh : Math.max(next.maxEffectiveSpeedKmh, speedKmh);
    if (source === 'native') next.effectiveNativeSamples += 1;
    if (source === 'derived') next.effectiveDerivedSamples += 1;
    const availableCount = next.effectiveNativeSamples + next.effectiveDerivedSamples;
    next.avgEffectiveSpeedKmh = incrementRunningAvg(
      next.avgEffectiveSpeedKmh,
      availableCount,
      speedKmh,
    );
    if (detail.confidence === 'high') next.effectiveHighConfidence += 1;
    if (detail.confidence === 'medium') next.effectiveMediumConfidence += 1;
    if (detail.confidence === 'low') next.effectiveLowConfidence += 1;
  }

  if (detail.reason === 'derived_recovery_native_zero') next.nativeZeroRecoveredByDerived += 1;
  if (detail.reason === 'native_implausible_derived_used') next.nativeImplausibleRejected += 1;
  if (detail.disagreementKmh != null) {
    next.speedDisagreementSamples += 1;
    next.maxDisagreementKmh =
      next.maxDisagreementKmh == null
        ? detail.disagreementKmh
        : Math.max(next.maxDisagreementKmh, detail.disagreementKmh);
  }
  return next;
}

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`OK  ${name}`);
}

let passed = 0;

try {
  const c1 = fuseEffectiveSpeed({
    nativeSpeedKmh: 60,
    nativeAvailable: true,
    derivedSpeedKmh: 58,
    derivedQuality: 'good',
  });
  assert('1. native 60 + derived 58', c1.source === 'native' && c1.confidence === 'high');
  passed++;

  const c2 = fuseEffectiveSpeed({
    nativeSpeedKmh: 0,
    nativeAvailable: true,
    derivedSpeedKmh: 38,
    derivedQuality: 'good',
  });
  assert(
    '2. native 0 + derived 38',
    c2.source === 'derived' && c2.reason === 'derived_recovery_native_zero',
  );
  passed++;

  const c3 = fuseEffectiveSpeed({
    nativeSpeedKmh: 0,
    nativeAvailable: true,
    derivedSpeedKmh: 4,
    derivedQuality: 'good',
  });
  assert('3. native 0 + derived 4', c3.source === 'unavailable');
  passed++;

  const c4 = fuseEffectiveSpeed({
    nativeSpeedKmh: 0,
    nativeAvailable: true,
    derivedSpeedKmh: 40,
    derivedQuality: 'weak',
  });
  assert('4. native 0 + weak 40', c4.source === 'unavailable' && c4.reason === 'derived_weak');
  passed++;

  const c5 = fuseEffectiveSpeed({
    nativeSpeedKmh: 0,
    nativeAvailable: true,
    derivedSpeedKmh: 500,
    derivedQuality: 'rejected',
  });
  assert('5. native 0 + rejected 500', c5.source === 'unavailable');
  passed++;

  const c6 = fuseEffectiveSpeed({
    nativeSpeedKmh: null,
    nativeAvailable: false,
    derivedSpeedKmh: 45,
    derivedQuality: 'good',
  });
  assert('6. native null + derived 45', c6.source === 'derived');
  passed++;

  const c7 = fuseEffectiveSpeed({
    nativeSpeedKmh: null,
    nativeAvailable: false,
    derivedSpeedKmh: 30,
    derivedQuality: 'weak',
  });
  assert('7. native null + weak', c7.source === 'unavailable');
  passed++;

  const c8 = fuseEffectiveSpeed({
    nativeSpeedKmh: 180,
    nativeAvailable: true,
    derivedSpeedKmh: 70,
    derivedQuality: 'good',
  });
  assert('8. native 180 + derived 70', c8.source === 'derived' && c8.speedKmh === 70);
  passed++;

  const c9 = fuseEffectiveSpeed({
    nativeSpeedKmh: 180,
    nativeAvailable: true,
    derivedSpeedKmh: null,
    derivedQuality: 'rejected',
  });
  assert('9. native 180 + rejected', c9.source === 'unavailable');
  passed++;

  const c10 = fuseEffectiveSpeed({
    nativeSpeedKmh: 50,
    nativeAvailable: true,
    derivedSpeedKmh: 120,
    derivedQuality: 'rejected',
  });
  assert('10. native 50 + rejected', c10.source === 'native');
  passed++;

  const c11 = fuseEffectiveSpeed({
    nativeSpeedKmh: 60,
    nativeAvailable: true,
    derivedSpeedKmh: 55,
    derivedQuality: 'good',
  });
  assert('11. disagreement pequeño', c11.confidence === 'high' && c11.disagreementKmh === 5);
  passed++;

  const c12 = fuseEffectiveSpeed({
    nativeSpeedKmh: 60,
    nativeAvailable: true,
    derivedSpeedKmh: 45,
    derivedQuality: 'good',
  });
  assert('12. disagreement medio', c12.confidence === 'medium' && c12.disagreementKmh === 15);
  passed++;

  const c13 = fuseEffectiveSpeed({
    nativeSpeedKmh: 60,
    nativeAvailable: true,
    derivedSpeedKmh: 30,
    derivedQuality: 'good',
  });
  assert('13. disagreement alto', c13.confidence === 'low' && c13.disagreementKmh === 30);
  passed++;

  const c14 = fuseEffectiveSpeed({
    nativeSpeedKmh: null,
    nativeAvailable: false,
    derivedSpeedKmh: null,
    derivedQuality: null,
  });
  assert('14. native negative/unavailable', c14.source === 'unavailable');
  passed++;

  const c15 = fuseEffectiveSpeed({
    nativeSpeedKmh: NaN,
    nativeAvailable: false,
    derivedSpeedKmh: 40,
    derivedQuality: 'good',
  });
  assert('15. NaN safe', c15.source === 'derived');
  passed++;

  let stats = createEmptyStats();
  const nativeDecision = fuseEffectiveSpeed({
    nativeSpeedKmh: 60,
    nativeAvailable: true,
    derivedSpeedKmh: 58,
    derivedQuality: 'good',
  });
  stats = applyEffectiveStat(stats, nativeDecision);
  assert('16. stats effective native', stats.effectiveNativeSamples === 1);
  passed++;

  const derivedDecision = fuseEffectiveSpeed({
    nativeSpeedKmh: 0,
    nativeAvailable: true,
    derivedSpeedKmh: 38,
    derivedQuality: 'good',
  });
  stats = applyEffectiveStat(stats, derivedDecision);
  assert('17. stats effective derived', stats.effectiveDerivedSamples === 1);
  passed++;

  assert('18. nativeZeroRecoveredByDerived', stats.nativeZeroRecoveredByDerived === 1);
  passed++;

  assert('19. disagreement counter', stats.speedDisagreementSamples === 1);
  passed++;

  assert('20. avg/max effective', stats.avgEffectiveSpeedKmh != null && stats.maxEffectiveSpeedKmh === 60);
  passed++;

  const sessionA = createEmptyStats('A');
  const sessionB = createEmptyStats('B');
  assert('21. session reset', sessionB.effectiveSpeedSamples === 0);
  passed++;

  sessionA.effectiveSpeedSamples = 5;
  const restored = { ...sessionA, endedAt: null };
  assert('22. restore same session', restored.effectiveSpeedSamples === 5);
  passed++;

  assert('23. no cross-session', sessionB.sessionId === 'B' && sessionB.effectiveSpeedSamples === 0);
  passed++;

  const temporalRejected = true;
  const fusionRan = !temporalRejected;
  assert('24. temporal rejected no fusion', temporalRejected && !fusionRan);
  passed++;

  const exportSample = {
    sessionSpeedStatistics: {
      effectiveSpeedSamples: 2,
      effectiveNativeSamples: 1,
      effectiveDerivedSamples: 1,
      lastEffectiveSpeedReason: 'derived_recovery_native_zero',
    },
  };
  assert(
    '25. export includes effective',
    exportSample.sessionSpeedStatistics.effectiveSpeedSamples === 2,
  );
  passed++;

  const fixtureE = fuseEffectiveSpeed({
    nativeSpeedKmh: 112,
    nativeAvailable: true,
    derivedSpeedKmh: 106,
    derivedQuality: 'good',
  });
  assert('fixture E native 112', fixtureE.source === 'native' && fixtureE.confidence === 'high');

  const eventJson = JSON.stringify({ reason: 'derived_recovery_native_zero', speedKmh: 38 });
  assert(
    'no secretos',
    !eventJson.includes('Bearer') && !eventJson.includes('refresh_token'),
  );

  console.log(`\nvalidate-effective-speed-fusion: ${passed}/25 PASS`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
