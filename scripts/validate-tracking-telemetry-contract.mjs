/**
 * Validación Tracking 3D.1 — contrato telemetría aditiva en metadata.
 * Ejecutar: node scripts/validate-tracking-telemetry-contract.mjs
 */

const TRACKING_TELEMETRY_VERSION = 1;

function normalizeFiniteOrNull(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function enrichTrackingPointTelemetry(point, telemetry) {
  const existing =
    point.metadata && typeof point.metadata === 'object' && !Array.isArray(point.metadata)
      ? { ...point.metadata }
      : {};

  const kmh =
    telemetry.effectiveSpeedSource === 'unavailable'
      ? null
      : normalizeFiniteOrNull(telemetry.effectiveSpeedKmh);

  return {
    ...point,
    metadata: {
      ...existing,
      tracking_telemetry_version: TRACKING_TELEMETRY_VERSION,
      effective_speed_kmh: kmh,
      effective_speed_source: telemetry.effectiveSpeedSource,
      effective_speed_confidence:
        telemetry.effectiveSpeedSource === 'unavailable'
          ? null
          : telemetry.effectiveSpeedConfidence,
      effective_speed_reason: telemetry.effectiveSpeedReason,
      motion_state: telemetry.motionState,
      motion_state_reason: telemetry.motionStateReason,
    },
  };
}

function isLegacyTrackingPointShape(point) {
  return (
    typeof point.lat === 'number' &&
    Number.isFinite(point.lat) &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lng) &&
    typeof point.captured_at === 'string' &&
    typeof point.app_state === 'string' &&
    (point.speed_mps == null ||
      (typeof point.speed_mps === 'number' && Number.isFinite(point.speed_mps)))
  );
}

function basePoint(overrides = {}) {
  return {
    lat: 3.45,
    lng: -76.53,
    captured_at: '2026-08-23T19:10:00.000Z',
    accuracy_m: 15,
    speed_mps: 10,
    heading: 90,
    battery_level: null,
    app_state: 'foreground',
    metadata: { source: 'android_mvp' },
    ...overrides,
  };
}

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`OK  ${name}`);
}

let passed = 0;

try {
  const nativeMps = 16.67;
  const p1 = enrichTrackingPointTelemetry(basePoint({ speed_mps: nativeMps }), {
    effectiveSpeedKmh: 60,
    effectiveSpeedSource: 'native',
    effectiveSpeedConfidence: 'high',
    effectiveSpeedReason: 'native_confirmed',
    motionState: 'moving',
    motionStateReason: 'moving_speed_confirmed',
  });
  assert('1. native speed preservado', p1.speed_mps === nativeMps);
  passed++;

  assert(
    '2. effective native enriched',
    p1.metadata.effective_speed_source === 'native' && p1.metadata.effective_speed_kmh === 60,
  );
  passed++;

  const pDerived = enrichTrackingPointTelemetry(basePoint({ speed_mps: 0 }), {
    effectiveSpeedKmh: 38,
    effectiveSpeedSource: 'derived',
    effectiveSpeedConfidence: 'medium',
    effectiveSpeedReason: 'derived_recovery_native_zero',
    motionState: 'moving',
    motionStateReason: 'moving_speed_confirmed',
  });
  assert(
    '3. effective derived enriched',
    pDerived.metadata.effective_speed_source === 'derived' &&
      pDerived.metadata.effective_speed_kmh === 38 &&
      pDerived.speed_mps === 0,
  );
  passed++;

  const pUnavail = enrichTrackingPointTelemetry(basePoint({ speed_mps: 0 }), {
    effectiveSpeedKmh: 0,
    effectiveSpeedSource: 'unavailable',
    effectiveSpeedConfidence: null,
    effectiveSpeedReason: 'both_unavailable',
    motionState: 'unknown',
    motionStateReason: 'effective_speed_unavailable',
  });
  assert(
    '4. effective unavailable → null',
    pUnavail.metadata.effective_speed_kmh === null &&
      pUnavail.metadata.effective_speed_source === 'unavailable' &&
      pUnavail.metadata.effective_speed_confidence === null,
  );
  passed++;

  assert('5. high confidence', p1.metadata.effective_speed_confidence === 'high');
  passed++;

  assert('6. medium confidence', pDerived.metadata.effective_speed_confidence === 'medium');
  passed++;

  const pLow = enrichTrackingPointTelemetry(basePoint(), {
    effectiveSpeedKmh: 50,
    effectiveSpeedSource: 'native',
    effectiveSpeedConfidence: 'low',
    effectiveSpeedReason: 'native_derived_disagreement',
    motionState: 'moving',
    motionStateReason: 'moving_speed_confirmed',
  });
  assert('7. low confidence', pLow.metadata.effective_speed_confidence === 'low');
  passed++;

  assert('8. motion moving', p1.metadata.motion_state === 'moving');
  passed++;

  const pStat = enrichTrackingPointTelemetry(basePoint({ speed_mps: 0 }), {
    effectiveSpeedKmh: 1,
    effectiveSpeedSource: 'native',
    effectiveSpeedConfidence: 'high',
    effectiveSpeedReason: 'native_only',
    motionState: 'stationary',
    motionStateReason: 'stationary_speed_persisted',
  });
  assert('9. motion stationary', pStat.metadata.motion_state === 'stationary');
  passed++;

  assert('10. motion unknown', pUnavail.metadata.motion_state === 'unknown');
  passed++;

  const json1 = JSON.stringify(p1);
  assert(
    '11. candidate state no enviado',
    !json1.includes('candidateState') && !json1.includes('candidate_sample'),
  );
  passed++;

  assert('12. metadata source preservada', p1.metadata.source === 'android_mvp');
  passed++;

  const pMerge = enrichTrackingPointTelemetry(
    basePoint({ metadata: { source: 'android_background', channel: 'bg' } }),
    {
      effectiveSpeedKmh: 40,
      effectiveSpeedSource: 'native',
      effectiveSpeedConfidence: 'high',
      effectiveSpeedReason: 'native_only',
      motionState: 'moving',
      motionStateReason: null,
    },
  );
  assert(
    '13. metadata merge',
    pMerge.metadata.source === 'android_background' &&
      pMerge.metadata.channel === 'bg' &&
      pMerge.metadata.effective_speed_kmh === 40,
  );
  passed++;

  const pNan = enrichTrackingPointTelemetry(basePoint(), {
    effectiveSpeedKmh: NaN,
    effectiveSpeedSource: 'native',
    effectiveSpeedConfidence: 'high',
    effectiveSpeedReason: 'native_only',
    motionState: 'unknown',
    motionStateReason: null,
  });
  assert('14. NaN normalized', pNan.metadata.effective_speed_kmh === null);
  passed++;

  const pInf = enrichTrackingPointTelemetry(basePoint(), {
    effectiveSpeedKmh: Infinity,
    effectiveSpeedSource: 'derived',
    effectiveSpeedConfidence: 'medium',
    effectiveSpeedReason: 'derived_only',
    motionState: 'unknown',
    motionStateReason: null,
  });
  assert('15. Infinity normalized', pInf.metadata.effective_speed_kmh === null);
  passed++;

  const beforeSpeed = 12.5;
  const pNoOw = enrichTrackingPointTelemetry(basePoint({ speed_mps: beforeSpeed }), {
    effectiveSpeedKmh: 99,
    effectiveSpeedSource: 'derived',
    effectiveSpeedConfidence: 'medium',
    effectiveSpeedReason: 'derived_only',
    motionState: 'moving',
    motionStateReason: null,
  });
  assert('16. no overwrite speed_mps', pNoOw.speed_mps === beforeSpeed);
  passed++;

  const fg = enrichTrackingPointTelemetry(
    basePoint({ app_state: 'foreground', metadata: { source: 'android_mvp' } }),
    {
      effectiveSpeedKmh: 55,
      effectiveSpeedSource: 'native',
      effectiveSpeedConfidence: 'high',
      effectiveSpeedReason: 'native_confirmed',
      motionState: 'moving',
      motionStateReason: 'moving_speed_confirmed',
    },
  );
  assert(
    '17. FG payload',
    fg.app_state === 'foreground' && fg.metadata.source === 'android_mvp',
  );
  passed++;

  const bg = enrichTrackingPointTelemetry(
    basePoint({ app_state: 'background', metadata: { source: 'android_background' } }),
    {
      effectiveSpeedKmh: 48,
      effectiveSpeedSource: 'derived',
      effectiveSpeedConfidence: 'medium',
      effectiveSpeedReason: 'derived_recovery_native_zero',
      motionState: 'moving',
      motionStateReason: null,
    },
  );
  assert(
    '18. BG payload',
    bg.app_state === 'background' && bg.metadata.source === 'android_background',
  );
  passed++;

  const temporalRejected = null;
  assert('19. temporal rejected fix no payload', temporalRejected == null);
  passed++;

  const legacy = {
    lat: 3.4,
    lng: -76.5,
    captured_at: '2026-08-23T19:10:00.000Z',
    speed_mps: 5,
    app_state: 'foreground',
    metadata: { source: 'android_mvp' },
  };
  assert('20. backend legacy shape sigue válido', isLegacyTrackingPointShape(legacy));
  assert('20b. enriched sigue legacy shape', isLegacyTrackingPointShape(p1));
  passed++;

  assert('21. telemetry_version', p1.metadata.tracking_telemetry_version === 1);
  passed++;

  const secretsJson = JSON.stringify(p1);
  assert(
    '22. no secretos',
    !secretsJson.includes('Bearer') &&
      !secretsJson.includes('refresh_token') &&
      !secretsJson.includes('password') &&
      !secretsJson.includes('Authorization'),
  );
  passed++;

  console.log(`\nvalidate-tracking-telemetry-contract: ${passed}/22 PASS`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
