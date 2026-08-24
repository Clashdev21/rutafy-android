/**
 * Motion State v1 — máquina de estados pura (Tracking 3C / 3C.1).
 */

import type {
  MotionState,
  MotionStateEvidence,
  MotionStateMachineSnapshot,
  MotionStateReason,
  MotionStateStepInput,
  MotionStateStepResult,
} from '@/types/motionState';
import type { EffectiveSpeedDecision } from '@/types/effectiveSpeed';
import {
  LONG_GAP_FORCE_UNKNOWN_MS,
  MAX_STATE_ACCUMULATION_GAP_MS,
  MOVING_CONFIRM_MIN_DURATION_MS,
  MOVING_CONFIRM_MIN_SAMPLES,
  MOVING_ENTER_SPEED_KMH,
  MOVING_EXIT_SPEED_KMH,
  STATIONARY_CONFIRM_DURATION_MS,
  STATIONARY_MAX_SPEED_KMH,
  UNKNOWN_CONFIRM_DURATION_MS,
  UNKNOWN_CONFIRM_MIN_SAMPLES,
} from '@/utils/motionStateThresholds';

export function createInitialMotionStateMachineSnapshot(
  timestampMs: number,
): MotionStateMachineSnapshot {
  return {
    currentState: 'unknown',
    candidateState: null,
    candidateStartedAtMs: null,
    candidateSampleCount: 0,
    lastSampleAtMs: null,
    lastStateChangedAtMs: timestampMs,
  };
}

function cloneSnapshot(snapshot: MotionStateMachineSnapshot): MotionStateMachineSnapshot {
  return { ...snapshot };
}

function clearCandidate(snapshot: MotionStateMachineSnapshot): void {
  snapshot.candidateState = null;
  snapshot.candidateStartedAtMs = null;
  snapshot.candidateSampleCount = 0;
}

function startCandidate(
  snapshot: MotionStateMachineSnapshot,
  state: MotionState,
  timestampMs: number,
): void {
  snapshot.candidateState = state;
  snapshot.candidateStartedAtMs = timestampMs;
  snapshot.candidateSampleCount = 1;
}

function incrementCandidate(snapshot: MotionStateMachineSnapshot): void {
  snapshot.candidateSampleCount += 1;
}

function candidateDurationMs(snapshot: MotionStateMachineSnapshot, timestampMs: number): number {
  if (snapshot.candidateStartedAtMs == null) return 0;
  return Math.max(0, timestampMs - snapshot.candidateStartedAtMs);
}

type SampleSignals = {
  evidence: MotionStateEvidence;
  supportsMoving: boolean;
  supportsStationary: boolean;
  /** speed <= MOVING_EXIT_SPEED_KMH — zona de salida, no equivale a stationary. */
  belowMovingExit: boolean;
  /** confidence low u otra evidencia débil (con source disponible). */
  insufficient: boolean;
  /** effectiveSpeed.source === 'unavailable'. */
  unavailable: boolean;
};

function classifySample(
  effectiveSpeed: EffectiveSpeedDecision,
  motionActivityLevel?: 'low' | 'medium' | 'high' | null,
): SampleSignals {
  const speed = effectiveSpeed.speedKmh;
  const hasSpeed = speed != null && Number.isFinite(speed);
  const motionBoost = motionActivityLevel === 'high';

  if (effectiveSpeed.source === 'unavailable') {
    return {
      evidence: 'insufficient',
      supportsMoving: false,
      supportsStationary: false,
      belowMovingExit: false,
      insufficient: true,
      unavailable: true,
    };
  }

  const insufficient = effectiveSpeed.confidence === 'low' && !motionBoost;

  if (insufficient) {
    return {
      evidence: 'insufficient',
      supportsMoving: false,
      supportsStationary: false,
      belowMovingExit: false,
      insufficient: true,
      unavailable: false,
    };
  }

  const supportsMoving = hasSpeed && speed >= MOVING_ENTER_SPEED_KMH;
  const supportsStationary = hasSpeed && speed <= STATIONARY_MAX_SPEED_KMH;
  const belowMovingExit = hasSpeed && speed <= MOVING_EXIT_SPEED_KMH;

  return {
    evidence: motionBoost && supportsMoving ? 'motion_activity' : 'effective_speed',
    supportsMoving,
    supportsStationary,
    belowMovingExit,
    insufficient: false,
    unavailable: false,
  };
}

function applyTransition(
  snapshot: MotionStateMachineSnapshot,
  to: MotionState,
  reason: MotionStateReason,
  timestampMs: number,
): { from: MotionState; to: MotionState; reason: MotionStateReason } {
  const from = snapshot.currentState;
  snapshot.currentState = to;
  snapshot.lastStateChangedAtMs = timestampMs;
  clearCandidate(snapshot);
  return { from, to, reason };
}

function confirmMovingCandidate(
  snapshot: MotionStateMachineSnapshot,
  timestampMs: number,
): boolean {
  const duration = candidateDurationMs(snapshot, timestampMs);
  return (
    snapshot.candidateState === 'moving' &&
    (snapshot.candidateSampleCount >= MOVING_CONFIRM_MIN_SAMPLES ||
      duration >= MOVING_CONFIRM_MIN_DURATION_MS)
  );
}

function confirmStationaryCandidate(
  snapshot: MotionStateMachineSnapshot,
  timestampMs: number,
): boolean {
  const duration = candidateDurationMs(snapshot, timestampMs);
  return snapshot.candidateState === 'stationary' && duration >= STATIONARY_CONFIRM_DURATION_MS;
}

function confirmUnknownCandidate(
  snapshot: MotionStateMachineSnapshot,
  timestampMs: number,
): boolean {
  const duration = candidateDurationMs(snapshot, timestampMs);
  return (
    snapshot.candidateState === 'unknown' &&
    (snapshot.candidateSampleCount >= UNKNOWN_CONFIRM_MIN_SAMPLES ||
      duration >= UNKNOWN_CONFIRM_DURATION_MS)
  );
}

/**
 * Pérdida de effectiveSpeed: conserva estado confirmado; acumula candidate UNKNOWN.
 */
function handleUnavailableCandidate(
  snapshot: MotionStateMachineSnapshot,
  timestampMs: number,
): { transition: MotionStateStepResult['transition']; reason: MotionStateReason } {
  if (snapshot.candidateState !== 'unknown') {
    startCandidate(snapshot, 'unknown', timestampMs);
    return { transition: null, reason: 'unknown_candidate' };
  }
  incrementCandidate(snapshot);
  if (confirmUnknownCandidate(snapshot, timestampMs)) {
    return {
      transition: applyTransition(
        snapshot,
        'unknown',
        'effective_speed_unavailable',
        timestampMs,
      ),
      reason: 'effective_speed_unavailable',
    };
  }
  return { transition: null, reason: 'unknown_candidate' };
}

function processMovingState(
  snapshot: MotionStateMachineSnapshot,
  signals: SampleSignals,
  effectiveSpeed: EffectiveSpeedDecision,
  timestampMs: number,
): { transition: MotionStateStepResult['transition']; reason: MotionStateReason } {
  if (signals.unavailable) {
    return handleUnavailableCandidate(snapshot, timestampMs);
  }

  if (signals.insufficient) {
    clearCandidate(snapshot);
    return { transition: null, reason: 'insufficient_speed_evidence' };
  }

  const speed = effectiveSpeed.speedKmh;

  // speed > 5 → conservar MOVING (incluye zona intermedia 5–10 y evidencia >=10)
  if (speed != null && speed > MOVING_EXIT_SPEED_KMH) {
    clearCandidate(snapshot);
    return { transition: null, reason: 'moving_speed_confirmed' };
  }

  // speed <= 3 → evidencia STATIONARY
  if (signals.supportsStationary) {
    if (snapshot.candidateState !== 'stationary') {
      startCandidate(snapshot, 'stationary', timestampMs);
      return { transition: null, reason: 'stationary_candidate' };
    }
    incrementCandidate(snapshot);
    if (confirmStationaryCandidate(snapshot, timestampMs)) {
      return {
        transition: applyTransition(
          snapshot,
          'stationary',
          'stationary_speed_persisted',
          timestampMs,
        ),
        reason: 'stationary_speed_persisted',
      };
    }
    return { transition: null, reason: 'stationary_candidate' };
  }

  // 3 < speed <= 5 → histéresis de salida; NO confirma STATIONARY
  clearCandidate(snapshot);
  return { transition: null, reason: 'transition_hysteresis' };
}

function processStationaryState(
  snapshot: MotionStateMachineSnapshot,
  signals: SampleSignals,
  timestampMs: number,
): { transition: MotionStateStepResult['transition']; reason: MotionStateReason } {
  if (signals.unavailable) {
    return handleUnavailableCandidate(snapshot, timestampMs);
  }

  if (signals.insufficient) {
    clearCandidate(snapshot);
    return { transition: null, reason: 'insufficient_speed_evidence' };
  }

  // speed <= 3 → refuerza STATIONARY
  if (signals.supportsStationary) {
    clearCandidate(snapshot);
    return { transition: null, reason: 'stationary_speed_persisted' };
  }

  // speed >= 10 → candidate MOVING
  if (signals.supportsMoving) {
    if (snapshot.candidateState !== 'moving') {
      startCandidate(snapshot, 'moving', timestampMs);
      return { transition: null, reason: 'moving_candidate' };
    }
    incrementCandidate(snapshot);
    if (confirmMovingCandidate(snapshot, timestampMs)) {
      const reason: MotionStateReason =
        signals.evidence === 'motion_activity'
          ? 'motion_activity_support'
          : 'moving_speed_confirmed';
      return {
        transition: applyTransition(snapshot, 'moving', reason, timestampMs),
        reason,
      };
    }
    return { transition: null, reason: 'moving_candidate' };
  }

  // 3 < speed < 10 → conservar STATIONARY (histéresis / zona intermedia)
  clearCandidate(snapshot);
  return { transition: null, reason: 'transition_hysteresis' };
}

function processUnknownState(
  snapshot: MotionStateMachineSnapshot,
  signals: SampleSignals,
  effectiveSpeed: EffectiveSpeedDecision,
  timestampMs: number,
): { transition: MotionStateStepResult['transition']; reason: MotionStateReason } {
  if (signals.unavailable || signals.insufficient) {
    clearCandidate(snapshot);
    const reason: MotionStateReason =
      effectiveSpeed.source === 'unavailable'
        ? 'effective_speed_unavailable'
        : 'insufficient_speed_evidence';
    return { transition: null, reason };
  }

  if (signals.supportsMoving) {
    if (snapshot.candidateState !== 'moving') {
      startCandidate(snapshot, 'moving', timestampMs);
      return { transition: null, reason: 'moving_candidate' };
    }
    incrementCandidate(snapshot);
    if (confirmMovingCandidate(snapshot, timestampMs)) {
      return {
        transition: applyTransition(snapshot, 'moving', 'moving_speed_confirmed', timestampMs),
        reason: 'moving_speed_confirmed',
      };
    }
    return { transition: null, reason: 'moving_candidate' };
  }

  if (signals.supportsStationary) {
    if (snapshot.candidateState !== 'stationary') {
      startCandidate(snapshot, 'stationary', timestampMs);
      return { transition: null, reason: 'stationary_candidate' };
    }
    incrementCandidate(snapshot);
    if (confirmStationaryCandidate(snapshot, timestampMs)) {
      return {
        transition: applyTransition(
          snapshot,
          'stationary',
          'stationary_speed_persisted',
          timestampMs,
        ),
        reason: 'stationary_speed_persisted',
      };
    }
    return { transition: null, reason: 'stationary_candidate' };
  }

  // zona intermedia desde UNKNOWN: sin transición
  clearCandidate(snapshot);
  return { transition: null, reason: 'transition_hysteresis' };
}

/**
 * Avanza la máquina de estados con una muestra effectiveSpeed.
 */
export function stepMotionStateMachine(input: MotionStateStepInput): MotionStateStepResult {
  const snapshot = cloneSnapshot(input.snapshot);
  const { effectiveSpeed, timestampMs, deltaMsFromPreviousSample, motionActivityLevel } = input;

  let durationAccumulatedMs = 0;
  if (
    snapshot.lastSampleAtMs != null &&
    deltaMsFromPreviousSample != null &&
    Number.isFinite(deltaMsFromPreviousSample) &&
    deltaMsFromPreviousSample > 0
  ) {
    durationAccumulatedMs = Math.min(deltaMsFromPreviousSample, MAX_STATE_ACCUMULATION_GAP_MS);
  }

  let transition: MotionStateStepResult['transition'] = null;
  let reason: MotionStateReason = 'session_start_unknown';

  if (
    deltaMsFromPreviousSample != null &&
    deltaMsFromPreviousSample > LONG_GAP_FORCE_UNKNOWN_MS &&
    snapshot.currentState !== 'unknown'
  ) {
    transition = applyTransition(snapshot, 'unknown', 'tracking_gap_unknown', timestampMs);
    reason = 'tracking_gap_unknown';
  }

  const signals = classifySample(effectiveSpeed, motionActivityLevel);

  if (!transition) {
    if (snapshot.currentState === 'moving') {
      const result = processMovingState(snapshot, signals, effectiveSpeed, timestampMs);
      transition = result.transition;
      reason = result.reason;
    } else if (snapshot.currentState === 'stationary') {
      const result = processStationaryState(snapshot, signals, timestampMs);
      transition = result.transition;
      reason = result.reason;
    } else {
      const result = processUnknownState(snapshot, signals, effectiveSpeed, timestampMs);
      transition = result.transition;
      reason = result.reason;
    }
  }

  snapshot.lastSampleAtMs = timestampMs;

  return {
    snapshot,
    transition,
    reason,
    durationAccumulatedMs,
    evidence: signals.evidence,
  };
}

export function snapshotFromSessionStats(
  stats: Pick<
    MotionStateMachineSnapshot,
    | 'currentState'
    | 'candidateState'
    | 'candidateStartedAtMs'
    | 'candidateSampleCount'
    | 'lastSampleAtMs'
    | 'lastStateChangedAtMs'
  >,
): MotionStateMachineSnapshot {
  return {
    currentState: stats.currentState,
    candidateState: stats.candidateState,
    candidateStartedAtMs: stats.candidateStartedAtMs,
    candidateSampleCount: stats.candidateSampleCount,
    lastSampleAtMs: stats.lastSampleAtMs,
    lastStateChangedAtMs: stats.lastStateChangedAtMs,
  };
}

export function machineSnapshotToIsoFields(
  snapshot: MotionStateMachineSnapshot,
): Pick<
  MotionStateMachineSnapshot,
  | 'currentState'
  | 'candidateState'
  | 'candidateStartedAtMs'
  | 'candidateSampleCount'
  | 'lastSampleAtMs'
  | 'lastStateChangedAtMs'
> {
  return { ...snapshot };
}

/** Helper para tests — evalúa secuencia de muestras. */
export function simulateMotionStateSequence(
  samples: Array<{
    effectiveSpeed: EffectiveSpeedDecision;
    timestampMs: number;
    motionActivityLevel?: 'low' | 'medium' | 'high' | null;
  }>,
): MotionStateMachineSnapshot {
  let snapshot = createInitialMotionStateMachineSnapshot(samples[0]?.timestampMs ?? 0);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const delta = i > 0 ? sample.timestampMs - samples[i - 1].timestampMs : null;
    const result = stepMotionStateMachine({
      snapshot,
      effectiveSpeed: sample.effectiveSpeed,
      timestampMs: sample.timestampMs,
      deltaMsFromPreviousSample: delta,
      motionActivityLevel: sample.motionActivityLevel,
    });
    snapshot = result.snapshot;
  }
  return snapshot;
}
