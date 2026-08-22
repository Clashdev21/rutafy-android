/**
 * Session Motion Statistics — Speed 2B.0 / 2B.1 (foreground-only, observacional).
 *
 * Unidades internas: g (1 g ≈ 9.80665 m/s²). No mezclar con m/s² de Device Info HW.
 */

import type { MotionActivityLevel } from '@/types/motionActivity';

export type SessionMotionStatistics = {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;

  accelerometerAvailable: boolean;

  accelerometerSamples: number;
  validAccelerometerSamples: number;
  invalidAccelerometerSamples: number;

  motionWindows: number;

  avgDynamicAccelRmsG: number | null;
  maxDynamicAccelRmsG: number | null;
  maxPeakDynamicAccelG: number | null;
  avgDynamicAccelMeanG: number | null;

  sensorStartFailures: number;
  sensorStops: number;
  sensorRestarts: number;

  /** ms acumulados con acelerómetro escuchando en foreground. */
  foregroundObservedMs: number;
  /** ms desde startedAt hasta ahora (o endedAt). */
  sessionDurationMs: number;
  /** foregroundObservedMs / sessionDurationMs (0..1). */
  foregroundCoverageRatio: number | null;

  lastWindowStartedAt: string | null;
  lastWindowEndedAt: string | null;

  /** Speed 2B.1 — actividad experimental (no operacional). */
  lowActivityWindows: number;
  mediumActivityWindows: number;
  highActivityWindows: number;
  lowActivityRatio: number | null;
  mediumActivityRatio: number | null;
  highActivityRatio: number | null;
  longestLowActivitySequenceWindows: number;
  longestHighActivitySequenceWindows: number;
  activityTransitions: number;
  lastActivityLevel: MotionActivityLevel | null;
  /** Picos altos sin semántica (bache / manejo / frenada). */
  highPeakWindows: number;
  coverageGapCount: number;

  /** rachas internas (persistidas para restore). */
  currentLowSequenceWindows: number;
  currentHighSequenceWindows: number;
};

export const EMPTY_SESSION_MOTION_COUNTERS: Omit<
  SessionMotionStatistics,
  'sessionId' | 'startedAt' | 'endedAt'
> = {
  accelerometerAvailable: false,
  accelerometerSamples: 0,
  validAccelerometerSamples: 0,
  invalidAccelerometerSamples: 0,
  motionWindows: 0,
  avgDynamicAccelRmsG: null,
  maxDynamicAccelRmsG: null,
  maxPeakDynamicAccelG: null,
  avgDynamicAccelMeanG: null,
  sensorStartFailures: 0,
  sensorStops: 0,
  sensorRestarts: 0,
  foregroundObservedMs: 0,
  sessionDurationMs: 0,
  foregroundCoverageRatio: null,
  lastWindowStartedAt: null,
  lastWindowEndedAt: null,
  lowActivityWindows: 0,
  mediumActivityWindows: 0,
  highActivityWindows: 0,
  lowActivityRatio: null,
  mediumActivityRatio: null,
  highActivityRatio: null,
  longestLowActivitySequenceWindows: 0,
  longestHighActivitySequenceWindows: 0,
  activityTransitions: 0,
  lastActivityLevel: null,
  highPeakWindows: 0,
  coverageGapCount: 0,
  currentLowSequenceWindows: 0,
  currentHighSequenceWindows: 0,
};
