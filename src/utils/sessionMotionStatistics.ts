/**
 * Lógica pura Session Motion Statistics — Speed 2B.0.
 */

import type { SessionMotionStatistics } from '@/types/sessionMotionStatistics';
import { EMPTY_SESSION_MOTION_COUNTERS } from '@/types/sessionMotionStatistics';
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
  return {
    ...stats,
    sessionDurationMs,
    foregroundCoverageRatio,
  };
}

export function applyMotionWindowToSession(
  stats: SessionMotionStatistics,
  window: MotionWindowSummary,
): SessionMotionStatistics {
  const next = { ...stats };
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
  }

  if (window.dynamicAccelMeanG != null && Number.isFinite(window.dynamicAccelMeanG)) {
    next.avgDynamicAccelMeanG = incrementRunningAvg(
      next.avgDynamicAccelMeanG,
      next.motionWindows,
      window.dynamicAccelMeanG,
    );
  }

  return refreshSessionDuration(next);
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
