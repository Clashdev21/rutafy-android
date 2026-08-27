import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState } from 'react-native';

import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { SessionMotionTimeline, MotionTimelineBucket } from '@/types/motionActivity';
import type { SessionMotionStatistics } from '@/types/sessionMotionStatistics';
import type {
  SessionMotionStateStatistics,
  SessionMotionStateTimeline,
} from '@/types/sessionMotionStateStatistics';
import type { SessionSpeedStatistics } from '@/types/sessionSpeedStatistics';
import type {
  SessionAppStateTimeline,
  SessionTaskLifecycleSummary,
  SessionTrackingGapStatistics,
  SessionTrackingGapTimeline,
  SessionTrackingPipelineStatistics,
} from '@/types/sessionTrackingPipeline';
import type { MotionStateStepResult } from '@/types/motionState';
import type { EffectiveSpeedDecision } from '@/types/effectiveSpeed';
import type {
  TrackingDiagnosticEvent,
  TrackingDiagnosticExport,
  TrackingDiagnosticExportAnalysis,
  TrackingHealthCheckOptions,
  TrackingSessionEndReason,
  TrackingSnapshot,
  TrackingStatistics,
} from '@/types/trackingDiagnostics';
import { EMPTY_TRACKING_STATISTICS } from '@/types/trackingDiagnostics';
import {
  applyGapToStatistics,
  applyPipelineEventToSession,
  buildGapTimelineEntry,
  buildTaskLifecycleSummary,
  capAppStateTransitions,
  capGapTimeline,
  createEmptyAppStateTimeline,
  createEmptyGapStatistics,
  createEmptyGapTimeline,
  gapEventType,
  markSessionPipelineEnded,
  resolveSessionPipelineBucket,
} from '@/utils/sessionTrackingPipelineStatistics';
import type { ClassifyTrackingGapResult } from '@/utils/trackingGapClassifier';
import {
  applyMotionStateStepToSession,
  appendMotionStateTransition,
  createEmptyMotionStateTimeline,
  markSessionMotionStateEnded,
  resolveSessionMotionStateBucket,
} from '@/utils/sessionMotionStateStatistics';
import {
  applyMotionCoverageGap,
  applyMotionWindowToSession,
  markSessionMotionEnded,
  refreshSessionDuration,
  resolveSessionMotionBucket,
} from '@/utils/sessionMotionStatistics';
import {
  applySpeedStatEventToCounters,
  markSessionSpeedEnded,
  resolveSessionSpeedBucket,
} from '@/utils/sessionSpeedStatistics';
import type { MotionWindowSummary } from '@/utils/motionWindowAggregator';
import { MotionTimelineAggregator } from '@/utils/motionTimelineAggregator';
import { analyzeTrackingDiagnostics } from '@/utils/trackingDiagnosticAnalyzer';

const EVENTS_KEY = 'rutafy_tracking_diag_events';
const SNAPSHOT_KEY = 'rutafy_tracking_diag_snapshot';
const STATS_KEY = 'rutafy_tracking_diag_stats';
const END_REASON_KEY = 'rutafy_tracking_diag_end_reason';
/** Speed 2A.2.1 — un solo bucket: sesión activa o última finalizada. */
const SESSION_SPEED_STATS_KEY = 'rutafy_tracking_diag_session_speed_stats';
/** Speed 2B.0 — motion foreground-only, sesión activa o última finalizada. */
const SESSION_MOTION_STATS_KEY = 'rutafy_tracking_diag_session_motion_stats';
/** Speed 2B.1 — timeline acotada de la sesión actual/última. */
const SESSION_MOTION_TIMELINE_KEY = 'rutafy_tracking_diag_session_motion_timeline';
/** Tracking 3C — motion state (effectiveSpeed-based), distinto de acelerómetro 2B. */
const SESSION_MOTION_STATE_STATS_KEY = 'rutafy_tracking_diag_session_motion_state_stats';
const SESSION_MOTION_STATE_TIMELINE_KEY = 'rutafy_tracking_diag_session_motion_state_timeline';
/** Reliability 3A — pipeline session-scoped. */
const SESSION_PIPELINE_STATS_KEY = 'rutafy_tracking_diag_session_pipeline_stats';
const SESSION_GAP_STATS_KEY = 'rutafy_tracking_diag_session_gap_stats';
const SESSION_GAP_TIMELINE_KEY = 'rutafy_tracking_diag_session_gap_timeline';
const SESSION_APP_STATE_TIMELINE_KEY = 'rutafy_tracking_diag_app_state_timeline';
const SESSION_PIPELINE_TASK_ERROR_KEY = 'rutafy_tracking_diag_session_pipeline_task_error';

const MAX_EVENTS = 100;
const STALE_THRESHOLD_MS = 180_000;

let persistChain: Promise<void> = Promise.resolve();

function nowIso(): string {
  return new Date().toISOString();
}

function gapSecondsSince(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function normalizeStatistics(stats: Partial<TrackingStatistics>): TrackingStatistics {
  return { ...EMPTY_TRACKING_STATISTICS, ...stats };
}

function enqueuePersist(fn: () => Promise<void>): void {
  persistChain = persistChain.then(fn).catch(() => undefined);
}

function runOnPersistChain<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    enqueuePersist(async () => {
      try {
        resolve(await fn());
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizeSpeedStatsEventType(type: string): string | null {
  if (type.startsWith('speed-stat-')) {
    if (type === 'speed-stat-rejected') return 'speed-sample-rejected';
    // Eventos 2A.2 con nombre propio (no colapsar a speed-*).
    if (
      type.startsWith('speed-stat-quality-') ||
      type === 'speed-stat-native-zero' ||
      type === 'speed-stat-native-zero-moving' ||
      type === 'speed-stat-poor-accuracy' ||
      type === 'speed-stat-long-gap' ||
      type === 'speed-stat-implausible' ||
      type === 'speed-stat-fix-age' ||
      type === 'speed-stat-mocked' ||
      type === 'speed-stat-fix-meta' ||
      type === 'speed-stat-effective'
    ) {
      return type;
    }
    return type.replace('speed-stat-', 'speed-');
  }
  if (
    type === 'speed-native' ||
    type === 'speed-derived' ||
    type === 'speed-unavailable' ||
    type === 'speed-sample-rejected' ||
    type === 'speed-quality-good' ||
    type === 'speed-quality-weak' ||
    type === 'speed-quality-rejected' ||
    type === 'speed-native-zero-moving' ||
    type === 'gps-fix-stale' ||
    type === 'gps-fix-mocked'
  ) {
    return null;
  }
  return type;
}

function applyEventToStats(
  type: string,
  stats: TrackingStatistics,
  detail?: Record<string, unknown>,
): TrackingStatistics {
  const statsType = normalizeSpeedStatsEventType(type);
  if (statsType == null) {
    return stats;
  }

  const speedUpdated = applySpeedStatEventToCounters(statsType, stats, detail);
  if (speedUpdated != null) {
    return speedUpdated;
  }

  const next = { ...stats };
  switch (statsType) {
    case 'gps-fix-received':
      next.gpsFixes += 1;
      break;
    case 'point-mapped':
      next.pointsMapped += 1;
      break;
    case 'point-buffered':
      next.pointsBuffered += 1;
      break;
    case 'batch-created':
      next.batchesCreated += 1;
      break;
    case 'batch-send':
      next.batchesSent += 1;
      break;
    case 'batch-success':
      // Éxito HTTP técnico; batchesAccepted solo en batch-accepted.
      break;
    case 'batch-accepted':
      next.batchesAccepted += 1;
      break;
    case 'batch-error':
    case 'batch-timeout':
      next.httpErrors += 1;
      break;
    case 'batch-401':
      next.http401 += 1;
      next.httpErrors += 1;
      break;
    case 'batch-403':
      next.http403 += 1;
      next.httpErrors += 1;
      break;
    case 'batch-500':
      next.http500 += 1;
      next.httpErrors += 1;
      break;
    case 'refresh-success':
      next.refreshCount += 1;
      break;
    case 'refresh-failed':
      next.refreshFailures += 1;
      break;
    case 'bg-task-restored':
      next.backgroundRestarts += 1;
      break;
    case 'gps-location-error':
    case 'gps-location-timeout':
      next.gpsErrors += 1;
      break;
    case 'bg-task-stop':
      next.taskStops += 1;
      break;
    default:
      break;
  }
  return next;
}

function applyEventToSnapshot(
  type: string,
  snapshot: TrackingSnapshot,
  timestamp: string,
  detail?: Record<string, unknown>,
): TrackingSnapshot {
  const next = { ...snapshot };
  switch (type) {
    case 'gps-fix-received':
      next.lastGpsAt = timestamp;
      break;
    case 'point-buffered':
      next.lastPointBufferedAt = timestamp;
      break;
    case 'batch-created':
      next.lastBatchCreatedAt = timestamp;
      break;
    case 'batch-send':
      next.lastBatchSentAt = timestamp;
      break;
    case 'batch-success':
      break;
    case 'batch-accepted':
      next.lastBatchAcceptedAt = timestamp;
      next.lastHeartbeatAt = timestamp;
      break;
    case 'refresh-success':
      next.lastRefreshAt = timestamp;
      break;
    case 'bg-task-start':
    case 'bg-task-stop':
    case 'bg-task-error':
    case 'bg-task-killed':
    case 'bg-task-restored':
      next.lastTaskEventAt = timestamp;
      break;
    default:
      break;
  }
  if (typeof detail?.fgServiceStarted === 'boolean') {
    next.fgServiceStarted = detail.fgServiceStarted;
  }
  if (typeof detail?.taskManagerStarted === 'boolean') {
    next.taskManagerStarted = detail.taskManagerStarted;
  }
  return next;
}

/**
 * Inicia o continúa el bucket de sesión Speed.
 * Misma sessionId → conserva; distinta → cero.
 */
export function beginSessionSpeedStatistics(sessionId: string): void {
  if (!sessionId.trim()) return;
  enqueuePersist(async () => {
    const existing = await readJson<SessionSpeedStatistics | null>(
      SESSION_SPEED_STATS_KEY,
      null,
    );
    const { stats } = resolveSessionSpeedBucket(existing, sessionId);
    await writeJson(SESSION_SPEED_STATS_KEY, stats);
  });
}

/** Marca endedAt; no borra el bucket (export post-captura). */
export async function endSessionSpeedStatistics(): Promise<void> {
  await runOnPersistChain(async () => {
    const existing = await readJson<SessionSpeedStatistics | null>(
      SESSION_SPEED_STATS_KEY,
      null,
    );
    if (!existing) return;
    await writeJson(SESSION_SPEED_STATS_KEY, markSessionSpeedEnded(existing));
  });
}

export async function getSessionSpeedStatistics(): Promise<SessionSpeedStatistics | null> {
  return readJson<SessionSpeedStatistics | null>(SESSION_SPEED_STATS_KEY, null);
}

/**
 * Inicia o continúa el bucket de sesión Motion (2B.0/2B.1).
 * Misma sessionId → conserva; distinta → cero (+ timeline nueva).
 */
export function beginSessionMotionStatistics(sessionId: string): void {
  if (!sessionId.trim()) return;
  enqueuePersist(async () => {
    const [existing, existingTimeline] = await Promise.all([
      readJson<SessionMotionStatistics | null>(SESSION_MOTION_STATS_KEY, null),
      readJson<SessionMotionTimeline | null>(SESSION_MOTION_TIMELINE_KEY, null),
    ]);
    const { stats, reset } = resolveSessionMotionBucket(existing, sessionId);
    await writeJson(SESSION_MOTION_STATS_KEY, refreshSessionDuration(stats));
    if (reset || !existingTimeline || existingTimeline.sessionId !== sessionId) {
      await writeJson(SESSION_MOTION_TIMELINE_KEY, {
        sessionId,
        buckets: [],
      } satisfies SessionMotionTimeline);
    }
  });
}

/** Marca endedAt; no borra el bucket (export post-captura). */
export async function endSessionMotionStatistics(): Promise<void> {
  await runOnPersistChain(async () => {
    const existing = await readJson<SessionMotionStatistics | null>(
      SESSION_MOTION_STATS_KEY,
      null,
    );
    if (!existing) return;
    await writeJson(SESSION_MOTION_STATS_KEY, markSessionMotionEnded(existing));
  });
}

export async function getSessionMotionStatistics(): Promise<SessionMotionStatistics | null> {
  return readJson<SessionMotionStatistics | null>(SESSION_MOTION_STATS_KEY, null);
}

export async function getSessionMotionTimeline(): Promise<SessionMotionTimeline | null> {
  return readJson<SessionMotionTimeline | null>(SESSION_MOTION_TIMELINE_KEY, null);
}

/** Append buckets cerrados a la timeline de la sesión. */
export function appendSessionMotionTimelineBuckets(
  sessionId: string,
  buckets: MotionTimelineBucket[],
): void {
  if (!sessionId.trim() || buckets.length === 0) return;
  enqueuePersist(async () => {
    const existing = await readJson<SessionMotionTimeline | null>(
      SESSION_MOTION_TIMELINE_KEY,
      null,
    );
    if (!existing || existing.sessionId !== sessionId) {
      await writeJson(SESSION_MOTION_TIMELINE_KEY, {
        sessionId,
        buckets: MotionTimelineAggregator.capBuckets(buckets),
      } satisfies SessionMotionTimeline);
      return;
    }
    const next = MotionTimelineAggregator.capBuckets([
      ...existing.buckets,
      ...buckets,
    ]);
    await writeJson(SESSION_MOTION_TIMELINE_KEY, {
      sessionId,
      buckets: next,
    } satisfies SessionMotionTimeline);
  });
}

/** Patch atómico del bucket motion (misma sessionId). */
export function patchSessionMotionStatistics(
  sessionId: string,
  updater: (stats: SessionMotionStatistics) => SessionMotionStatistics,
): void {
  if (!sessionId.trim()) return;
  enqueuePersist(async () => {
    const existing = await readJson<SessionMotionStatistics | null>(
      SESSION_MOTION_STATS_KEY,
      null,
    );
    if (!existing || existing.sessionId !== sessionId) return;
    const next = refreshSessionDuration(updater(existing));
    await writeJson(SESSION_MOTION_STATS_KEY, next);
  });
}

export function recordMotionCoverageGap(sessionId: string, detail?: Record<string, unknown>): void {
  if (!sessionId.trim()) return;
  patchSessionMotionStatistics(sessionId, (stats) => applyMotionCoverageGap(stats));
  recordTrackingDiagnostic('motion-coverage-gap', detail, sessionId);
}

// ─── Tracking 3C — motion state (effectiveSpeed-based) ─────────────────────────

export function beginSessionMotionStateStatistics(sessionId: string): void {
  if (!sessionId.trim()) return;
  enqueuePersist(async () => {
    const [existing, existingTimeline] = await Promise.all([
      readJson<SessionMotionStateStatistics | null>(SESSION_MOTION_STATE_STATS_KEY, null),
      readJson<SessionMotionStateTimeline | null>(SESSION_MOTION_STATE_TIMELINE_KEY, null),
    ]);
    const { stats, reset } = resolveSessionMotionStateBucket(existing, sessionId);
    const writes: Promise<void>[] = [writeJson(SESSION_MOTION_STATE_STATS_KEY, stats)];
    if (reset || !existingTimeline || existingTimeline.sessionId !== sessionId) {
      writes.push(writeJson(SESSION_MOTION_STATE_TIMELINE_KEY, createEmptyMotionStateTimeline(sessionId)));
    }
    await Promise.all(writes);
  });
}

export async function endSessionMotionStateStatistics(): Promise<void> {
  await runOnPersistChain(async () => {
    const existing = await readJson<SessionMotionStateStatistics | null>(
      SESSION_MOTION_STATE_STATS_KEY,
      null,
    );
    if (!existing) return;
    await writeJson(SESSION_MOTION_STATE_STATS_KEY, markSessionMotionStateEnded(existing));
  });
}

export async function getSessionMotionStateStatistics(): Promise<SessionMotionStateStatistics | null> {
  return readJson<SessionMotionStateStatistics | null>(SESSION_MOTION_STATE_STATS_KEY, null);
}

export async function getSessionMotionStateTimeline(): Promise<SessionMotionStateTimeline | null> {
  return readJson<SessionMotionStateTimeline | null>(SESSION_MOTION_STATE_TIMELINE_KEY, null);
}

export function recordMotionStateStepDiagnostic(
  sessionId: string,
  timestampIso: string,
  step: MotionStateStepResult,
  effectiveSpeed: EffectiveSpeedDecision,
): void {
  if (!sessionId.trim()) return;

  enqueuePersist(async () => {
    const [stats, timeline] = await Promise.all([
      readJson<SessionMotionStateStatistics | null>(SESSION_MOTION_STATE_STATS_KEY, null),
      readJson<SessionMotionStateTimeline | null>(SESSION_MOTION_STATE_TIMELINE_KEY, null),
    ]);
    const baseStats =
      stats && stats.sessionId === sessionId
        ? stats
        : resolveSessionMotionStateBucket(null, sessionId).stats;
    const baseTimeline =
      timeline && timeline.sessionId === sessionId
        ? timeline
        : createEmptyMotionStateTimeline(sessionId);

    const nextStats = applyMotionStateStepToSession(baseStats, step, effectiveSpeed, timestampIso);
    let nextTimeline = baseTimeline;
    if (step.transition) {
      nextTimeline = appendMotionStateTransition(
        baseTimeline,
        step.transition,
        effectiveSpeed,
        timestampIso,
      );
    }

    await Promise.all([
      writeJson(SESSION_MOTION_STATE_STATS_KEY, nextStats),
      writeJson(SESSION_MOTION_STATE_TIMELINE_KEY, nextTimeline),
    ]);
  });

  if (step.transition) {
    recordTrackingDiagnostic(
      'motion-state-transition',
      {
        from: step.transition.from,
        to: step.transition.to,
        reason: step.transition.reason,
        effectiveSpeedKmh: effectiveSpeed.speedKmh,
        effectiveSpeedSource: effectiveSpeed.source,
        confidence: effectiveSpeed.confidence,
      },
      sessionId,
    );
  } else {
    recordTrackingDiagnostic(
      'motion-stat-sample',
      {
        state: step.snapshot.currentState,
        reason: step.reason,
        candidateState: step.snapshot.candidateState,
        candidateSampleCount: step.snapshot.candidateSampleCount,
        effectiveSpeedKmh: effectiveSpeed.speedKmh,
        effectiveSpeedSource: effectiveSpeed.source,
      },
      sessionId,
    );
  }
}

// ─── Reliability 3A — session pipeline observability ─────────────────────────

export function beginSessionTrackingPipelineStatistics(sessionId: string): void {
  if (!sessionId.trim()) return;
  enqueuePersist(async () => {
    const [existingPipeline, existingGapStats, existingGapTimeline, existingAppState] =
      await Promise.all([
        readJson<SessionTrackingPipelineStatistics | null>(SESSION_PIPELINE_STATS_KEY, null),
        readJson<SessionTrackingGapStatistics | null>(SESSION_GAP_STATS_KEY, null),
        readJson<SessionTrackingGapTimeline | null>(SESSION_GAP_TIMELINE_KEY, null),
        readJson<SessionAppStateTimeline | null>(SESSION_APP_STATE_TIMELINE_KEY, null),
      ]);
    const { stats, reset } = resolveSessionPipelineBucket(existingPipeline, sessionId);
    const writes: Promise<void>[] = [writeJson(SESSION_PIPELINE_STATS_KEY, stats)];
    if (reset || !existingGapStats) {
      writes.push(writeJson(SESSION_GAP_STATS_KEY, createEmptyGapStatistics()));
    }
    if (reset || !existingGapTimeline || existingGapTimeline.sessionId !== sessionId) {
      writes.push(writeJson(SESSION_GAP_TIMELINE_KEY, createEmptyGapTimeline(sessionId)));
    }
    if (reset || !existingAppState || existingAppState.sessionId !== sessionId) {
      writes.push(writeJson(SESSION_APP_STATE_TIMELINE_KEY, createEmptyAppStateTimeline(sessionId)));
    }
    if (reset) {
      writes.push(writeJson(SESSION_PIPELINE_TASK_ERROR_KEY, { at: null, detail: null }));
    }
    await Promise.all(writes);
  });
  recordTrackingDiagnostic('tracking-pipeline-session-start', { sessionId }, sessionId);
}

export async function endSessionTrackingPipelineStatistics(): Promise<void> {
  await runOnPersistChain(async () => {
    const existing = await readJson<SessionTrackingPipelineStatistics | null>(
      SESSION_PIPELINE_STATS_KEY,
      null,
    );
    if (!existing) return;
    await writeJson(SESSION_PIPELINE_STATS_KEY, markSessionPipelineEnded(existing));
  });
}

export async function getSessionTrackingPipelineStatistics(): Promise<SessionTrackingPipelineStatistics | null> {
  return readJson<SessionTrackingPipelineStatistics | null>(SESSION_PIPELINE_STATS_KEY, null);
}

export async function getSessionTrackingGapStatistics(): Promise<SessionTrackingGapStatistics | null> {
  return readJson<SessionTrackingGapStatistics | null>(SESSION_GAP_STATS_KEY, null);
}

export async function getSessionTrackingGapTimeline(): Promise<SessionTrackingGapTimeline | null> {
  return readJson<SessionTrackingGapTimeline | null>(SESSION_GAP_TIMELINE_KEY, null);
}

export async function getSessionAppStateTimeline(): Promise<SessionAppStateTimeline | null> {
  return readJson<SessionAppStateTimeline | null>(SESSION_APP_STATE_TIMELINE_KEY, null);
}

export function patchSessionPipelineStatistics(
  sessionId: string,
  updater: (stats: SessionTrackingPipelineStatistics) => SessionTrackingPipelineStatistics,
): void {
  if (!sessionId.trim()) return;
  enqueuePersist(async () => {
    const existing = await readJson<SessionTrackingPipelineStatistics | null>(
      SESSION_PIPELINE_STATS_KEY,
      null,
    );
    if (!existing || existing.sessionId !== sessionId) return;
    await writeJson(SESSION_PIPELINE_STATS_KEY, updater(existing));
  });
}

export function recordPipelineGapDiagnostic(
  sessionId: string,
  gap: ClassifyTrackingGapResult,
  previous: { lat: number; lng: number; capturedAt: string; appState?: string | null },
  current: { lat: number; lng: number; capturedAt: string; appState?: string | null },
  lastTaskEventType?: string | null,
): void {
  const eventType = gapEventType(gap.classification);
  const detail = {
    classification: gap.classification,
    reason: gap.reason,
    durationMs: gap.durationMs,
    displacementM: gap.displacementM,
    impliedAverageSpeedKmh: gap.impliedAverageSpeedKmh,
    previousAccuracyM: gap.previousAccuracyM,
    currentAccuracyM: gap.currentAccuracyM,
    combinedAccuracyM: gap.combinedAccuracyM,
    displacementQualityRatio: gap.displacementQualityRatio,
  };

  enqueuePersist(async () => {
    const [gapStats, gapTimeline] = await Promise.all([
      readJson<SessionTrackingGapStatistics | null>(SESSION_GAP_STATS_KEY, null),
      readJson<SessionTrackingGapTimeline | null>(SESSION_GAP_TIMELINE_KEY, null),
    ]);
    const baseGapStats = gapStats ?? createEmptyGapStatistics();
    const nextGapStats = applyGapToStatistics(baseGapStats, gap);
    const entry = buildGapTimelineEntry(gap, previous, current, lastTaskEventType);
    const timelineBase =
      gapTimeline && gapTimeline.sessionId === sessionId
        ? gapTimeline
        : createEmptyGapTimeline(sessionId);
    const nextTimeline: SessionTrackingGapTimeline = {
      sessionId,
      gaps: capGapTimeline([...timelineBase.gaps, entry]),
    };
    await Promise.all([
      writeJson(SESSION_GAP_STATS_KEY, nextGapStats),
      writeJson(SESSION_GAP_TIMELINE_KEY, nextTimeline),
    ]);
  });

  recordTrackingDiagnostic(eventType, detail, sessionId);
}

async function appendAppStateTransition(
  sessionId: string,
  from: string,
  to: string,
  timestamp: string,
): Promise<void> {
  const existing = await readJson<SessionAppStateTimeline | null>(
    SESSION_APP_STATE_TIMELINE_KEY,
    null,
  );
  const base =
    existing && existing.sessionId === sessionId
      ? existing
      : createEmptyAppStateTimeline(sessionId);
  const next: SessionAppStateTimeline = {
    sessionId,
    transitions: capAppStateTransitions([
      ...base.transitions,
      { from, to, timestamp },
    ]),
  };
  await writeJson(SESSION_APP_STATE_TIMELINE_KEY, next);
}

async function getSessionTaskLifecycleSummary(): Promise<SessionTaskLifecycleSummary | null> {
  const [pipeline, taskError] = await Promise.all([
    getSessionTrackingPipelineStatistics(),
    readJson<{ at: string | null; detail: string | null }>(
      SESSION_PIPELINE_TASK_ERROR_KEY,
      { at: null, detail: null },
    ),
  ]);
  if (!pipeline) return null;
  return buildTaskLifecycleSummary(pipeline, taskError.at, taskError.detail);
}

function motionWindowFromDetail(
  detail?: Record<string, unknown>,
): MotionWindowSummary | null {
  if (!detail) return null;
  const sampleCount = detail.sampleCount;
  if (typeof sampleCount !== 'number' || !Number.isFinite(sampleCount)) return null;
  return {
    sampleCount,
    validSampleCount:
      typeof detail.validSampleCount === 'number' ? detail.validSampleCount : 0,
    invalidSampleCount:
      typeof detail.invalidSampleCount === 'number' ? detail.invalidSampleCount : 0,
    meanMagnitudeG:
      typeof detail.meanMagnitudeG === 'number' ? detail.meanMagnitudeG : null,
    dynamicAccelMeanG:
      typeof detail.dynamicAccelMeanG === 'number' ? detail.dynamicAccelMeanG : null,
    dynamicAccelRmsG:
      typeof detail.dynamicAccelRmsG === 'number' ? detail.dynamicAccelRmsG : null,
    peakDynamicAccelG:
      typeof detail.peakDynamicAccelG === 'number' ? detail.peakDynamicAccelG : null,
    p95DynamicAccelG:
      typeof detail.p95DynamicAccelG === 'number' ? detail.p95DynamicAccelG : null,
    windowStartedAt:
      typeof detail.windowStartedAt === 'string' ? detail.windowStartedAt : '',
    windowEndedAt: typeof detail.windowEndedAt === 'string' ? detail.windowEndedAt : '',
    midpointTimestamp:
      typeof detail.midpointTimestamp === 'string' ? detail.midpointTimestamp : '',
  };
}

export function recordTrackingDiagnostic(
  type: string,
  detail?: Record<string, unknown>,
  sessionId?: string,
): void {
  const timestamp = nowIso();
  const event: TrackingDiagnosticEvent = {
    timestamp,
    type,
    sessionId,
    detail: detail && Object.keys(detail).length > 0 ? detail : undefined,
  };

  /** speed-stat-* / motion-stat-* solo stats; no saturan el ring buffer. */
  const appendToRingBuffer =
    !type.startsWith('speed-stat-') &&
    !type.startsWith('motion-stat-') &&
    !type.startsWith('tracking-stat-') &&
    type !== 'tracking-pipeline-session-start';

  enqueuePersist(async () => {
    const [events, stats, snapshot, sessionSpeed, sessionMotion, sessionPipeline, taskError] =
      await Promise.all([
      readJson<TrackingDiagnosticEvent[]>(EVENTS_KEY, []),
      readJson<Partial<TrackingStatistics>>(STATS_KEY, EMPTY_TRACKING_STATISTICS),
      readJson<TrackingSnapshot>(SNAPSHOT_KEY, {}),
      readJson<SessionSpeedStatistics | null>(SESSION_SPEED_STATS_KEY, null),
      readJson<SessionMotionStatistics | null>(SESSION_MOTION_STATS_KEY, null),
      readJson<SessionTrackingPipelineStatistics | null>(SESSION_PIPELINE_STATS_KEY, null),
      readJson<{ at: string | null; detail: string | null }>(SESSION_PIPELINE_TASK_ERROR_KEY, {
        at: null,
        detail: null,
      }),
    ]);

    const nextEvents = appendToRingBuffer ? [...events, event] : [...events];
    if (appendToRingBuffer) {
      while (nextEvents.length > MAX_EVENTS) {
        nextEvents.shift();
      }
    }

    const nextStats = applyEventToStats(type, normalizeStatistics(stats), detail);
    const nextSnapshot = applyEventToSnapshot(type, snapshot, timestamp, detail);

    let nextSessionSpeed = sessionSpeed;
    if (sessionId && sessionSpeed && sessionSpeed.sessionId === sessionId) {
      const statsType = normalizeSpeedStatsEventType(type);
      if (statsType != null) {
        const applied = applySpeedStatEventToCounters(statsType, sessionSpeed, detail);
        if (applied != null) {
          nextSessionSpeed = applied;
        }
      }
    }

    let nextSessionMotion = sessionMotion;
    if (
      sessionId &&
      sessionMotion &&
      sessionMotion.sessionId === sessionId &&
      type === 'motion-stat-window'
    ) {
      const window = motionWindowFromDetail(detail);
      if (window) {
        const applied = applyMotionWindowToSession(sessionMotion, window);
        nextSessionMotion = applied.stats;
      }
    }

    let nextSessionPipeline = sessionPipeline;
    if (sessionId && sessionPipeline && sessionPipeline.sessionId === sessionId) {
      const applied = applyPipelineEventToSession(type, sessionPipeline, timestamp, detail);
      if (applied != null) {
        nextSessionPipeline = applied;
      }
    }

    let nextTaskError = taskError;
    if (type === 'bg-task-error' && sessionId) {
      nextTaskError = {
        at: timestamp,
        detail: typeof detail?.error === 'string' ? detail.error : 'task_error',
      };
    }

    const writes: Promise<void>[] = [
      writeJson(EVENTS_KEY, nextEvents),
      writeJson(STATS_KEY, nextStats),
      writeJson(SNAPSHOT_KEY, nextSnapshot),
    ];
    if (nextSessionSpeed !== sessionSpeed && nextSessionSpeed != null) {
      writes.push(writeJson(SESSION_SPEED_STATS_KEY, nextSessionSpeed));
    }
    if (nextSessionMotion !== sessionMotion && nextSessionMotion != null) {
      writes.push(writeJson(SESSION_MOTION_STATS_KEY, nextSessionMotion));
    }
    if (nextSessionPipeline !== sessionPipeline && nextSessionPipeline != null) {
      writes.push(writeJson(SESSION_PIPELINE_STATS_KEY, nextSessionPipeline));
    }
    if (nextTaskError !== taskError) {
      writes.push(writeJson(SESSION_PIPELINE_TASK_ERROR_KEY, nextTaskError));
    }

    if (sessionId && (type === 'app-foreground' || type === 'app-background' || type === 'app-inactive')) {
      const from =
        typeof detail?.from === 'string'
          ? detail.from
          : type === 'app-foreground'
            ? 'background'
            : type === 'app-background'
              ? 'active'
              : 'unknown';
      const to = typeof detail?.appState === 'string' ? detail.appState : AppState.currentState;
      writes.push(appendAppStateTransition(sessionId, from, to, timestamp));
    }

    await Promise.all(writes);
  });
}

export async function getTrackingDiagnosticEvents(
  limit = MAX_EVENTS,
): Promise<TrackingDiagnosticEvent[]> {
  const events = await readJson<TrackingDiagnosticEvent[]>(EVENTS_KEY, []);
  return events.slice(-limit);
}

export async function getTrackingStatistics(): Promise<TrackingStatistics> {
  const raw = await readJson<Partial<TrackingStatistics>>(STATS_KEY, EMPTY_TRACKING_STATISTICS);
  return normalizeStatistics(raw);
}

export async function getTrackingSnapshot(): Promise<TrackingSnapshot> {
  return readJson<TrackingSnapshot>(SNAPSHOT_KEY, {});
}

export async function setSessionEndReason(reason: TrackingSessionEndReason): Promise<void> {
  await writeJson(END_REASON_KEY, reason);
  recordTrackingDiagnostic('session-end-reason', { endReason: reason });
}

export async function getSessionEndReason(): Promise<TrackingSessionEndReason | null> {
  const raw = await AsyncStorage.getItem(END_REASON_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrackingSessionEndReason;
  } catch {
    return raw.trim() ? (raw.trim() as TrackingSessionEndReason) : null;
  }
}

export async function runTrackingHealthCheck(
  options?: TrackingHealthCheckOptions,
): Promise<void> {
  const nowMs = Date.now();
  const timestamp = new Date(nowMs).toISOString();
  const snapshot = await getTrackingSnapshot();
  const sessionId = options?.sessionId;

  const fgStarted = options?.fgServiceStarted ?? snapshot.fgServiceStarted ?? false;
  const taskStarted = options?.taskManagerStarted ?? snapshot.taskManagerStarted ?? false;
  const hasLocalSession =
    options?.hasLocalSession ??
    Boolean((await trackingSessionStorage.getActive())?.sessionId?.trim());

  const nextSnapshot: TrackingSnapshot = {
    ...snapshot,
    lastHealthCheckAt: timestamp,
    fgServiceStarted: fgStarted,
    taskManagerStarted: taskStarted,
  };
  await writeJson(SNAPSHOT_KEY, nextSnapshot);

  recordTrackingDiagnostic(
    'tracking-health-snapshot',
    {
      fgServiceStarted: fgStarted,
      taskManagerStarted: taskStarted,
      hasLocalSession,
      appState: AppState.currentState,
    },
    sessionId,
  );

  const gpsGap = gapSecondsSince(snapshot.lastGpsAt, nowMs);
  const bufferGap = gapSecondsSince(snapshot.lastPointBufferedAt, nowMs);
  const batchGap = gapSecondsSince(snapshot.lastBatchSentAt, nowMs);
  const batchAcceptGap = gapSecondsSince(snapshot.lastBatchAcceptedAt, nowMs);

  if (hasLocalSession && gpsGap != null && gpsGap > STALE_THRESHOLD_MS / 1000) {
    recordTrackingDiagnostic(
      'tracking-stale',
      { reason: 'gps_gap', gapSeconds: gpsGap },
      sessionId,
    );
  }

  if (
    hasLocalSession &&
    bufferGap != null &&
    bufferGap > STALE_THRESHOLD_MS / 1000 &&
    gpsGap != null &&
    gpsGap <= STALE_THRESHOLD_MS / 1000
  ) {
    recordTrackingDiagnostic(
      'tracking-stale',
      { reason: 'buffer_gap', gapSeconds: bufferGap },
      sessionId,
    );
  }

  if (hasLocalSession && batchGap != null && batchGap > STALE_THRESHOLD_MS / 1000) {
    recordTrackingDiagnostic(
      'tracking-stale',
      { reason: 'batch_gap', gapSeconds: batchGap },
      sessionId,
    );
  }

  if (
    hasLocalSession &&
    batchAcceptGap != null &&
    batchAcceptGap > STALE_THRESHOLD_MS / 1000 &&
    batchGap != null &&
    batchGap <= STALE_THRESHOLD_MS / 1000
  ) {
    recordTrackingDiagnostic(
      'tracking-stale',
      { reason: 'batch_accept_gap', gapSeconds: batchAcceptGap },
      sessionId,
    );
  }

  if (hasLocalSession && !taskStarted && snapshot.taskManagerStarted === true) {
    recordTrackingDiagnostic(
      'bg-task-killed',
      { hasStartedLocationUpdatesAsync: false, fgServiceStarted: fgStarted },
      sessionId,
    );
    await writeJson(SNAPSHOT_KEY, { ...nextSnapshot, taskManagerStarted: false });
  }
}

export function gpsDetailFromPoint(point: {
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  speed_mps?: number | null;
  app_state?: string;
  battery_level?: number | null;
}): Record<string, unknown> {
  return {
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy_m ?? null,
    speed: point.speed_mps ?? null,
    battery: point.battery_level ?? null,
    appState: point.app_state ?? AppState.currentState,
  };
}

export async function buildTrackingDiagnosticExport(): Promise<TrackingDiagnosticExport> {
  const [
    events,
    statistics,
    snapshot,
    endReason,
    localSession,
    sessionSpeedStatistics,
    sessionMotionStatistics,
    sessionMotionTimeline,
    sessionMotionStateStatistics,
    motionStateTimeline,
    sessionTrackingPipelineStatistics,
    sessionTrackingGapStatistics,
    trackingGapTimeline,
    appStateTimeline,
    taskLifecycleSummary,
  ] = await Promise.all([
    getTrackingDiagnosticEvents(MAX_EVENTS),
    getTrackingStatistics(),
    getTrackingSnapshot(),
    getSessionEndReason(),
    trackingSessionStorage.getActive(),
    getSessionSpeedStatistics(),
    getSessionMotionStatistics(),
    getSessionMotionTimeline(),
    getSessionMotionStateStatistics(),
    getSessionMotionStateTimeline(),
    getSessionTrackingPipelineStatistics(),
    getSessionTrackingGapStatistics(),
    getSessionTrackingGapTimeline(),
    getSessionAppStateTimeline(),
    getSessionTaskLifecycleSummary(),
  ]);

  let batteryLevel: number | null = null;
  let lowPowerMode: boolean | null = null;
  try {
    const level = await Battery.getBatteryLevelAsync();
    batteryLevel = Number.isFinite(level) ? level : null;
    lowPowerMode = await Battery.isLowPowerModeEnabledAsync();
  } catch {
    batteryLevel = null;
    lowPowerMode = null;
  }

  const expoConfig = Constants.expoConfig;
  const version = expoConfig?.version ?? null;
  const buildNumber =
    expoConfig?.android?.versionCode ??
    expoConfig?.ios?.buildNumber ??
    Constants.nativeBuildVersion ??
    null;
  const gitCommit =
    typeof expoConfig?.extra?.gitCommit === 'string' ? expoConfig.extra.gitCommit : null;

  const sessionActive = Boolean(localSession?.sessionId);
  const fgStarted = snapshot.fgServiceStarted ?? false;
  const taskStarted = snapshot.taskManagerStarted ?? false;

  const fullAnalysis = analyzeTrackingDiagnostics({
    events,
    snapshot,
    statistics,
    sessionActive,
    fgServiceStarted: fgStarted,
    taskManagerStarted: taskStarted,
  });

  const analysis: TrackingDiagnosticExportAnalysis = {
    lastEvent: fullAnalysis.lastEvent?.type ?? null,
    lastEventAt: fullAnalysis.lastEvent?.timestamp ?? null,
    missingAfter: fullAnalysis.missingAfter,
    failedComponent: fullAnalysis.failedComponent,
    confidence: fullAnalysis.confidence,
    probableCause: fullAnalysis.probableCause,
    recommendation: fullAnalysis.recommendation,
    overallStatus: fullAnalysis.overallStatus,
  };

  return {
    exportedAt: nowIso(),
    device: {
      brand: Device.brand ?? null,
      manufacturer: Device.manufacturer ?? null,
      model: Device.modelName ?? null,
      android: Device.osVersion ?? null,
    },
    app: {
      version,
      buildNumber,
      gitCommit,
    },
    power: {
      batteryLevel,
      lowPowerMode,
      batteryOptimization: null,
    },
    runtime: {
      appState: AppState.currentState,
      fgServiceStarted: snapshot.fgServiceStarted ?? false,
      taskManagerStarted: snapshot.taskManagerStarted ?? false,
    },
    session: {
      id: localSession?.sessionId ?? null,
      localActive: Boolean(localSession?.sessionId),
      startedAt: localSession?.startedAt ?? null,
      endReason,
    },
    statistics,
    sessionSpeedStatistics,
    sessionMotionStatistics,
    sessionMotionTimeline,
    sessionMotionStateStatistics,
    motionStateTimeline,
    sessionTrackingPipelineStatistics,
    sessionTrackingGapStatistics,
    trackingGapTimeline,
    appStateTimeline,
    taskLifecycleSummary,
    snapshot,
    events,
    analysis,
  };
}

export { analyzeTrackingDiagnostics } from '@/utils/trackingDiagnosticAnalyzer';

export function formatDiagnosticGap(iso: string | undefined): string {
  const sec = gapSecondsSince(iso, Date.now());
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
