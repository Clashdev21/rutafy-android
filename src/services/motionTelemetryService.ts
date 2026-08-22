/**
 * Motion Telemetry Service — Speed 2B.0 / 2B.1.
 *
 * FOREGROUND-ONLY: Accelerometer solo con AppState === active + sesión activa.
 * 2B.1: clasificación experimental + timeline ~30s (sin fusionar GPS).
 */

import { Accelerometer } from 'expo-sensors';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { probeSensorCapabilities } from '@/services/sensorCapabilitiesService';
import {
  appendSessionMotionTimelineBuckets,
  beginSessionMotionStatistics,
  endSessionMotionStatistics,
  patchSessionMotionStatistics,
  recordMotionCoverageGap,
  recordTrackingDiagnostic,
} from '@/services/trackingDiagnostics';
import { classifyMotionActivity } from '@/utils/motionActivityClassifier';
import {
  MOTION_SAMPLE_INTERVAL_MS,
  MOTION_WINDOW_DURATION_MS,
  MotionWindowAggregator,
  type MotionWindowSummary,
} from '@/utils/motionWindowAggregator';
import { MotionTimelineAggregator } from '@/utils/motionTimelineAggregator';
import type { MotionActivityLevel } from '@/types/motionActivity';

/** Emitir motion-window al ring cada N ventanas (stats siempre). */
const MOTION_WINDOW_RING_EVERY = 10;

let activeSessionId: string | null = null;
let accelSubscription: { remove: () => void } | null = null;
let appStateSub: NativeEventSubscription | null = null;
let aggregator: MotionWindowAggregator | null = null;
let timelineAggregator: MotionTimelineAggregator | null = null;
let listening = false;
let capabilitiesEmittedForSession: string | null = null;
let windowEmitCount = 0;
let foregroundListenStartedAtMs: number | null = null;
let hadSuccessfulStart = false;
let lastActivityLevel: MotionActivityLevel | null = null;
let coverageGapStartedAtMs: number | null = null;

function isAppActive(): boolean {
  return AppState.currentState === 'active';
}

function ensureTimelineAggregator(): MotionTimelineAggregator {
  if (!timelineAggregator) {
    timelineAggregator = new MotionTimelineAggregator();
  }
  return timelineAggregator;
}

function persistClosedBuckets(
  sessionId: string,
  buckets: ReturnType<MotionTimelineAggregator['pushWindow']>,
): void {
  if (buckets.length > 0) {
    appendSessionMotionTimelineBuckets(sessionId, buckets);
  }
}

function recordMotionWindow(
  sessionId: string,
  window: MotionWindowSummary,
  forceRing: boolean,
): void {
  windowEmitCount += 1;

  const classification = classifyMotionActivity({
    dynamicAccelRmsG: window.dynamicAccelRmsG,
    p95DynamicAccelG: window.p95DynamicAccelG,
    peakDynamicAccelG: window.peakDynamicAccelG,
  });

  if (
    classification.activityLevel != null &&
    lastActivityLevel != null &&
    lastActivityLevel !== classification.activityLevel
  ) {
    recordTrackingDiagnostic(
      'motion-activity-transition',
      {
        from: lastActivityLevel,
        to: classification.activityLevel,
        timestamp: window.windowEndedAt,
        rmsG: classification.rmsG,
      },
      sessionId,
    );
  }
  if (classification.activityLevel != null) {
    lastActivityLevel = classification.activityLevel;
  }

  const endedAtMs = Date.parse(window.windowEndedAt);
  const closedBuckets = ensureTimelineAggregator().pushWindow({
    windowEndedAtMs: Number.isFinite(endedAtMs) ? endedAtMs : Date.now(),
    activityLevel: classification.activityLevel,
    dynamicAccelRmsG: window.dynamicAccelRmsG,
    peakDynamicAccelG: window.peakDynamicAccelG,
    foregroundCoverageMs: MOTION_WINDOW_DURATION_MS,
  });
  persistClosedBuckets(sessionId, closedBuckets);

  const detail: Record<string, unknown> = {
    sampleCount: window.sampleCount,
    validSampleCount: window.validSampleCount,
    invalidSampleCount: window.invalidSampleCount,
    meanMagnitudeG: window.meanMagnitudeG,
    dynamicAccelMeanG: window.dynamicAccelMeanG,
    dynamicAccelRmsG: window.dynamicAccelRmsG,
    peakDynamicAccelG: window.peakDynamicAccelG,
    p95DynamicAccelG: window.p95DynamicAccelG,
    windowStartedAt: window.windowStartedAt,
    windowEndedAt: window.windowEndedAt,
    midpointTimestamp: window.midpointTimestamp,
    windowDurationMs: MOTION_WINDOW_DURATION_MS,
    sampleIntervalMs: MOTION_SAMPLE_INTERVAL_MS,
    activityLevel: classification.activityLevel,
    activityReason: classification.reason,
  };

  recordTrackingDiagnostic('motion-stat-window', detail, sessionId);

  if (forceRing || windowEmitCount === 1 || windowEmitCount % MOTION_WINDOW_RING_EVERY === 0) {
    recordTrackingDiagnostic('motion-window', detail, sessionId);
  }
}

function flushAggregator(forceRing = false): void {
  if (!aggregator || !activeSessionId) return;
  const summary = aggregator.flush();
  if (summary) {
    recordMotionWindow(activeSessionId, summary, forceRing);
  }
}

function flushTimelineOpenBucket(): void {
  if (!timelineAggregator || !activeSessionId) return;
  const bucket = timelineAggregator.flush();
  if (bucket) {
    appendSessionMotionTimelineBuckets(activeSessionId, [bucket]);
  }
}

function creditForegroundObserved(): void {
  if (foregroundListenStartedAtMs == null || !activeSessionId) return;
  const delta = Date.now() - foregroundListenStartedAtMs;
  foregroundListenStartedAtMs = null;
  if (delta > 0) {
    patchSessionMotionStatistics(activeSessionId, (stats) => ({
      ...stats,
      foregroundObservedMs: stats.foregroundObservedMs + delta,
    }));
  }
}

function stopAccelerometerInternal(reason: string): void {
  if (!listening && !accelSubscription) return;

  creditForegroundObserved();
  flushAggregator(false);
  flushTimelineOpenBucket();

  try {
    accelSubscription?.remove();
  } catch {
    // ignore
  }
  accelSubscription = null;
  listening = false;

  if (activeSessionId) {
    patchSessionMotionStatistics(activeSessionId, (stats) => ({
      ...stats,
      sensorStops: stats.sensorStops + 1,
    }));
    recordTrackingDiagnostic(
      'accelerometer-stop',
      { reason, sampleIntervalMs: MOTION_SAMPLE_INTERVAL_MS },
      activeSessionId,
    );

    if (reason === 'app_background' || reason === 'app_inactive') {
      coverageGapStartedAtMs = Date.now();
      // No clasificar gap como low — solo marcar inicio del hueco.
    }
  }
}

async function startAccelerometerInternal(): Promise<void> {
  if (!activeSessionId) return;
  if (!isAppActive()) return;
  if (listening) return;

  const caps = await probeSensorCapabilities();
  if (capabilitiesEmittedForSession !== activeSessionId) {
    capabilitiesEmittedForSession = activeSessionId;
    patchSessionMotionStatistics(activeSessionId, (stats) => ({
      ...stats,
      accelerometerAvailable: caps.accelerometer,
    }));
    recordTrackingDiagnostic(
      'sensor-capabilities',
      { ...caps },
      activeSessionId,
    );
  }

  if (!caps.accelerometer) {
    patchSessionMotionStatistics(activeSessionId, (stats) => ({
      ...stats,
      accelerometerAvailable: false,
    }));
    return;
  }

  try {
    if (coverageGapStartedAtMs != null) {
      const gapMs = Date.now() - coverageGapStartedAtMs;
      recordMotionCoverageGap(activeSessionId, {
        reason: 'foreground_resume',
        gapMs,
        gapStartedAt: new Date(coverageGapStartedAtMs).toISOString(),
        gapEndedAt: new Date().toISOString(),
      });
      coverageGapStartedAtMs = null;
      // Reinicia rachas sin atribuir low al gap (applyMotionCoverageGap).
      lastActivityLevel = null;
    }

    Accelerometer.setUpdateInterval(MOTION_SAMPLE_INTERVAL_MS);
    if (!aggregator) {
      aggregator = new MotionWindowAggregator(MOTION_WINDOW_DURATION_MS);
    }
    ensureTimelineAggregator();

    const sessionId = activeSessionId;
    accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
      if (!sessionId || !aggregator) return;
      const closed = aggregator.pushSample(x, y, z);
      if (closed) {
        recordMotionWindow(sessionId, closed, false);
      }
    });

    listening = true;
    foregroundListenStartedAtMs = Date.now();

    const isRestart = hadSuccessfulStart;
    hadSuccessfulStart = true;
    if (isRestart) {
      patchSessionMotionStatistics(sessionId, (stats) => ({
        ...stats,
        sensorRestarts: stats.sensorRestarts + 1,
        accelerometerAvailable: true,
      }));
    } else {
      patchSessionMotionStatistics(sessionId, (stats) => ({
        ...stats,
        accelerometerAvailable: true,
      }));
    }

    recordTrackingDiagnostic(
      'accelerometer-start',
      {
        sampleIntervalMs: MOTION_SAMPLE_INTERVAL_MS,
        windowDurationMs: MOTION_WINDOW_DURATION_MS,
        restart: isRestart,
      },
      sessionId,
    );
  } catch (error) {
    listening = false;
    accelSubscription = null;
    patchSessionMotionStatistics(activeSessionId, (stats) => ({
      ...stats,
      sensorStartFailures: stats.sensorStartFailures + 1,
    }));
    recordTrackingDiagnostic(
      'accelerometer-error',
      { error: String(error), phase: 'start' },
      activeSessionId,
    );
  }
}

function onAppStateChange(next: AppStateStatus): void {
  if (!activeSessionId) return;
  if (next === 'active') {
    void startAccelerometerInternal();
  } else {
    stopAccelerometerInternal(next === 'background' ? 'app_background' : 'app_inactive');
  }
}

function ensureAppStateListener(): void {
  if (appStateSub) return;
  appStateSub = AppState.addEventListener('change', onAppStateChange);
}

function removeAppStateListener(): void {
  appStateSub?.remove();
  appStateSub = null;
}

/**
 * Inicia / reanuda motion telemetry para una sesión de tracking.
 * Restore misma sessionId: beginSessionMotionStatistics conserva counters + timeline.
 */
export async function startMotionTelemetryForSession(sessionId: string): Promise<void> {
  if (!sessionId.trim()) return;

  const switched = activeSessionId != null && activeSessionId !== sessionId;
  if (switched) {
    stopAccelerometerInternal('session_switch');
    aggregator?.reset();
    aggregator = null;
    timelineAggregator?.reset();
    timelineAggregator = null;
    hadSuccessfulStart = false;
    windowEmitCount = 0;
    capabilitiesEmittedForSession = null;
    lastActivityLevel = null;
    coverageGapStartedAtMs = null;
  }

  activeSessionId = sessionId;
  beginSessionMotionStatistics(sessionId);
  ensureAppStateListener();

  if (!aggregator) {
    aggregator = new MotionWindowAggregator(MOTION_WINDOW_DURATION_MS);
  }
  ensureTimelineAggregator();

  await startAccelerometerInternal();
}

/** Pausa suscripción sin cerrar bucket (p.ej. tests). */
export function pauseMotionTelemetry(reason = 'pause'): void {
  stopAccelerometerInternal(reason);
}

/**
 * Cierra motion telemetry: stop sensor + endedAt en session motion stats.
 * No borra el bucket ni la timeline (export post-captura).
 */
export async function stopMotionTelemetryForSession(reason = 'cleanup'): Promise<void> {
  stopAccelerometerInternal(reason);
  removeAppStateListener();
  aggregator?.reset();
  aggregator = null;
  timelineAggregator?.reset();
  timelineAggregator = null;
  const sid = activeSessionId;
  activeSessionId = null;
  hadSuccessfulStart = false;
  windowEmitCount = 0;
  capabilitiesEmittedForSession = null;
  foregroundListenStartedAtMs = null;
  lastActivityLevel = null;
  coverageGapStartedAtMs = null;
  await endSessionMotionStatistics();
  if (sid && __DEV__) {
    console.log('[motion-telemetry-stop]', { sessionId: sid, reason });
  }
}

export function getMotionTelemetryActiveSessionId(): string | null {
  return activeSessionId;
}

export function isMotionTelemetryListening(): boolean {
  return listening;
}
