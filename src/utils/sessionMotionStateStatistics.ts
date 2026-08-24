/**
 * Lógica pura Session Motion State Statistics (Tracking 3C).
 */

import type { MotionState, MotionStateTransitionRecord } from '@/types/motionState';
import type {
  SessionMotionStateStatistics,
  SessionMotionStateTimeline,
} from '@/types/sessionMotionStateStatistics';
import { EMPTY_SESSION_MOTION_STATE_STATISTICS } from '@/types/sessionMotionStateStatistics';
import type { MotionStateStepResult } from '@/types/motionState';
import type { EffectiveSpeedDecision } from '@/types/effectiveSpeed';
import { MAX_MOTION_STATE_TRANSITIONS } from '@/utils/motionStateThresholds';
import { machineSnapshotToIsoFields } from '@/utils/motionStateMachine';

export function createEmptySessionMotionStateStatistics(
  sessionId: string,
  startedAt = new Date().toISOString(),
): SessionMotionStateStatistics {
  return {
    ...EMPTY_SESSION_MOTION_STATE_STATISTICS,
    sessionId,
    startedAt,
    endedAt: null,
    lastStateChangedAtMs: Date.parse(startedAt),
  };
}

export function shouldResetSessionMotionStateBucket(
  existing: SessionMotionStateStatistics | null,
  sessionId: string,
): boolean {
  if (!existing) return true;
  return existing.sessionId !== sessionId;
}

export function resolveSessionMotionStateBucket(
  existing: SessionMotionStateStatistics | null,
  sessionId: string,
  startedAt?: string,
): { stats: SessionMotionStateStatistics; reset: boolean } {
  if (!shouldResetSessionMotionStateBucket(existing, sessionId) && existing) {
    const defaults = createEmptySessionMotionStateStatistics(existing.sessionId, existing.startedAt);
    return {
      stats: { ...defaults, ...existing, endedAt: null },
      reset: false,
    };
  }
  return {
    stats: createEmptySessionMotionStateStatistics(
      sessionId,
      startedAt ?? new Date().toISOString(),
    ),
    reset: true,
  };
}

export function markSessionMotionStateEnded(
  stats: SessionMotionStateStatistics,
  endedAt = new Date().toISOString(),
): SessionMotionStateStatistics {
  return {
    ...stats,
    endedAt: stats.endedAt ?? endedAt,
  };
}

export function createEmptyMotionStateTimeline(sessionId: string): SessionMotionStateTimeline {
  return { sessionId, transitions: [] };
}

export function capMotionStateTransitions(
  transitions: MotionStateTransitionRecord[],
): MotionStateTransitionRecord[] {
  if (transitions.length <= MAX_MOTION_STATE_TRANSITIONS) return transitions;
  return transitions.slice(-MAX_MOTION_STATE_TRANSITIONS);
}

function incrementStateSample(stats: SessionMotionStateStatistics, state: MotionState): void {
  if (state === 'moving') stats.movingSamples += 1;
  else if (state === 'stationary') stats.stationarySamples += 1;
  else stats.unknownSamples += 1;
}

function addObservedDuration(
  stats: SessionMotionStateStatistics,
  state: MotionState,
  durationMs: number,
): void {
  if (durationMs <= 0) return;
  if (state === 'moving') {
    stats.movingObservedMs += durationMs;
    stats.longestMovingPeriodMs =
      stats.longestMovingPeriodMs == null
        ? durationMs
        : Math.max(stats.longestMovingPeriodMs, durationMs);
  } else if (state === 'stationary') {
    stats.stationaryObservedMs += durationMs;
    stats.longestStationaryPeriodMs =
      stats.longestStationaryPeriodMs == null
        ? durationMs
        : Math.max(stats.longestStationaryPeriodMs, durationMs);
  } else {
    stats.unknownObservedMs += durationMs;
  }
}

function incrementTransitionCounter(
  stats: SessionMotionStateStatistics,
  to: MotionState,
): void {
  if (to === 'moving') stats.movingTransitions += 1;
  else if (to === 'stationary') stats.stationaryTransitions += 1;
  else stats.unknownTransitions += 1;
}

export function applyMotionStateStepToSession(
  stats: SessionMotionStateStatistics,
  step: MotionStateStepResult,
  effectiveSpeed: EffectiveSpeedDecision,
  timestampIso: string,
): SessionMotionStateStatistics {
  const next = { ...stats };

  if (step.durationAccumulatedMs > 0) {
    addObservedDuration(next, stats.currentState, step.durationAccumulatedMs);
  }

  const machineFields = machineSnapshotToIsoFields(step.snapshot);
  Object.assign(next, machineFields);
  next.lastStateChangedAt =
    step.transition != null
      ? timestampIso
      : stats.lastStateChangedAt;

  incrementStateSample(next, step.snapshot.currentState);

  if (step.transition) {
    incrementTransitionCounter(next, step.transition.to);
  }

  return next;
}

export function appendMotionStateTransition(
  timeline: SessionMotionStateTimeline,
  transition: NonNullable<MotionStateStepResult['transition']>,
  effectiveSpeed: EffectiveSpeedDecision,
  timestampIso: string,
): SessionMotionStateTimeline {
  const entry: MotionStateTransitionRecord = {
    timestamp: timestampIso,
    from: transition.from,
    to: transition.to,
    reason: transition.reason,
    effectiveSpeedKmh: effectiveSpeed.speedKmh,
    effectiveSpeedSource: effectiveSpeed.source,
    confidence: effectiveSpeed.confidence,
  };
  return {
    sessionId: timeline.sessionId,
    transitions: capMotionStateTransitions([...timeline.transitions, entry]),
  };
}
