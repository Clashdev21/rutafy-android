/**
 * Lógica pura session-scoped del pipeline de tracking (Reliability 3A).
 * Persistencia en trackingDiagnostics.ts.
 */

import type {
  SessionAppStateTimeline,
  SessionAppStateTransition,
  SessionTaskLifecycleSummary,
  SessionTrackingGap,
  SessionTrackingGapStatistics,
  SessionTrackingGapTimeline,
  SessionTrackingPipelineStatistics,
  TrackingGapClassification,
} from '@/types/sessionTrackingPipeline';
import {
  createEmptySessionTrackingPipelineStatistics,
  EMPTY_SESSION_TRACKING_GAP_STATISTICS,
} from '@/types/sessionTrackingPipeline';
import type { ClassifyTrackingGapResult } from '@/utils/trackingGapClassifier';
import { MAX_APP_STATE_TRANSITIONS, MAX_TRACKING_GAPS } from '@/utils/trackingGapThresholds';

export function shouldResetSessionPipelineBucket(
  existing: SessionTrackingPipelineStatistics | null,
  sessionId: string,
): boolean {
  if (!existing) return true;
  return existing.sessionId !== sessionId;
}

export function resolveSessionPipelineBucket(
  existing: SessionTrackingPipelineStatistics | null,
  sessionId: string,
  startedAt?: string,
): { stats: SessionTrackingPipelineStatistics; reset: boolean } {
  if (!shouldResetSessionPipelineBucket(existing, sessionId) && existing) {
    const defaults = createEmptySessionTrackingPipelineStatistics(
      existing.sessionId,
      existing.startedAt,
    );
    return {
      stats: { ...defaults, ...existing, endedAt: null },
      reset: false,
    };
  }
  return {
    stats: createEmptySessionTrackingPipelineStatistics(
      sessionId,
      startedAt ?? new Date().toISOString(),
    ),
    reset: true,
  };
}

export function markSessionPipelineEnded(
  stats: SessionTrackingPipelineStatistics,
  endedAt = new Date().toISOString(),
): SessionTrackingPipelineStatistics {
  return {
    ...stats,
    endedAt: stats.endedAt ?? endedAt,
  };
}

function bumpMaxGap(prev: number | null, next: number): number {
  if (prev == null) return next;
  return Math.max(prev, next);
}

function updateTimestampGap(
  stats: SessionTrackingPipelineStatistics,
  field: 'maxLocationCallbackGapMs' | 'maxValidFixGapMs' | 'maxAcceptedBatchGapMs',
  lastIso: string | null,
  nowIso: string,
): SessionTrackingPipelineStatistics {
  if (!lastIso) return stats;
  const lastMs = Date.parse(lastIso);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) return stats;
  const delta = Math.max(0, nowMs - lastMs);
  return {
    ...stats,
    [field]: bumpMaxGap(stats[field], delta),
  };
}

function gapEventType(classification: TrackingGapClassification): string {
  switch (classification) {
    case 'stationary':
      return 'tracking-stationary-gap';
    case 'movement_suspected':
      return 'tracking-moving-gap';
    default:
      return 'tracking-location-gap';
  }
}

export function applyGapToStatistics(
  gapStats: SessionTrackingGapStatistics,
  gap: ClassifyTrackingGapResult,
): SessionTrackingGapStatistics {
  const next = { ...gapStats };
  next.totalLocationGaps += 1;
  next.totalGapDurationMs += gap.durationMs;
  next.maxGapDurationMs = bumpMaxGap(next.maxGapDurationMs, gap.durationMs);

  switch (gap.classification) {
    case 'stationary':
      next.stationaryGapCount += 1;
      next.stationaryGapDurationMs += gap.durationMs;
      break;
    case 'movement_suspected':
      next.movementSuspectedGapCount += 1;
      next.movementSuspectedGapDurationMs += gap.durationMs;
      next.maxMovementSuspectedGapMs = bumpMaxGap(
        next.maxMovementSuspectedGapMs,
        gap.durationMs,
      );
      next.maxMovementSuspectedGapDistanceM = bumpMaxGap(
        next.maxMovementSuspectedGapDistanceM,
        gap.displacementM,
      );
      break;
    default:
      next.unknownGapCount += 1;
      next.unknownGapDurationMs += gap.durationMs;
      break;
  }
  return next;
}

export function buildGapTimelineEntry(
  gap: ClassifyTrackingGapResult,
  previous: { lat: number; lng: number; appState?: string | null; capturedAt: string },
  current: { lat: number; lng: number; appState?: string | null; capturedAt: string },
  lastTaskEventType?: string | null,
): SessionTrackingGap {
  return {
    startedAt: previous.capturedAt,
    endedAt: current.capturedAt,
    durationMs: gap.durationMs,
    previousLat: previous.lat,
    previousLng: previous.lng,
    currentLat: current.lat,
    currentLng: current.lng,
    previousAccuracyM: gap.previousAccuracyM,
    currentAccuracyM: gap.currentAccuracyM,
    displacementM: gap.displacementM,
    impliedAverageSpeedKmh: gap.impliedAverageSpeedKmh,
    classification: gap.classification,
    reason: gap.reason,
    previousAppState: previous.appState ?? null,
    currentAppState: current.appState ?? null,
    lastTaskEventType: lastTaskEventType ?? null,
  };
}

export function capGapTimeline(gaps: SessionTrackingGap[]): SessionTrackingGap[] {
  if (gaps.length <= MAX_TRACKING_GAPS) return gaps;
  return gaps.slice(-MAX_TRACKING_GAPS);
}

export function capAppStateTransitions(
  transitions: SessionAppStateTransition[],
): SessionAppStateTransition[] {
  if (transitions.length <= MAX_APP_STATE_TRANSITIONS) return transitions;
  return transitions.slice(-MAX_APP_STATE_TRANSITIONS);
}

export function buildTaskLifecycleSummary(
  stats: SessionTrackingPipelineStatistics,
  lastErrorAt: string | null,
  lastErrorDetail: string | null,
): SessionTaskLifecycleSummary {
  return {
    lastStartRequestAt: stats.lastTaskStartRequestAt,
    lastStartObservedAt: stats.lastTaskStartObservedAt,
    lastStopRequestAt: stats.lastTaskStopRequestAt,
    lastStopObservedAt: stats.lastTaskStopObservedAt,
    lastRestartAt: stats.taskRestarts > 0 ? stats.lastTaskStartObservedAt : null,
    lastErrorAt,
    lastErrorDetail,
  };
}

/**
 * Aplica un evento diagnóstico al bucket session-scoped del pipeline.
 * Retorna stats actualizados o null si el evento no aplica.
 */
export function applyPipelineEventToSession(
  type: string,
  stats: SessionTrackingPipelineStatistics,
  timestamp: string,
  detail?: Record<string, unknown>,
): SessionTrackingPipelineStatistics | null {
  let next = { ...stats };
  const pointCount =
    typeof detail?.pointCount === 'number' && Number.isFinite(detail.pointCount)
      ? detail.pointCount
      : 0;
  const accepted =
    typeof detail?.accepted === 'number' && Number.isFinite(detail.accepted)
      ? detail.accepted
      : 0;

  switch (type) {
    case 'tracking-location-callback': {
      next = updateTimestampGap(next, 'maxLocationCallbackGapMs', next.lastLocationCallbackAt, timestamp);
      next.locationCallbacks += 1;
      next.lastLocationCallbackAt = timestamp;
      const locationCount =
        typeof detail?.locationCount === 'number' && Number.isFinite(detail.locationCount)
          ? detail.locationCount
          : 0;
      if (locationCount > 1) {
        next.multiLocationCallbacks += 1;
        next.maxLocationsPerCallback = bumpMaxGap(
          next.maxLocationsPerCallback,
          locationCount,
        );
      } else if (locationCount === 1) {
        next.maxLocationsPerCallback = bumpMaxGap(next.maxLocationsPerCallback, 1);
      }
      const intraSpan =
        typeof detail?.intraCallbackCapturedAtSpanMs === 'number' &&
        Number.isFinite(detail.intraCallbackCapturedAtSpanMs)
          ? detail.intraCallbackCapturedAtSpanMs
          : null;
      if (intraSpan != null) {
        next.maxIntraCallbackCapturedAtSpanMs = bumpMaxGap(
          next.maxIntraCallbackCapturedAtSpanMs,
          intraSpan,
        );
      }
      break;
    }
    case 'gps-fix-received':
      next.locationFixesReceived += 1;
      next.lastFixReceivedAt = timestamp;
      break;
    case 'tracking-fix-invalid':
      next.locationFixesInvalid += 1;
      break;
    case 'tracking-fix-temporal-rejected': {
      next.locationFixesReceived += 1;
      next.locationFixesInvalid += 1;
      const temporalReason = detail?.reason;
      if (temporalReason === 'pre_session_fix') {
        next.preSessionFixRejected += 1;
        next.lastPreSessionFixRejectedAt = timestamp;
      } else if (temporalReason === 'future_fix') {
        next.futureFixRejected += 1;
        next.lastFutureFixRejectedAt = timestamp;
      } else if (
        temporalReason === 'invalid_timestamp' ||
        temporalReason === 'no_session_started_at'
      ) {
        next.invalidTimestampRejected += 1;
      }
      break;
    }
    case 'tracking-stat-early-tolerance':
      next.withinEarlyToleranceAccepted += 1;
      break;
    case 'point-mapped':
      next = updateTimestampGap(next, 'maxValidFixGapMs', next.lastValidFixAt, timestamp);
      next.locationFixesValid += 1;
      next.pointsMapped += 1;
      next.lastValidFixAt = timestamp;
      next.lastPointMappedAt = timestamp;
      break;
    case 'point-buffered':
      next.pointsBuffered += 1;
      next.lastPointBufferedAt = timestamp;
      break;
    case 'point-queued-background': {
      const queued = pointCount > 0 ? pointCount : 1;
      next.pointsQueuedBackground += queued;
      next.lastPointQueuedBackgroundAt = timestamp;
      const queueDepth =
        typeof detail?.queueDepth === 'number' && Number.isFinite(detail.queueDepth)
          ? detail.queueDepth
          : null;
      if (queueDepth != null) {
        next.maxPendingQueueDepth = bumpMaxGap(next.maxPendingQueueDepth, queueDepth);
      }
      break;
    }
    case 'tracking-batch-deferred': {
      next.callbacksWhileBatchInFlight += 1;
      if (pointCount > 0) next.pointsDeferredWhileInFlight += pointCount;
      break;
    }
    case 'batch-created':
      next.batchesCreated += 1;
      if (pointCount > 0) next.pointsDequeued += pointCount;
      next.lastBatchCreatedAt = timestamp;
      break;
    case 'batch-send':
      next.batchesSendAttempts += 1;
      if (pointCount > 0) next.pointsSendAttempted += pointCount;
      next.lastBatchSendAttemptAt = timestamp;
      break;
    case 'batch-success':
      // HTTP técnico OK — no incrementa batchesAccepted (evita doble conteo con batch-accepted).
      next.lastBatchSuccessAt = timestamp;
      break;
    case 'batch-accepted':
      // Confirmación semántica: un batch aceptado + puntos accepted del backend.
      next = updateTimestampGap(next, 'maxAcceptedBatchGapMs', next.lastBatchAcceptedAt, timestamp);
      next.batchesAccepted += 1;
      if (accepted > 0) next.pointsAcceptedByApi += accepted;
      next.lastBatchAcceptedAt = timestamp;
      break;
    case 'batch-error':
    case 'batch-timeout':
      next.batchesFailed += 1;
      next.networkErrors += 1;
      break;
    case 'batch-401':
      next.batchesFailed += 1;
      next.http401 += 1;
      break;
    case 'batch-403':
      next.batchesFailed += 1;
      next.http403 += 1;
      break;
    case 'batch-429':
      next.batchesFailed += 1;
      next.http429 += 1;
      break;
    case 'batch-500':
      next.batchesFailed += 1;
      next.http5xx += 1;
      break;
    case 'tracking-task-start-requested':
      next.taskStartRequests += 1;
      next.lastTaskStartRequestAt = timestamp;
      break;
    case 'tracking-task-stop-requested':
      next.taskStopRequests += 1;
      next.lastTaskStopRequestAt = timestamp;
      break;
    case 'bg-task-start':
      next.taskStartsObserved += 1;
      next.lastTaskStartObservedAt = timestamp;
      break;
    case 'bg-task-stop':
      next.taskStopsObserved += 1;
      next.lastTaskStopObservedAt = timestamp;
      break;
    case 'bg-task-restored':
      next.taskRestarts += 1;
      next.lastTaskStartObservedAt = timestamp;
      break;
    case 'bg-task-error':
      next.taskErrors += 1;
      break;
    case 'app-foreground':
      next.foregroundTransitions += 1;
      next.lastForegroundAt = timestamp;
      break;
    case 'app-background':
      next.backgroundTransitions += 1;
      next.lastBackgroundAt = timestamp;
      break;
    case 'tracking-pipeline-session-start':
    case 'finalization-drain-start':
    case 'finalization-drain-success':
    case 'finalization-drain-timeout':
    case 'finalization-pending-points':
      break;
    default:
      return null;
  }

  return next;
}

export function createEmptyGapTimeline(sessionId: string): SessionTrackingGapTimeline {
  return { sessionId, gaps: [] };
}

export function createEmptyAppStateTimeline(sessionId: string): SessionAppStateTimeline {
  return { sessionId, transitions: [] };
}

export function createEmptyGapStatistics(): SessionTrackingGapStatistics {
  return { ...EMPTY_SESSION_TRACKING_GAP_STATISTICS };
}

export { gapEventType };
