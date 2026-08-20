import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingPointInput } from '@/types/tracking';
import type { SpeedTelemetryPreviousFix } from '@/types/speedTelemetry';
import {
  calculateDerivedSpeedSample,
  parseNativeSpeedMps,
} from '@/utils/speedTelemetry';

/**
 * Speed 2A.1 — muestreo de eventos en ring buffer (MAX_EVENTS=100).
 *
 * - speed-stat-* → actualizan estadísticas SIEMPRE, sin entrar al ring buffer.
 * - speed-native / speed-derived → ring buffer cada INFO_SAMPLE_EVERY muestras
 *   (incluye la 1.ª de cada sesión).
 * - speed-unavailable → deduplicado: 1.ª vez + cada UNAVAILABLE_REPEAT_EVERY
 *   repeticiones consecutivas del mismo reason; siempre si cambia el reason.
 * - speed-sample-rejected → siempre al ring (anomalías, baja frecuencia).
 *
 * Estadísticas NO dependen del muestreo de eventos informativos.
 */

/** Emitir speed-native / speed-derived informativo cada N muestras válidas. */
const INFO_SAMPLE_EVERY = 10;

/** Repetir speed-unavailable con el mismo reason cada N ocurrencias. */
const UNAVAILABLE_REPEAT_EVERY = 20;

let previousFix: SpeedTelemetryPreviousFix | null = null;
let boundSessionId: string | null = null;

let nativeValidCount = 0;
let derivedValidCount = 0;
let lastUnavailableReason: string | null = null;
let unavailableRepeatCount = 0;

function resetSamplingCounters(): void {
  nativeValidCount = 0;
  derivedValidCount = 0;
  lastUnavailableReason = null;
  unavailableRepeatCount = 0;
}

function shouldEmitInfoEvent(validCount: number): boolean {
  return validCount === 1 || validCount % INFO_SAMPLE_EVERY === 0;
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
  type:
    | 'speed-stat-native'
    | 'speed-stat-derived'
    | 'speed-stat-unavailable'
    | 'speed-stat-rejected',
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
  };
}

/** Limpieza total (cierre/cancelación de sesión). */
export function resetSpeedTelemetryPreviousFix(): void {
  previousFix = null;
  boundSessionId = null;
  resetSamplingCounters();
}

/** Nueva sesión activa — invalida previousFix sin esperar al primer fix. */
export function resetSpeedTelemetryForNewSession(sessionId: string): void {
  boundSessionId = sessionId;
  previousFix = null;
  resetSamplingCounters();
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

  const sessionChanged =
    boundSessionId != null &&
    boundSessionId !== sessionId &&
    (previousFix != null || boundSessionId !== sessionId);

  if (boundSessionId !== sessionId) {
    boundSessionId = sessionId;
    previousFix = null;
    resetSamplingCounters();
  }

  return { sessionId, sessionChanged };
}

function handleNativeTelemetry(
  point: TrackingPointInput,
  sessionId: string,
): ReturnType<typeof parseNativeSpeedMps> {
  const native = parseNativeSpeedMps(point.speed_mps);

  if (native.ok) {
    nativeValidCount += 1;
    const detail = {
      speedNativeMps: native.speedNativeMps,
      speedNativeKmh: native.speedNativeKmh,
      accuracyM: point.accuracy_m ?? null,
    };
    recordSpeedStat('speed-stat-native', detail, sessionId);
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
 * Observación local de velocidad (Speed 2A / 2A.1).
 * No modifica el punto ni el payload al backend.
 */
export function observeSpeedTelemetryFromPoint(
  point: TrackingPointInput,
  sessionId?: string,
): void {
  const activeSessionId = sessionId ?? trackingSessionStorage.getActiveSessionIdSync();
  const { sessionId: resolvedSessionId, sessionChanged } = ensureSessionBinding(activeSessionId);
  if (!resolvedSessionId) {
    return;
  }

  handleNativeTelemetry(point, resolvedSessionId);

  if (sessionChanged) {
    handleDerivedUnavailable('session_changed', resolvedSessionId, false);
    commitPreviousFix(resolvedSessionId, point);
    return;
  }

  if (!previousFix) {
    handleDerivedUnavailable('no_previous', resolvedSessionId, false);
    commitPreviousFix(resolvedSessionId, point);
    return;
  }

  const derived = calculateDerivedSpeedSample(previousFix, {
    lat: point.lat,
    lng: point.lng,
    capturedAt: point.captured_at,
  });

  if (derived.ok) {
    derivedValidCount += 1;
    const detail = {
      speedDerivedKmh: derived.speedDerivedKmh,
      distanceFromPreviousM: derived.distanceFromPreviousM,
      deltaTimeMs: derived.deltaTimeMs,
    };
    recordSpeedStat('speed-stat-derived', detail, resolvedSessionId);
    if (shouldEmitInfoEvent(derivedValidCount)) {
      recordTrackingDiagnostic('speed-derived', detail, resolvedSessionId);
    }
  } else if (derived.reason === 'no_previous') {
    handleDerivedUnavailable('no_previous', resolvedSessionId, false);
  } else {
    handleDerivedUnavailable(derived.reason, resolvedSessionId, true);
  }

  commitPreviousFix(resolvedSessionId, point);
}
