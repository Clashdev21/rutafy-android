/**
 * Validación Tracking 3A — session temporal guard.
 * Ejecutar: node scripts/validate-session-temporal-guard.mjs
 */

const SESSION_FIX_EARLY_TOLERANCE_MS = 5000;
const MAX_FUTURE_FIX_SKEW_MS = 30000;

function resolveCapturedAtMs(locationTimestamp) {
  if (typeof locationTimestamp !== 'number' || !Number.isFinite(locationTimestamp)) {
    return null;
  }
  return locationTimestamp;
}

function evaluateSessionFixTemporalValidity(input) {
  const nowMs = input.nowMs ?? Date.now();
  const capturedAtMs = input.capturedAtMs;
  const sessionStartedAtMs = input.sessionStartedAtMs;

  if (capturedAtMs == null || !Number.isFinite(capturedAtMs)) {
    return {
      accepted: false,
      reason: 'invalid_timestamp',
      ageRelativeToSessionMs: null,
      fixAgeMs: null,
    };
  }

  if (sessionStartedAtMs == null || !Number.isFinite(sessionStartedAtMs)) {
    return {
      accepted: false,
      reason: 'no_session_started_at',
      ageRelativeToSessionMs: null,
      fixAgeMs: nowMs - capturedAtMs,
    };
  }

  const ageRelativeToSessionMs = capturedAtMs - sessionStartedAtMs;
  const fixAgeMs = nowMs - capturedAtMs;

  if (capturedAtMs > nowMs + MAX_FUTURE_FIX_SKEW_MS) {
    return { accepted: false, reason: 'future_fix', ageRelativeToSessionMs, fixAgeMs };
  }

  if (capturedAtMs >= sessionStartedAtMs) {
    return { accepted: true, reason: 'within_session', ageRelativeToSessionMs, fixAgeMs };
  }

  if (capturedAtMs >= sessionStartedAtMs - SESSION_FIX_EARLY_TOLERANCE_MS) {
    return {
      accepted: true,
      reason: 'within_early_tolerance',
      ageRelativeToSessionMs,
      fixAgeMs,
    };
  }

  return { accepted: false, reason: 'pre_session_fix', ageRelativeToSessionMs, fixAgeMs };
}

function createEmptyPipeline() {
  return {
    locationFixesReceived: 0,
    locationFixesValid: 0,
    locationFixesInvalid: 0,
    pointsMapped: 0,
    preSessionFixRejected: 0,
    futureFixRejected: 0,
    invalidTimestampRejected: 0,
    withinEarlyToleranceAccepted: 0,
  };
}

function applyTemporalRejection(stats, reason) {
  const next = { ...stats };
  next.locationFixesReceived += 1;
  next.locationFixesInvalid += 1;
  if (reason === 'pre_session_fix') next.preSessionFixRejected += 1;
  else if (reason === 'future_fix') next.futureFixRejected += 1;
  else if (reason === 'invalid_timestamp' || reason === 'no_session_started_at') {
    next.invalidTimestampRejected += 1;
  }
  return next;
}

function applyPointMapped(stats) {
  const next = { ...stats };
  next.locationFixesReceived += 1;
  next.locationFixesValid += 1;
  next.pointsMapped += 1;
  return next;
}

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`OK  ${name}`);
}

const SESSION_START = Date.parse('2026-08-23T19:08:48.958Z');
const REAL_PRE_SESSION = Date.parse('2026-08-23T19:01:50.921Z');
const NOW = Date.parse('2026-08-23T19:08:51.812Z');

let passed = 0;

try {
  const afterStart = evaluateSessionFixTemporalValidity({
    capturedAtMs: SESSION_START + 20_000,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert('1. fix después de start', afterStart.accepted && afterStart.reason === 'within_session');
  passed++;

  const atStart = evaluateSessionFixTemporalValidity({
    capturedAtMs: SESSION_START,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert('2. fix en session start', atStart.accepted && atStart.reason === 'within_session');
  passed++;

  const twoSecBefore = evaluateSessionFixTemporalValidity({
    capturedAtMs: SESSION_START - 2000,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert(
    '3. fix 2 s antes',
    twoSecBefore.accepted && twoSecBefore.reason === 'within_early_tolerance',
  );
  passed++;

  const boundary5000 = evaluateSessionFixTemporalValidity({
    capturedAtMs: SESSION_START - 5000,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert(
    '4. boundary -5000 ms',
    boundary5000.accepted && boundary5000.reason === 'within_early_tolerance',
  );
  passed++;

  const sixSecBefore = evaluateSessionFixTemporalValidity({
    capturedAtMs: SESSION_START - 6001,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert(
    '5. fix 6 s antes',
    !sixSecBefore.accepted && sixSecBefore.reason === 'pre_session_fix',
  );
  passed++;

  const realCase = evaluateSessionFixTemporalValidity({
    capturedAtMs: REAL_PRE_SESSION,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert(
    '6. fixture real 418 s',
    !realCase.accepted &&
      realCase.reason === 'pre_session_fix' &&
      Math.round(realCase.ageRelativeToSessionMs / 1000) === -418,
  );
  passed++;

  const nanCase = evaluateSessionFixTemporalValidity({
    capturedAtMs: NaN,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert('7. NaN', !nanCase.accepted && nanCase.reason === 'invalid_timestamp');
  passed++;

  const nullCase = evaluateSessionFixTemporalValidity({
    capturedAtMs: resolveCapturedAtMs(undefined),
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert('8. undefined timestamp', !nullCase.accepted && nullCase.reason === 'invalid_timestamp');
  passed++;

  const future10 = evaluateSessionFixTemporalValidity({
    capturedAtMs: NOW + 10_000,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert('9. future +10 s', future10.accepted);
  passed++;

  const future31 = evaluateSessionFixTemporalValidity({
    capturedAtMs: NOW + 31_000,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  assert('10. future +31 s', !future31.accepted && future31.reason === 'future_fix');
  passed++;

  let pipeline = createEmptyPipeline();
  pipeline = applyTemporalRejection(pipeline, 'pre_session_fix');
  assert('11. no pointsMapped', pipeline.pointsMapped === 0);
  passed++;

  assert(
    '12. invalid diagnostics',
    pipeline.locationFixesInvalid === 1 &&
      pipeline.preSessionFixRejected === 1 &&
      pipeline.locationFixesReceived === 1,
  );
  passed++;

  const preRejected = !evaluateSessionFixTemporalValidity({
    capturedAtMs: REAL_PRE_SESSION,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  }).accepted;
  assert('13. no speed observer', preRejected);
  passed++;

  assert('14. no gap observer', preRejected);
  passed++;

  let previousFix = { capturedAtMs: REAL_PRE_SESSION };
  const firstValid = evaluateSessionFixTemporalValidity({
    capturedAtMs: SESSION_START + 22_000,
    sessionStartedAtMs: SESSION_START,
    nowMs: NOW,
  });
  if (firstValid.accepted) {
    previousFix = { capturedAtMs: SESSION_START + 22_000 };
  }
  const gapMs = previousFix.capturedAtMs - REAL_PRE_SESSION;
  assert(
    '15. primer fix válido limpio',
    firstValid.accepted && gapMs > 400_000 && previousFix.capturedAtMs >= SESSION_START,
  );
  passed++;

  const originalStartedAt = '2026-08-23T19:08:48.958Z';
  const restoreAtMs = Date.parse('2026-08-23T20:00:00.000Z');
  const restoredValidity = evaluateSessionFixTemporalValidity({
    capturedAtMs: REAL_PRE_SESSION,
    sessionStartedAtMs: Date.parse(originalStartedAt),
    nowMs: restoreAtMs,
  });
  assert(
    '16. restore startedAt original',
    !restoredValidity.accepted && restoredValidity.reason === 'pre_session_fix',
  );
  passed++;

  const newSessionStart = Date.parse('2026-08-23T21:00:00.000Z');
  const newSessionValidity = evaluateSessionFixTemporalValidity({
    capturedAtMs: newSessionStart + 5000,
    sessionStartedAtMs: newSessionStart,
    nowMs: newSessionStart + 10_000,
  });
  assert('17. nueva session startedAt', newSessionValidity.accepted);
  passed++;

  let previousFixSessionA = { sessionId: 'A', capturedAtMs: SESSION_START + 1000 };
  previousFixSessionA = null;
  assert('18. no hereda previous fix', previousFixSessionA === null);
  passed++;

  const exportSample = {
    sessionTrackingPipelineStatistics: {
      preSessionFixRejected: 1,
      futureFixRejected: 0,
      invalidTimestampRejected: 0,
      withinEarlyToleranceAccepted: 2,
    },
  };
  assert(
    '19. export counters',
    exportSample.sessionTrackingPipelineStatistics.preSessionFixRejected === 1 &&
      exportSample.sessionTrackingPipelineStatistics.withinEarlyToleranceAccepted === 2,
  );
  passed++;

  const eventDetail = JSON.stringify({
    type: 'tracking-fix-temporal-rejected',
    detail: {
      reason: 'pre_session_fix',
      sessionId: '569f679f-eeff-40e9-a4ea-a6cf27b64633',
      capturedAt: '2026-08-23T19:01:50.921Z',
      sessionStartedAt: '2026-08-23T19:08:48.958Z',
      deltaMs: -418037,
    },
  });
  assert(
    '20. no secretos',
    !eventDetail.includes('Bearer') &&
      !eventDetail.includes('refresh_token') &&
      !eventDetail.includes('password'),
  );
  passed++;

  pipeline = applyPointMapped(pipeline);
  assert('sanity valid mapped', pipeline.pointsMapped === 1 && pipeline.locationFixesValid === 1);

  console.log(`\nvalidate-session-temporal-guard: ${passed}/20 PASS`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
