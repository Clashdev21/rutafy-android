import {
  beginSessionSpeedStatistics,
  recordTrackingDiagnostic,
} from '@/services/trackingDiagnostics';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingPointInput } from '@/types/tracking';
import {
  MAX_PLAUSIBLE_ROAD_SPEED_KMH,
  NATIVE_ZERO_MOVING_MIN_DERIVED_KMH,
  STALE_FIX_MS,
} from '@/types/speedQuality';
import type {
  SpeedTelemetryObserveContext,
  SpeedTelemetryPreviousFix,
} from '@/types/speedTelemetry';
import type { SpeedQuality } from '@/types/speedQuality';
import type { TrackingEnrichedTelemetry } from '@/types/trackingTelemetry';
import { telemetryFromDecisions } from '@/types/trackingTelemetry';
import { fuseEffectiveSpeed } from '@/utils/effectiveSpeedFusion';
import { observeMotionStateFromEffectiveSpeed, resetMotionStateForNewSession } from '@/utils/motionStateObserver';
import {
  SPEED_DISAGREEMENT_HIGH_KMH,
} from '@/utils/effectiveSpeedThresholds';
import { assessSpeedSampleQuality } from '@/utils/speedQualityGate';
import {
  calculateDerivedSpeedSample,
  parseNativeSpeedMps,
} from '@/utils/speedTelemetry';

/**
 * Speed 2A.1 / 2A.2 — muestreo de eventos en ring buffer (MAX_EVENTS=100).
 *
 * - speed-stat-* → actualizan estadísticas SIEMPRE, sin entrar al ring buffer.
 * - speed-native / speed-derived / speed-quality-* → ring cada INFO_SAMPLE_EVERY.
 * - Anomalías (implausible, mocked, native-zero-moving, math rejected) → siempre al ring.
 * - speed-unavailable → deduplicado.
 *
 * Estadísticas NO dependen del muestreo de eventos informativos.
 */

const INFO_SAMPLE_EVERY = 10;
const UNAVAILABLE_REPEAT_EVERY = 20;
const QUALITY_SAMPLE_EVERY = 10;

let previousFix: SpeedTelemetryPreviousFix | null = null;
let boundSessionId: string | null = null;

let nativeValidCount = 0;
let derivedValidCount = 0;
let effectiveValidCount = 0;
let qualitySampleCount = 0;
let lastUnavailableReason: string | null = null;
let unavailableRepeatCount = 0;

function resetSamplingCounters(): void {
  nativeValidCount = 0;
  derivedValidCount = 0;
  effectiveValidCount = 0;
  qualitySampleCount = 0;
  lastUnavailableReason = null;
  unavailableRepeatCount = 0;
}

function shouldEmitInfoEvent(validCount: number): boolean {
  return validCount === 1 || validCount % INFO_SAMPLE_EVERY === 0;
}

function shouldEmitQualityEvent(count: number): boolean {
  return count === 1 || count % QUALITY_SAMPLE_EVERY === 0;
}

function shouldEmitUnavailableEvent(reason: string): boolean {
  if (reason !== lastUnavailableReason) {
    lastUnavailableReason = reason;
    unavailableRepeatCount = 1;
    return true;
  }
  unavailableRepeatCount += 1;
  return (
    unavailableRepeatCount === 1 || unavailableRepeatCount % UNAVAILABLE_REPEAT_EVERY === 0
  );
}

function recordSpeedStat(
  type: string,
  detail: Record<string, unknown>,
  sessionId?: string,
): void {
  recordTrackingDiagnostic(type, detail, sessionId);
}

function commitPreviousFix(sessionId: string, point: TrackingPointInput): void {
  const capturedAtMs = Date.parse(point.captured_at);
  if (!Number.isFinite(capturedAtMs)) return;
  previousFix = {
    sessionId,
    lat: point.lat,
    lng: point.lng,
    capturedAtMs,
    accuracyM:
      point.accuracy_m != null && Number.isFinite(point.accuracy_m)
        ? point.accuracy_m
        : null,
  };
}

export function resetSpeedTelemetryPreviousFix(): void {
  previousFix = null;
  boundSessionId = null;
  resetSamplingCounters();
}

export function resetSpeedTelemetryForNewSession(sessionId: string): void {
  boundSessionId = sessionId;
  previousFix = null;
  resetSamplingCounters();
  beginSessionSpeedStatistics(sessionId);
  resetMotionStateForNewSession(sessionId);
}

export function getSpeedTelemetryPreviousFixForDiagnostics(): SpeedTelemetryPreviousFix | null {
  return previousFix;
}

function ensureSessionBinding(sessionId: string | null): {
  sessionId: string | null;
  sessionChanged: boolean;
} {
  if (!sessionId) {
    if (previousFix != null || boundSessionId != null) {
      resetSpeedTelemetryPreviousFix();
    }
    return { sessionId: null, sessionChanged: false };
  }

  const sessionChanged = boundSessionId != null && boundSessionId !== sessionId;

  if (boundSessionId !== sessionId) {
    boundSessionId = sessionId;
    previousFix = null;
    resetSamplingCounters();
    beginSessionSpeedStatistics(sessionId);
  }

  return { sessionId, sessionChanged };
}

function observeFixMeta(
  context: SpeedTelemetryObserveContext | undefined,
  sessionId: string,
): void {
  const fixAgeMs =
    typeof context?.fixAgeMs === 'number' && Number.isFinite(context.fixAgeMs)
      ? context.fixAgeMs
      : null;
  const mocked = context?.mocked === true;

  if (fixAgeMs != null) {
    recordSpeedStat(
      'speed-stat-fix-age',
      { fixAgeMs, stale: fixAgeMs > STALE_FIX_MS },
      sessionId,
    );
    if (fixAgeMs > STALE_FIX_MS) {
      recordTrackingDiagnostic('gps-fix-stale', { fixAgeMs }, sessionId);
    }
  }

  if (mocked) {
    recordSpeedStat('speed-stat-mocked', { mocked: true }, sessionId);
    recordTrackingDiagnostic('gps-fix-mocked', { mocked: true }, sessionId);
  }
}

function handleNativeTelemetry(
  point: TrackingPointInput,
  sessionId: string,
  derivedQualityGood: boolean,
  derivedSpeedKmh: number | null,
): ReturnType<typeof parseNativeSpeedMps> {
  const native = parseNativeSpeedMps(point.speed_mps);

  if (native.ok) {
    nativeValidCount += 1;
    const isZero = native.speedNativeKmh === 0;
    const detail: Record<string, unknown> = {
      speedNativeMps: native.speedNativeMps,
      speedNativeKmh: native.speedNativeKmh,
      accuracyM: point.accuracy_m ?? null,
    };
    recordSpeedStat('speed-stat-native', detail, sessionId);
    if (isZero) {
      recordSpeedStat('speed-stat-native-zero', detail, sessionId);
      const movingSuspect =
        derivedQualityGood &&
        derivedSpeedKmh != null &&
        derivedSpeedKmh >= NATIVE_ZERO_MOVING_MIN_DERIVED_KMH;
      if (movingSuspect) {
        recordSpeedStat('speed-stat-native-zero-moving', {
          ...detail,
          speedDerivedKmh: derivedSpeedKmh,
        }, sessionId);
        recordTrackingDiagnostic(
          'speed-native-zero-moving',
          { ...detail, speedDerivedKmh: derivedSpeedKmh },
          sessionId,
        );
      }
    }
    if (shouldEmitInfoEvent(nativeValidCount)) {
      recordTrackingDiagnostic('speed-native', detail, sessionId);
    }
  } else {
    const reason = native.reason;
    recordSpeedStat('speed-stat-unavailable', { reason }, sessionId);
    if (shouldEmitUnavailableEvent(reason)) {
      recordTrackingDiagnostic('speed-unavailable', { reason }, sessionId);
    }
  }

  return native;
}

function handleEffectiveSpeedTelemetry(
  point: TrackingPointInput,
  sessionId: string,
  derivedSpeedKmh: number | null,
  derivedQuality: SpeedQuality | null,
  deltaMsFromPreviousSample: number | null,
): TrackingEnrichedTelemetry {
  const native = parseNativeSpeedMps(point.speed_mps);
  const decision = fuseEffectiveSpeed({
    nativeSpeedKmh: native.ok ? native.speedNativeKmh : null,
    nativeAvailable: native.ok,
    derivedSpeedKmh,
    derivedQuality,
  });

  const detail: Record<string, unknown> = {
    speedKmh: decision.speedKmh,
    source: decision.source,
    confidence: decision.confidence,
    reason: decision.reason,
    nativeSpeedKmh: decision.nativeSpeedKmh,
    derivedSpeedKmh: decision.derivedSpeedKmh,
    derivedQuality: decision.derivedQuality,
    disagreementKmh: decision.disagreementKmh,
  };

  recordSpeedStat('speed-stat-effective', detail, sessionId);

  if (decision.reason === 'derived_recovery_native_zero') {
    recordTrackingDiagnostic('speed-effective-native-zero-recovered', detail, sessionId);
  }
  if (
    decision.disagreementKmh != null &&
    decision.disagreementKmh > SPEED_DISAGREEMENT_HIGH_KMH
  ) {
    recordTrackingDiagnostic('speed-effective-disagreement', detail, sessionId);
  }
  if (
    (native.ok &&
      decision.nativeSpeedKmh != null &&
      decision.nativeSpeedKmh > MAX_PLAUSIBLE_ROAD_SPEED_KMH) ||
    decision.reason === 'native_implausible_derived_used'
  ) {
    recordTrackingDiagnostic('speed-effective-native-implausible', detail, sessionId);
  }

  if (decision.source !== 'unavailable') {
    effectiveValidCount += 1;
    if (shouldEmitInfoEvent(effectiveValidCount)) {
      recordTrackingDiagnostic('speed-effective', detail, sessionId);
    }
  }

  const motion = observeMotionStateFromEffectiveSpeed(
    sessionId,
    point.captured_at,
    decision,
    deltaMsFromPreviousSample,
  );

  return telemetryFromDecisions(decision, motion.state, motion.reason);
}

function handleDerivedUnavailable(
  reason: string,
  sessionId: string,
  emitRejected: boolean,
): void {
  const derivedReason = reason.startsWith('derived_') ? reason : `derived_${reason}`;
  recordSpeedStat('speed-stat-unavailable', { reason: derivedReason }, sessionId);
  if (emitRejected) {
    recordSpeedStat('speed-stat-rejected', { reason }, sessionId);
    recordTrackingDiagnostic('speed-sample-rejected', { reason }, sessionId);
  }
  if (shouldEmitUnavailableEvent(derivedReason)) {
    recordTrackingDiagnostic('speed-unavailable', { reason: derivedReason }, sessionId);
  }
}

/**
 * Observación local de velocidad (Speed 2A / 2A.1 / 2A.2) + snapshot 3D.1.
 * No muta speed_mps. Retorna telemetría del MISMO fix para enrichment metadata.
 *
 * Nota: native=0 NO implica vehículo detenido (Expo/Android puede omitir hasSpeed).
 */
export function observeSpeedTelemetryFromPoint(
  point: TrackingPointInput,
  sessionId?: string,
  context?: SpeedTelemetryObserveContext,
): TrackingEnrichedTelemetry | null {
  const activeSessionId = sessionId ?? trackingSessionStorage.getActiveSessionIdSync();
  const { sessionId: resolvedSessionId, sessionChanged } = ensureSessionBinding(activeSessionId);
  if (!resolvedSessionId) {
    return null;
  }

  observeFixMeta(context, resolvedSessionId);

  // Derived first so native-zero-moving can use quality of this pair.
  let derivedQualityGood = false;
  let derivedSpeedKmh: number | null = null;
  let derivedQuality: SpeedQuality | null = null;

  const deltaMsFromPreviousSample =
    previousFix && previousFix.sessionId === resolvedSessionId
      ? Math.max(0, Date.parse(point.captured_at) - previousFix.capturedAtMs)
      : null;
  const capturedAtMs = Date.parse(point.captured_at);
  const safeDelta =
    deltaMsFromPreviousSample != null && Number.isFinite(capturedAtMs)
      ? deltaMsFromPreviousSample
      : null;

  if (sessionChanged) {
    handleDerivedUnavailable('session_changed', resolvedSessionId, false);
    handleNativeTelemetry(point, resolvedSessionId, false, null);
    const telemetry = handleEffectiveSpeedTelemetry(
      point,
      resolvedSessionId,
      null,
      null,
      safeDelta,
    );
    commitPreviousFix(resolvedSessionId, point);
    return telemetry;
  }

  if (!previousFix) {
    handleDerivedUnavailable('no_previous', resolvedSessionId, false);
    handleNativeTelemetry(point, resolvedSessionId, false, null);
    const telemetry = handleEffectiveSpeedTelemetry(
      point,
      resolvedSessionId,
      null,
      null,
      safeDelta,
    );
    commitPreviousFix(resolvedSessionId, point);
    return telemetry;
  }

  const previousAccuracyM = previousFix.accuracyM;
  const currentAccuracyM =
    point.accuracy_m != null && Number.isFinite(point.accuracy_m)
      ? point.accuracy_m
      : null;

  const derived = calculateDerivedSpeedSample(previousFix, {
    lat: point.lat,
    lng: point.lng,
    capturedAt: point.captured_at,
  });

  if (derived.ok) {
    derivedValidCount += 1;
    derivedSpeedKmh = derived.speedDerivedKmh;

    const assessment = assessSpeedSampleQuality({
      previousAccuracyM,
      currentAccuracyM,
      distanceFromPreviousM: derived.distanceFromPreviousM,
      deltaTimeMs: derived.deltaTimeMs,
      speedDerivedKmh: derived.speedDerivedKmh,
      fixAgeMs: context?.fixAgeMs ?? null,
    });

    derivedQualityGood = assessment.quality === 'good';
    derivedQuality = assessment.quality;
    qualitySampleCount += 1;

    const detail: Record<string, unknown> = {
      speedDerivedKmh: derived.speedDerivedKmh,
      distanceFromPreviousM: derived.distanceFromPreviousM,
      deltaTimeMs: derived.deltaTimeMs,
      previousAccuracyM,
      currentAccuracyM,
      combinedAccuracyM: assessment.combinedAccuracyM,
      displacementQualityRatio: assessment.displacementQualityRatio,
      quality: assessment.quality,
      qualityReason: assessment.qualityReason,
      staleFix: assessment.staleFix,
    };

    recordSpeedStat('speed-stat-derived', detail, resolvedSessionId);
    recordSpeedStat(
      assessment.quality === 'good'
        ? 'speed-stat-quality-good'
        : assessment.quality === 'weak'
          ? 'speed-stat-quality-weak'
          : 'speed-stat-quality-rejected',
      detail,
      resolvedSessionId,
    );

    if (assessment.qualityReason === 'poor_accuracy') {
      recordSpeedStat('speed-stat-poor-accuracy', detail, resolvedSessionId);
    }
    if (assessment.qualityReason === 'long_gap') {
      recordSpeedStat('speed-stat-long-gap', detail, resolvedSessionId);
    }
    if (assessment.qualityReason === 'implausible_speed') {
      recordSpeedStat('speed-stat-implausible', detail, resolvedSessionId);
      recordTrackingDiagnostic('speed-quality-rejected', detail, resolvedSessionId);
    }

    if (shouldEmitInfoEvent(derivedValidCount)) {
      recordTrackingDiagnostic('speed-derived', detail, resolvedSessionId);
    }
    if (
      assessment.qualityReason === 'implausible_speed' ||
      shouldEmitQualityEvent(qualitySampleCount)
    ) {
      const qualityEvent =
        assessment.quality === 'good'
          ? 'speed-quality-good'
          : assessment.quality === 'weak'
            ? 'speed-quality-weak'
            : 'speed-quality-rejected';
      recordTrackingDiagnostic(qualityEvent, detail, resolvedSessionId);
    }
  } else if (derived.reason === 'no_previous') {
    handleDerivedUnavailable('no_previous', resolvedSessionId, false);
  } else {
    derivedQuality = 'rejected';
    handleDerivedUnavailable(derived.reason, resolvedSessionId, true);
  }

  handleNativeTelemetry(point, resolvedSessionId, derivedQualityGood, derivedSpeedKmh);
  const telemetry = handleEffectiveSpeedTelemetry(
    point,
    resolvedSessionId,
    derivedSpeedKmh,
    derivedQuality,
    safeDelta,
  );
  commitPreviousFix(resolvedSessionId, point);
  return telemetry;
}
