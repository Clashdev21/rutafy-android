/**
 * Agregador de timeline motion — Speed 2B.1.
 * Buckets ~30 s; capacidad acotada. Pure + stateful in-memory.
 */

import type { MotionActivityLevel, MotionTimelineBucket } from '@/types/motionActivity';
import {
  MAX_MOTION_TIMELINE_BUCKETS,
  MOTION_TIMELINE_BUCKET_MS,
} from '@/types/motionActivityThresholds';
import { dominantActivityLevel } from '@/utils/motionActivityClassifier';
import { MOTION_WINDOW_DURATION_MS } from '@/utils/motionWindowAggregator';

type OpenBucket = {
  startedAtMs: number;
  windowCount: number;
  lowWindows: number;
  mediumWindows: number;
  highWindows: number;
  sumRms: number;
  rmsCount: number;
  maxRms: number;
  maxPeak: number;
  foregroundCoverageMs: number;
};

function createOpen(startedAtMs: number): OpenBucket {
  return {
    startedAtMs,
    windowCount: 0,
    lowWindows: 0,
    mediumWindows: 0,
    highWindows: 0,
    sumRms: 0,
    rmsCount: 0,
    maxRms: 0,
    maxPeak: 0,
    foregroundCoverageMs: 0,
  };
}

function finalizeOpen(open: OpenBucket, endedAtMs: number): MotionTimelineBucket {
  const avg =
    open.rmsCount > 0 ? open.sumRms / open.rmsCount : null;
  return {
    bucketStartedAt: new Date(open.startedAtMs).toISOString(),
    bucketEndedAt: new Date(endedAtMs).toISOString(),
    windowCount: open.windowCount,
    lowWindows: open.lowWindows,
    mediumWindows: open.mediumWindows,
    highWindows: open.highWindows,
    avgDynamicAccelRmsG: avg,
    maxDynamicAccelRmsG: open.rmsCount > 0 ? open.maxRms : null,
    maxPeakDynamicAccelG: open.windowCount > 0 ? open.maxPeak : null,
    dominantActivityLevel: dominantActivityLevel(
      open.lowWindows,
      open.mediumWindows,
      open.highWindows,
    ),
    foregroundCoverageMs: open.foregroundCoverageMs,
  };
}

export class MotionTimelineAggregator {
  private open: OpenBucket | null = null;
  private readonly bucketMs: number;
  private readonly maxBuckets: number;

  constructor(
    bucketMs = MOTION_TIMELINE_BUCKET_MS,
    maxBuckets = MAX_MOTION_TIMELINE_BUCKETS,
  ) {
    this.bucketMs = bucketMs;
    this.maxBuckets = maxBuckets;
  }

  reset(): void {
    this.open = null;
  }

  /**
   * Añade una ventana clasificada.
   * Devuelve buckets cerrados (0..n) para persistir.
   */
  pushWindow(input: {
    windowEndedAtMs: number;
    activityLevel: MotionActivityLevel | null;
    dynamicAccelRmsG: number | null;
    peakDynamicAccelG: number | null;
    /** ms de FG atribuidos a esta ventana (≈ duración ventana si listening). */
    foregroundCoverageMs?: number;
  }): MotionTimelineBucket[] {
    const closed: MotionTimelineBucket[] = [];
    const endedAt = input.windowEndedAtMs;

    if (!this.open) {
      this.open = createOpen(endedAt - MOTION_WINDOW_DURATION_MS);
    }

    while (endedAt - this.open.startedAtMs >= this.bucketMs && this.open.windowCount > 0) {
      const boundary = this.open.startedAtMs + this.bucketMs;
      closed.push(finalizeOpen(this.open, boundary));
      this.open = createOpen(boundary);
    }

    // Si el open quedó vacío tras split y el gap es grande, realinear start.
    if (this.open.windowCount === 0 && endedAt - this.open.startedAtMs >= this.bucketMs) {
      this.open = createOpen(endedAt - MOTION_WINDOW_DURATION_MS);
    }

    this.open.windowCount += 1;
    if (input.activityLevel === 'low') this.open.lowWindows += 1;
    else if (input.activityLevel === 'medium') this.open.mediumWindows += 1;
    else if (input.activityLevel === 'high') this.open.highWindows += 1;

    if (input.dynamicAccelRmsG != null && Number.isFinite(input.dynamicAccelRmsG)) {
      this.open.sumRms += input.dynamicAccelRmsG;
      this.open.rmsCount += 1;
      this.open.maxRms = Math.max(this.open.maxRms, input.dynamicAccelRmsG);
    }
    if (input.peakDynamicAccelG != null && Number.isFinite(input.peakDynamicAccelG)) {
      this.open.maxPeak = Math.max(this.open.maxPeak, input.peakDynamicAccelG);
    }
    this.open.foregroundCoverageMs +=
      typeof input.foregroundCoverageMs === 'number' && input.foregroundCoverageMs > 0
        ? input.foregroundCoverageMs
        : MOTION_WINDOW_DURATION_MS;

    return closed;
  }

  /** Cierra bucket abierto (background / cleanup). */
  flush(nowMs = Date.now()): MotionTimelineBucket | null {
    if (!this.open || this.open.windowCount === 0) {
      this.open = null;
      return null;
    }
    const bucket = finalizeOpen(this.open, nowMs);
    this.open = null;
    return bucket;
  }

  /** Aplica capacidad máxima (FIFO). */
  static capBuckets(
    buckets: MotionTimelineBucket[],
    max = MAX_MOTION_TIMELINE_BUCKETS,
  ): MotionTimelineBucket[] {
    if (buckets.length <= max) return buckets;
    return buckets.slice(buckets.length - max);
  }
}
