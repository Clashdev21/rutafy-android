/**
 * Motion State v1 (Tracking 3C) — diagnóstico moving/stationary/unknown.
 * NO estado operacional; NO se envía al backend.
 */

import type {
  EffectiveSpeedConfidence,
  EffectiveSpeedDecision,
  EffectiveSpeedSource,
} from '@/types/effectiveSpeed';

export type MotionState = 'moving' | 'stationary' | 'unknown';

export type MotionStateEvidence = 'effective_speed' | 'motion_activity' | 'insufficient';

export type MotionStateReason =
  | 'session_start_unknown'
  | 'moving_speed_confirmed'
  | 'moving_candidate'
  | 'stationary_speed_persisted'
  | 'stationary_candidate'
  | 'unknown_candidate'
  | 'insufficient_speed_evidence'
  | 'effective_speed_unavailable'
  | 'transition_hysteresis'
  | 'tracking_gap_unknown'
  | 'motion_activity_support';

export type MotionStateMachineSnapshot = {
  currentState: MotionState;
  candidateState: MotionState | null;
  candidateStartedAtMs: number | null;
  candidateSampleCount: number;
  lastSampleAtMs: number | null;
  lastStateChangedAtMs: number | null;
};

export type MotionStateTransitionRecord = {
  timestamp: string;
  from: MotionState;
  to: MotionState;
  reason: MotionStateReason;
  effectiveSpeedKmh: number | null;
  effectiveSpeedSource: EffectiveSpeedSource | null;
  confidence: EffectiveSpeedConfidence | null;
};

export type MotionStateStepInput = {
  snapshot: MotionStateMachineSnapshot;
  effectiveSpeed: EffectiveSpeedDecision;
  timestampMs: number;
  deltaMsFromPreviousSample: number | null;
  motionActivityLevel?: 'low' | 'medium' | 'high' | null;
};

export type MotionStateStepResult = {
  snapshot: MotionStateMachineSnapshot;
  transition: {
    from: MotionState;
    to: MotionState;
    reason: MotionStateReason;
  } | null;
  reason: MotionStateReason;
  durationAccumulatedMs: number;
  evidence: MotionStateEvidence;
};

export type MotionStateDecision = {
  state: MotionState;
  previousState: MotionState | null;
  reason: MotionStateReason;
  effectiveSpeedKmh: number | null;
  effectiveSpeedSource: EffectiveSpeedSource | null;
  effectiveSpeedConfidence: EffectiveSpeedConfidence | null;
  evidenceDurationMs: number | null;
  consecutiveSamples: number;
};
