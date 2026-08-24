/**
 * Estadísticas session-scoped de Motion State (Tracking 3C).
 * Distinto de SessionMotionStatistics (acelerómetro 2B).
 */

import type { MotionState, MotionStateMachineSnapshot } from '@/types/motionState';

export type SessionMotionStateStatistics = MotionStateMachineSnapshot & {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;

  movingSamples: number;
  stationarySamples: number;
  unknownSamples: number;

  movingTransitions: number;
  stationaryTransitions: number;
  unknownTransitions: number;

  movingObservedMs: number;
  stationaryObservedMs: number;
  unknownObservedMs: number;

  longestMovingPeriodMs: number | null;
  longestStationaryPeriodMs: number | null;

  lastStateChangedAt: string | null;
};

export type SessionMotionStateTimeline = {
  sessionId: string;
  transitions: import('@/types/motionState').MotionStateTransitionRecord[];
};

export const EMPTY_SESSION_MOTION_STATE_STATISTICS: Omit<
  SessionMotionStateStatistics,
  'sessionId' | 'startedAt' | 'endedAt'
> = {
  currentState: 'unknown',
  candidateState: null,
  candidateStartedAtMs: null,
  candidateSampleCount: 0,
  lastSampleAtMs: null,
  lastStateChangedAtMs: null,
  movingSamples: 0,
  stationarySamples: 0,
  unknownSamples: 0,
  movingTransitions: 0,
  stationaryTransitions: 0,
  unknownTransitions: 0,
  movingObservedMs: 0,
  stationaryObservedMs: 0,
  unknownObservedMs: 0,
  longestMovingPeriodMs: null,
  longestStationaryPeriodMs: null,
  lastStateChangedAt: null,
};
