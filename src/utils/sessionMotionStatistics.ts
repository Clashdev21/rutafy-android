/**
 * Lógica pura Session Motion Statistics — Speed 2B.0 / 2B.1.
 */

import type { MotionActivityClassification } from '@/types/motionActivity';
import type { SessionMotionStatistics } from '@/types/sessionMotionStatistics';
import { EMPTY_SESSION_MOTION_COUNTERS } from '@/types/sessionMotionStatistics';
import { MOTION_HIGH_PEAK_MIN_G } from '@/types/motionActivityThresholds';
import { classifyMotionActivity } from '@/utils/motionActivityClassifier';
import type { MotionWindowSummary } from '@/utils/motionWindowAggregator';

export function createEmptySessionMotionStatistics(
  sessionId: string,
  startedAt = new Date().toISOString(),
): SessionMotionStatistics {
  return {
    ...EMPTY_SESSION_MOTION_COUNTERS,
    sessionId,
    startedAt,
    endedAt: null,
  };
}

export function shouldResetSessionMotionBucket(
  existing: SessionMotionStatistics | null,
  sessionId: string,
): boolean {
  if (!existing) return true;
  return existing.sessionId !== sessionId;
}

export function resolveSessionMotionBucket(
  existing: SessionMotionStatistics | null,
  sessionId: string,
  startedAt?: string,
): { stats: SessionMotionStatistics; reset: boolean } {
  if (!shouldResetSessionMotionBucket(existing, sessionId) && existing) {
    return {
      stats: {
        ...EMPTY_SESSION_MOTION_COUNTERS,
        ...existing,
        endedAt: null,
      },
      reset: false,
    };
  }
  return {
    stats: createEmptySessionMotionStatistics(
      sessionId,
      startedAt ?? new Date().toISOString(),
    ),
    reset: true,
  };
}

export function markSessionMotionEnded(
  stats: SessionMotionStatistics,
  endedAt = new Date().toISOString(),
): SessionMotionStatistics {
  const endIso = stats.endedAt ?? endedAt;
  return refreshSessionDuration(
    {
      ...stats,
      endedAt: endIso,
    },
    Date.parse(endIso),
  );
}

function incrementRunningAvg(
  prevAvg: number | null,
  count: number,
  value: number,
): number {
  if (count <= 1) return value;
  const base = prevAvg ?? value;
  return base + (value - base) / count;
}

function refreshActivityRatios(stats: SessionMotionStatistics): SessionMotionStatistics {
  const classified =
    stats.lowActivityWindows + stats.mediumActivityWindows + stats.highActivityWindows;
  if (classified <= 0) {
    return {
      ...stats,
      lowActivityRatio: null,
      mediumActivityRatio: null,
      highActivityRatio: null,
    };
  }
  return {
    ...stats,
    lowActivityRatio: stats.lowActivityWindows / classified,
    mediumActivityRatio: stats.mediumActivityWindows / classified,
    highActivityRatio: stats.highActivityWindows / classified,
  };
}

export function refreshSessionDuration(
  stats: SessionMotionStatistics,
  nowMs = Date.now(),
): SessionMotionStatistics {
  const startMs = Date.parse(stats.startedAt);
  const endMs =
    stats.endedAt != null && Number.isFinite(Date.parse(stats.endedAt))
      ? Date.parse(stats.endedAt)
      : nowMs;
  const sessionDurationMs =
    Number.isFinite(startMs) && endMs >= startMs ? endMs - startMs : 0;
  const foregroundCoverageRatio =
    sessionDurationMs > 0
      ? Math.min(1, Math.max(0, stats.foregroundObservedMs / sessionDurationMs))
      : null;
  return refreshActivityRatios({
    ...stats,
    sessionDurationMs,
    foregroundCoverageRatio,
  });
}

/**
 * Aplica ventana + clasificación experimental.
 * Devuelve { stats, classification, transition? }.
 */
export function applyMotionWindowToSession(
  stats: SessionMotionStatistics,
  window: MotionWindowSummary,
  classification?: MotionActivityClassification,
): {
  stats: SessionMotionStatistics;
  classification: MotionActivityClassification;
  transition: { from: NonNullable<SessionMotionStatistics['lastActivityLevel']>; to: NonNullable<SessionMotionStatistics['lastActivityLevel']> } | null;
} {
  const classified =
    classification ??
    classifyMotionActivity({
      dynamicAccelRmsG: window.dynamicAccelRmsG,
      p95DynamicAccelG: window.p95DynamicAccelG,
      peakDynamicAccelG: window.peakDynamicAccelG,
    });

  let next: SessionMotionStatistics = { ...stats };
  next.motionWindows += 1;
  next.accelerometerSamples += window.sampleCount;
  next.validAccelerometerSamples += window.validSampleCount;
  next.invalidAccelerometerSamples += window.invalidSampleCount;
  next.lastWindowStartedAt = window.windowStartedAt;
  next.lastWindowEndedAt = window.windowEndedAt;

  if (window.dynamicAccelRmsG != null && Number.isFinite(window.dynamicAccelRmsG)) {
    next.maxDynamicAccelRmsG =
      next.maxDynamicAccelRmsG == null
        ? window.dynamicAccelRmsG
        : Math.max(next.maxDynamicAccelRmsG, window.dynamicAccelRmsG);
    next.avgDynamicAccelRmsG = incrementRunningAvg(
      next.avgDynamicAccelRmsG,
      next.motionWindows,
      window.dynamicAccelRmsG,
    );
  }

  if (window.peakDynamicAccelG != null && Number.isFinite(window.peakDynamicAccelG)) {
    next.maxPeakDynamicAccelG =
      next.maxPeakDynamicAccelG == null
        ? window.peakDynamicAccelG
        : Math.max(next.maxPeakDynamicAccelG, window.peakDynamicAccelG);
    if (window.peakDynamicAccelG >= MOTION_HIGH_PEAK_MIN_G) {
      next.highPeakWindows += 1;
    }
  }

  if (window.dynamicAccelMeanG != null && Number.isFinite(window.dynamicAccelMeanG)) {
    next.avgDynamicAccelMeanG = incrementRunningAvg(
      next.avgDynamicAccelMeanG,
      next.motionWindows,
      window.dynamicAccelMeanG,
    );
  }

  let transition: {
    from: NonNullable<SessionMotionStatistics['lastActivityLevel']>;
    to: NonNullable<SessionMotionStatistics['lastActivityLevel']>;
  } | null = null;

  const level = classified.activityLevel;
  if (level != null) {
    if (level === 'low') next.lowActivityWindows += 1;
    else if (level === 'medium') next.mediumActivityWindows += 1;
    else next.highActivityWindows += 1;

    if (next.lastActivityLevel != null && next.lastActivityLevel !== level) {
      next.activityTransitions += 1;
      transition = { from: next.lastActivityLevel, to: level };
    }

    if (level === 'low') {
      next.currentLowSequenceWindows += 1;
      next.currentHighSequenceWindows = 0;
      next.longestLowActivitySequenceWindows = Math.max(
        next.longestLowActivitySequenceWindows,
        next.currentLowSequenceWindows,
      );
    } else if (level === 'high') {
      next.currentHighSequenceWindows += 1;
      next.currentLowSequenceWindows = 0;
      next.longestHighActivitySequenceWindows = Math.max(
        next.longestHighActivitySequenceWindows,
        next.currentHighSequenceWindows,
      );
    } else {
      next.currentLowSequenceWindows = 0;
      next.currentHighSequenceWindows = 0;
    }

    next.lastActivityLevel = level;
  }

  next = refreshSessionDuration(next);
  return { stats: next, classification: classified, transition };
}

export function applyForegroundObservedDelta(
  stats: SessionMotionStatistics,
  deltaMs: number,
  nowMs = Date.now(),
): SessionMotionStatistics {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return refreshSessionDuration(stats, nowMs);
  }
  return refreshSessionDuration(
    {
      ...stats,
      foregroundObservedMs: stats.foregroundObservedMs + deltaMs,
    },
    nowMs,
  );
}

/** Gap FG sin sensor: cuenta el hueco; NO clasifica como low. */
export function applyMotionCoverageGap(
  stats: SessionMotionStatistics,
): SessionMotionStatistics {
  return refreshSessionDuration({
    ...stats,
    coverageGapCount: stats.coverageGapCount + 1,
    currentLowSequenceWindows: 0,
    currentHighSequenceWindows: 0,
  });
}
