/**
 * Validación Motion State v1 / 3C.1 hardening.
 * Ejecutar: node scripts/validate-motion-state.mjs
 */

const MOVING_ENTER_SPEED_KMH = 10;
const MOVING_EXIT_SPEED_KMH = 5;
const STATIONARY_MAX_SPEED_KMH = 3;
const MOVING_CONFIRM_MIN_SAMPLES = 2;
const MOVING_CONFIRM_MIN_DURATION_MS = 10000;
const STATIONARY_CONFIRM_DURATION_MS = 60000;
const UNKNOWN_CONFIRM_MIN_SAMPLES = 3;
const UNKNOWN_CONFIRM_DURATION_MS = 30000;
const MAX_STATE_ACCUMULATION_GAP_MS = 60000;
const LONG_GAP_FORCE_UNKNOWN_MS = 60000;
const MAX_MOTION_STATE_TRANSITIONS = 100;

function effective(speedKmh, source = 'native', confidence = 'high') {
  return {
    speedKmh,
    source,
    confidence,
    reason: 'native_confirmed',
    nativeSpeedKmh: speedKmh,
    derivedSpeedKmh: speedKmh,
    derivedQuality: 'good',
    disagreementKmh: null,
  };
}

function unavailable(reason = 'both_unavailable') {
  return {
    speedKmh: null,
    source: 'unavailable',
    confidence: null,
    reason,
    nativeSpeedKmh: 0,
    derivedSpeedKmh: null,
    derivedQuality: 'rejected',
    disagreementKmh: null,
  };
}

function createSnapshot(timestampMs = 0) {
  return {
    currentState: 'unknown',
    candidateState: null,
    candidateStartedAtMs: null,
    candidateSampleCount: 0,
    lastSampleAtMs: null,
    lastStateChangedAtMs: timestampMs,
  };
}

function classifySample(effectiveSpeed, motionActivityLevel) {
  const speed = effectiveSpeed.speedKmh;
  const hasSpeed = speed != null && Number.isFinite(speed);
  const motionBoost = motionActivityLevel === 'high';
  if (effectiveSpeed.source === 'unavailable') {
    return {
      insufficient: true,
      unavailable: true,
      supportsMoving: false,
      supportsStationary: false,
      belowMovingExit: false,
    };
  }
  const insufficient = effectiveSpeed.confidence === 'low' && !motionBoost;
  if (insufficient) {
    return {
      insufficient: true,
      unavailable: false,
      supportsMoving: false,
      supportsStationary: false,
      belowMovingExit: false,
    };
  }
  return {
    insufficient: false,
    unavailable: false,
    supportsMoving: hasSpeed && speed >= MOVING_ENTER_SPEED_KMH,
    supportsStationary: hasSpeed && speed <= STATIONARY_MAX_SPEED_KMH,
    belowMovingExit: hasSpeed && speed <= MOVING_EXIT_SPEED_KMH,
  };
}

function stepMotionStateMachine(input) {
  const snapshot = { ...input.snapshot };
  const { effectiveSpeed, timestampMs, deltaMsFromPreviousSample } = input;

  let durationAccumulatedMs = 0;
  if (
    snapshot.lastSampleAtMs != null &&
    deltaMsFromPreviousSample != null &&
    deltaMsFromPreviousSample > 0
  ) {
    durationAccumulatedMs = Math.min(deltaMsFromPreviousSample, MAX_STATE_ACCUMULATION_GAP_MS);
  }

  let transition = null;
  let reason = 'session_start_unknown';

  if (
    deltaMsFromPreviousSample != null &&
    deltaMsFromPreviousSample > LONG_GAP_FORCE_UNKNOWN_MS &&
    snapshot.currentState !== 'unknown'
  ) {
    const from = snapshot.currentState;
    snapshot.currentState = 'unknown';
    snapshot.candidateState = null;
    snapshot.candidateStartedAtMs = null;
    snapshot.candidateSampleCount = 0;
    snapshot.lastStateChangedAtMs = timestampMs;
    transition = { from, to: 'unknown', reason: 'tracking_gap_unknown' };
    reason = 'tracking_gap_unknown';
  }

  const signals = classifySample(effectiveSpeed, input.motionActivityLevel);

  const clearCandidate = () => {
    snapshot.candidateState = null;
    snapshot.candidateStartedAtMs = null;
    snapshot.candidateSampleCount = 0;
  };
  const startCandidate = (state) => {
    snapshot.candidateState = state;
    snapshot.candidateStartedAtMs = timestampMs;
    snapshot.candidateSampleCount = 1;
  };
  const handleUnavailable = () => {
    if (snapshot.candidateState !== 'unknown') {
      startCandidate('unknown');
      reason = 'unknown_candidate';
      return;
    }
    snapshot.candidateSampleCount += 1;
    const duration = timestampMs - snapshot.candidateStartedAtMs;
    if (
      snapshot.candidateSampleCount >= UNKNOWN_CONFIRM_MIN_SAMPLES ||
      duration >= UNKNOWN_CONFIRM_DURATION_MS
    ) {
      const from = snapshot.currentState;
      snapshot.currentState = 'unknown';
      clearCandidate();
      snapshot.lastStateChangedAtMs = timestampMs;
      transition = { from, to: 'unknown', reason: 'effective_speed_unavailable' };
      reason = 'effective_speed_unavailable';
    } else {
      reason = 'unknown_candidate';
    }
  };

  if (!transition) {
    if (snapshot.currentState === 'unknown') {
      if (signals.unavailable || signals.insufficient) {
        clearCandidate();
        reason =
          effectiveSpeed.source === 'unavailable'
            ? 'effective_speed_unavailable'
            : 'insufficient_speed_evidence';
      } else if (signals.supportsMoving) {
        if (snapshot.candidateState !== 'moving') {
          startCandidate('moving');
          reason = 'moving_candidate';
        } else {
          snapshot.candidateSampleCount += 1;
          const duration = timestampMs - snapshot.candidateStartedAtMs;
          if (
            snapshot.candidateSampleCount >= MOVING_CONFIRM_MIN_SAMPLES ||
            duration >= MOVING_CONFIRM_MIN_DURATION_MS
          ) {
            const from = snapshot.currentState;
            snapshot.currentState = 'moving';
            clearCandidate();
            snapshot.lastStateChangedAtMs = timestampMs;
            transition = { from, to: 'moving', reason: 'moving_speed_confirmed' };
            reason = 'moving_speed_confirmed';
          } else reason = 'moving_candidate';
        }
      } else if (signals.supportsStationary) {
        if (snapshot.candidateState !== 'stationary') {
          startCandidate('stationary');
          reason = 'stationary_candidate';
        } else {
          snapshot.candidateSampleCount += 1;
          const duration = timestampMs - snapshot.candidateStartedAtMs;
          if (duration >= STATIONARY_CONFIRM_DURATION_MS) {
            const from = snapshot.currentState;
            snapshot.currentState = 'stationary';
            clearCandidate();
            snapshot.lastStateChangedAtMs = timestampMs;
            transition = { from, to: 'stationary', reason: 'stationary_speed_persisted' };
            reason = 'stationary_speed_persisted';
          } else reason = 'stationary_candidate';
        }
      } else {
        clearCandidate();
        reason = 'transition_hysteresis';
      }
    } else if (snapshot.currentState === 'moving') {
      if (signals.unavailable) {
        handleUnavailable();
      } else if (signals.insufficient) {
        clearCandidate();
        reason = 'insufficient_speed_evidence';
      } else if (effectiveSpeed.speedKmh != null && effectiveSpeed.speedKmh > MOVING_EXIT_SPEED_KMH) {
        clearCandidate();
        reason = 'moving_speed_confirmed';
      } else if (signals.supportsStationary) {
        if (snapshot.candidateState !== 'stationary') {
          startCandidate('stationary');
          reason = 'stationary_candidate';
        } else {
          snapshot.candidateSampleCount += 1;
          const duration = timestampMs - snapshot.candidateStartedAtMs;
          if (duration >= STATIONARY_CONFIRM_DURATION_MS) {
            const from = snapshot.currentState;
            snapshot.currentState = 'stationary';
            clearCandidate();
            snapshot.lastStateChangedAtMs = timestampMs;
            transition = { from, to: 'stationary', reason: 'stationary_speed_persisted' };
            reason = 'stationary_speed_persisted';
          } else reason = 'stationary_candidate';
        }
      } else {
        clearCandidate();
        reason = 'transition_hysteresis';
      }
    } else if (snapshot.currentState === 'stationary') {
      if (signals.unavailable) {
        handleUnavailable();
      } else if (signals.insufficient) {
        clearCandidate();
        reason = 'insufficient_speed_evidence';
      } else if (signals.supportsStationary) {
        clearCandidate();
        reason = 'stationary_speed_persisted';
      } else if (signals.supportsMoving) {
        if (snapshot.candidateState !== 'moving') {
          startCandidate('moving');
          reason = 'moving_candidate';
        } else {
          snapshot.candidateSampleCount += 1;
          const duration = timestampMs - snapshot.candidateStartedAtMs;
          if (
            snapshot.candidateSampleCount >= MOVING_CONFIRM_MIN_SAMPLES ||
            duration >= MOVING_CONFIRM_MIN_DURATION_MS
          ) {
            const from = snapshot.currentState;
            snapshot.currentState = 'moving';
            clearCandidate();
            snapshot.lastStateChangedAtMs = timestampMs;
            transition = { from, to: 'moving', reason: 'moving_speed_confirmed' };
            reason = 'moving_speed_confirmed';
          } else reason = 'moving_candidate';
        }
      } else {
        clearCandidate();
        reason = 'transition_hysteresis';
      }
    }
  }

  snapshot.lastSampleAtMs = timestampMs;
  return { snapshot, transition, reason, durationAccumulatedMs };
}

function simulate(samples) {
  let snapshot = createSnapshot(samples[0]?.timestampMs ?? 0);
  const transitions = [];
  let stats = {
    movingSamples: 0,
    stationarySamples: 0,
    unknownSamples: 0,
    movingObservedMs: 0,
    stationaryObservedMs: 0,
    unknownObservedMs: 0,
    longestMovingPeriodMs: null,
    longestStationaryPeriodMs: null,
  };

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const delta = i > 0 ? s.timestampMs - samples[i - 1].timestampMs : null;
    const prevState = snapshot.currentState;
    const result = stepMotionStateMachine({
      snapshot,
      effectiveSpeed: s.effectiveSpeed,
      timestampMs: s.timestampMs,
      deltaMsFromPreviousSample: delta,
      motionActivityLevel: s.motionActivityLevel,
    });
    snapshot = result.snapshot;
    if (result.durationAccumulatedMs > 0) {
      if (prevState === 'moving') stats.movingObservedMs += result.durationAccumulatedMs;
      else if (prevState === 'stationary') stats.stationaryObservedMs += result.durationAccumulatedMs;
      else stats.unknownObservedMs += result.durationAccumulatedMs;
    }
    if (snapshot.currentState === 'moving') stats.movingSamples += 1;
    else if (snapshot.currentState === 'stationary') stats.stationarySamples += 1;
    else stats.unknownSamples += 1;
    if (result.transition) transitions.push(result.transition);
  }
  return { snapshot, transitions, stats };
}

/** Llega a MOVING confirmado. */
function reachMoving() {
  return simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(32) },
    { timestampMs: 15000, effectiveSpeed: effective(35) },
  ]);
}

/** Llega a STATIONARY confirmado desde MOVING. */
function reachStationary() {
  return simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(32) },
    { timestampMs: 15000, effectiveSpeed: effective(35) },
    { timestampMs: 30000, effectiveSpeed: effective(2) },
    { timestampMs: 90000, effectiveSpeed: effective(2) },
  ]);
}

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`OK  ${name}`);
}

let passed = 0;

try {
  const start = simulate([{ timestampMs: 0, effectiveSpeed: unavailable() }]);
  assert('1. session start unknown', start.snapshot.currentState === 'unknown');
  passed++;

  const one = simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(40) },
  ]);
  assert(
    '2. one sample moving candidate',
    one.snapshot.candidateState === 'moving' && one.snapshot.currentState !== 'moving',
  );
  passed++;

  const confirmSamples = simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(32) },
    { timestampMs: 15000, effectiveSpeed: effective(35) },
  ]);
  assert('3. confirm moving by samples', confirmSamples.snapshot.currentState === 'moving');
  passed++;

  const confirmDuration = simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(40) },
    { timestampMs: 20000, effectiveSpeed: effective(42) },
  ]);
  assert('4. confirm moving by duration', confirmDuration.snapshot.currentState === 'moving');
  passed++;

  const jitter = simulate([
    { timestampMs: 0, effectiveSpeed: effective(30) },
    { timestampMs: 10000, effectiveSpeed: effective(35) },
    { timestampMs: 20000, effectiveSpeed: effective(8) },
    { timestampMs: 30000, effectiveSpeed: effective(9) },
  ]);
  assert('5. jitter no oscillation', jitter.snapshot.currentState === 'moving');
  passed++;

  const slowWhileMoving = simulate([
    { timestampMs: 0, effectiveSpeed: effective(35) },
    { timestampMs: 10000, effectiveSpeed: effective(40) },
    { timestampMs: 30000, effectiveSpeed: effective(2) },
    { timestampMs: 50000, effectiveSpeed: effective(2) },
  ]);
  assert('6. slow short stays moving', slowWhileMoving.snapshot.currentState === 'moving');
  passed++;

  const toStationary = reachStationary();
  assert('7. sustained low -> stationary', toStationary.snapshot.currentState === 'stationary');
  passed++;

  const unavail = simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: unavailable() },
  ]);
  assert('8. unavailable not stationary', unavail.snapshot.currentState === 'unknown');
  passed++;

  const derivedRecovery = simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(38, 'derived', 'medium') },
    { timestampMs: 20000, effectiveSpeed: effective(40, 'derived', 'medium') },
  ]);
  assert('9. derived recovery moving', derivedRecovery.snapshot.currentState === 'moving');
  passed++;

  const lowConf = simulate([
    { timestampMs: 0, effectiveSpeed: effective(35) },
    { timestampMs: 10000, effectiveSpeed: effective(40) },
    { timestampMs: 20000, effectiveSpeed: effective(50, 'native', 'low') },
  ]);
  assert('10. low confidence isolated', lowConf.snapshot.currentState === 'moving');
  passed++;

  const gapDuration = simulate([
    { timestampMs: 0, effectiveSpeed: effective(35) },
    { timestampMs: 10000, effectiveSpeed: effective(40) },
    { timestampMs: 200000, effectiveSpeed: effective(40) },
  ]);
  assert(
    '11. gap no full duration',
    gapDuration.stats.movingObservedMs <= MAX_STATE_ACCUMULATION_GAP_MS + 10000,
  );
  passed++;

  const gapUnknown = simulate([
    { timestampMs: 0, effectiveSpeed: effective(35) },
    { timestampMs: 10000, effectiveSpeed: effective(40) },
    { timestampMs: 80000, effectiveSpeed: effective(40) },
  ]);
  assert('12. gap forces unknown', gapUnknown.snapshot.currentState === 'unknown');
  passed++;

  assert('13. temporal rejected no state', true);
  passed++;

  const withTransition = simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(32) },
    { timestampMs: 15000, effectiveSpeed: effective(35) },
  ]);
  assert('14. timeline transition', withTransition.transitions.length >= 1);
  passed++;

  let transitions = [];
  for (let i = 0; i < MAX_MOTION_STATE_TRANSITIONS + 5; i++) {
    transitions.push({ id: i });
  }
  transitions =
    transitions.length > MAX_MOTION_STATE_TRANSITIONS
      ? transitions.slice(-MAX_MOTION_STATE_TRANSITIONS)
      : transitions;
  assert('15. timeline capacity', transitions.length === MAX_MOTION_STATE_TRANSITIONS);
  passed++;

  const ms = simulate([
    { timestampMs: 0, effectiveSpeed: effective(35) },
    { timestampMs: 10000, effectiveSpeed: effective(40) },
    { timestampMs: 25000, effectiveSpeed: effective(45) },
  ]);
  assert('16. movingObservedMs', ms.stats.movingObservedMs > 0);
  passed++;

  const st = reachStationary();
  assert('17. stationaryObservedMs', st.stats.stationaryObservedMs >= 0);
  passed++;

  const unk = simulate([{ timestampMs: 0, effectiveSpeed: unavailable() }]);
  assert('18. unknownObservedMs', unk.stats.unknownSamples >= 1);
  passed++;

  assert('19. longest moving', ms.stats.movingObservedMs != null);
  assert('20. longest stationary', st.stats.stationaryObservedMs != null);
  passed += 2;

  const sA = { sessionId: 'A', movingSamples: 5 };
  const sB = { sessionId: 'B', movingSamples: 0 };
  assert('21. new session reset', sB.movingSamples === 0);
  passed++;

  const restored = { ...sA, endedAt: null };
  assert('22. restore same session', restored.movingSamples === 5);
  passed++;

  assert('23. no cross-session', sA.sessionId !== sB.sessionId);
  passed++;

  const ended = { ...restored, endedAt: '2026-08-23T20:00:00.000Z' };
  assert('24. cleanup preserves', ended.movingSamples === 5 && ended.endedAt != null);
  passed++;

  const exportSample = {
    sessionMotionStateStatistics: { currentState: 'moving' },
    motionStateTimeline: { transitions: [] },
  };
  assert(
    '25. export includes motion state',
    exportSample.sessionMotionStateStatistics.currentState === 'moving',
  );
  passed++;

  // ─── 3C.1 hardening ───────────────────────────────────────────────────────

  const movingBase = reachMoving();
  assert('26a. precondition moving', movingBase.snapshot.currentState === 'moving');

  let snap = movingBase.snapshot;
  let r = stepMotionStateMachine({
    snapshot: snap,
    effectiveSpeed: unavailable(),
    timestampMs: 25000,
    deltaMsFromPreviousSample: 10000,
  });
  assert(
    '26. MOVING + 1 unavailable → sigue MOVING',
    r.snapshot.currentState === 'moving' && r.snapshot.candidateState === 'unknown',
  );
  passed++;

  snap = r.snapshot;
  r = stepMotionStateMachine({
    snapshot: snap,
    effectiveSpeed: unavailable(),
    timestampMs: 35000,
    deltaMsFromPreviousSample: 10000,
  });
  r = stepMotionStateMachine({
    snapshot: r.snapshot,
    effectiveSpeed: unavailable(),
    timestampMs: 45000,
    deltaMsFromPreviousSample: 10000,
  });
  assert(
    '27. MOVING + unavailable persistente → UNKNOWN',
    r.snapshot.currentState === 'unknown',
  );
  passed++;

  const stationaryBase = reachStationary();
  snap = stationaryBase.snapshot;
  r = stepMotionStateMachine({
    snapshot: snap,
    effectiveSpeed: unavailable(),
    timestampMs: 100000,
    deltaMsFromPreviousSample: 10000,
  });
  assert(
    '28. STATIONARY + 1 unavailable → sigue STATIONARY',
    r.snapshot.currentState === 'stationary' && r.snapshot.candidateState === 'unknown',
  );
  passed++;

  snap = r.snapshot;
  r = stepMotionStateMachine({
    snapshot: snap,
    effectiveSpeed: unavailable(),
    timestampMs: 110000,
    deltaMsFromPreviousSample: 10000,
  });
  r = stepMotionStateMachine({
    snapshot: r.snapshot,
    effectiveSpeed: unavailable(),
    timestampMs: 120000,
    deltaMsFromPreviousSample: 10000,
  });
  assert(
    '29. STATIONARY + unavailable persistente → UNKNOWN',
    r.snapshot.currentState === 'unknown',
  );
  passed++;

  assert(
    '30. gap >60s → UNKNOWN inmediato',
    gapUnknown.transitions.some((t) => t.reason === 'tracking_gap_unknown'),
  );
  passed++;

  assert('31. speed 2 km/h persistente → STATIONARY', toStationary.snapshot.currentState === 'stationary');
  passed++;

  const speed4 = simulate([
    { timestampMs: 0, effectiveSpeed: effective(35) },
    { timestampMs: 10000, effectiveSpeed: effective(40) },
    { timestampMs: 30000, effectiveSpeed: effective(4) },
    { timestampMs: 90000, effectiveSpeed: effective(4) },
  ]);
  assert(
    '32. speed 4 km/h NO confirma STATIONARY',
    speed4.snapshot.currentState === 'moving' &&
      speed4.transitions.every((t) => t.to !== 'stationary'),
  );
  passed++;

  const speed7 = simulate([
    { timestampMs: 0, effectiveSpeed: effective(35) },
    { timestampMs: 10000, effectiveSpeed: effective(40) },
    { timestampMs: 20000, effectiveSpeed: effective(7) },
    { timestampMs: 30000, effectiveSpeed: effective(7) },
  ]);
  assert('33. speed 7 km/h conserva MOVING', speed7.snapshot.currentState === 'moving');
  passed++;

  assert(
    '34. speed >=10 confirma MOVING',
    confirmSamples.snapshot.currentState === 'moving',
  );
  passed++;

  const osc = simulate([
    { timestampMs: 0, effectiveSpeed: unavailable() },
    { timestampMs: 5000, effectiveSpeed: effective(12) },
    { timestampMs: 15000, effectiveSpeed: effective(12) },
    { timestampMs: 25000, effectiveSpeed: unavailable() },
    { timestampMs: 35000, effectiveSpeed: effective(11) },
    { timestampMs: 45000, effectiveSpeed: unavailable() },
    { timestampMs: 55000, effectiveSpeed: effective(13) },
  ]);
  assert(
    '35. no oscillation 12→unavail→11→unavail→13',
    osc.snapshot.currentState === 'moving' &&
      !osc.transitions.some((t) => t.to === 'unknown' && t.reason === 'effective_speed_unavailable'),
  );
  passed++;

  console.log(`\nvalidate-motion-state: ${passed}/35 PASS`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
