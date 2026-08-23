/**
 * Guard temporal session-scoped: rechaza fixes pre-session o con timestamp inválido/futuro.
 * O(1) — sin I/O. Tracking 3A.
 */

import {
  MAX_FUTURE_FIX_SKEW_MS,
  SESSION_FIX_EARLY_TOLERANCE_MS,
} from '@/utils/trackingTemporalThresholds';

export type SessionFixTemporalReason =
  | 'within_session'
  | 'within_early_tolerance'
  | 'pre_session_fix'
  | 'future_fix'
  | 'invalid_timestamp'
  | 'no_session_started_at';

export type EvaluateSessionFixTemporalValidityInput = {
  capturedAtMs: number | null | undefined;
  sessionStartedAtMs: number | null | undefined;
  nowMs?: number;
};

export type SessionFixTemporalValidityResult = {
  accepted: boolean;
  reason: SessionFixTemporalReason;
  ageRelativeToSessionMs: number | null;
  fixAgeMs: number | null;
};

/** Extrae capturedAtMs del fix; null si timestamp ausente o no finito. */
export function resolveCapturedAtMs(
  locationTimestamp: number | null | undefined,
): number | null {
  if (typeof locationTimestamp !== 'number' || !Number.isFinite(locationTimestamp)) {
    return null;
  }
  return locationTimestamp;
}

/**
 * Regla: capturedAtMs >= sessionStartedAtMs - SESSION_FIX_EARLY_TOLERANCE_MS
 * Límite inferior inclusivo en sessionStartedAtMs - toleranceMs.
 */
export function evaluateSessionFixTemporalValidity(
  input: EvaluateSessionFixTemporalValidityInput,
): SessionFixTemporalValidityResult {
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
    return {
      accepted: false,
      reason: 'future_fix',
      ageRelativeToSessionMs,
      fixAgeMs,
    };
  }

  if (capturedAtMs >= sessionStartedAtMs) {
    return {
      accepted: true,
      reason: 'within_session',
      ageRelativeToSessionMs,
      fixAgeMs,
    };
  }

  if (capturedAtMs >= sessionStartedAtMs - SESSION_FIX_EARLY_TOLERANCE_MS) {
    return {
      accepted: true,
      reason: 'within_early_tolerance',
      ageRelativeToSessionMs,
      fixAgeMs,
    };
  }

  return {
    accepted: false,
    reason: 'pre_session_fix',
    ageRelativeToSessionMs,
    fixAgeMs,
  };
}
