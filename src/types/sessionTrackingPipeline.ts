/**
 * Observabilidad session-scoped del pipeline de tracking (Reliability 3A).
 * Solo diagnóstico — no altera sampling, batching ni payloads al backend.
 */

export type TrackingGapClassification = 'stationary' | 'movement_suspected' | 'unknown';

export type SessionTrackingPipelineStatistics = {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;

  locationCallbacks: number;
  locationFixesReceived: number;
  locationFixesValid: number;
  locationFixesInvalid: number;

  pointsMapped: number;
  /** Solo canal foreground (buffer en memoria del hook). */
  pointsBuffered: number;
  /**
   * Canal background: puntos encolados en cola durable antes del POST.
   * No equivale a pointsBuffered (pipelines distintos).
   */
  pointsQueuedBackground: number;
  pointsDequeued: number;

  batchesCreated: number;
  batchesSendAttempts: number;
  batchesAccepted: number;
  batchesFailed: number;

  pointsSendAttempted: number;
  /** Aceptados según respuesta API del batch (no implica persistencia DB). */
  pointsAcceptedByApi: number;

  http401: number;
  http403: number;
  http429: number;
  http5xx: number;
  networkErrors: number;

  taskStartRequests: number;
  taskStopRequests: number;
  taskStartsObserved: number;
  taskStopsObserved: number;
  taskRestarts: number;
  taskErrors: number;

  foregroundTransitions: number;
  backgroundTransitions: number;

  preSessionFixRejected: number;
  futureFixRejected: number;
  invalidTimestampRejected: number;
  withinEarlyToleranceAccepted: number;

  lastPreSessionFixRejectedAt: string | null;
  lastFutureFixRejectedAt: string | null;

  lastLocationCallbackAt: string | null;
  lastFixReceivedAt: string | null;
  lastValidFixAt: string | null;
  lastPointMappedAt: string | null;
  lastPointBufferedAt: string | null;
  lastPointQueuedBackgroundAt: string | null;
  lastBatchCreatedAt: string | null;
  lastBatchSendAttemptAt: string | null;
  lastBatchAcceptedAt: string | null;
  lastBatchSuccessAt: string | null;
  lastTaskStartRequestAt: string | null;
  lastTaskStartObservedAt: string | null;
  lastTaskStopRequestAt: string | null;
  lastTaskStopObservedAt: string | null;
  lastForegroundAt: string | null;
  lastBackgroundAt: string | null;

  maxLocationCallbackGapMs: number | null;
  maxValidFixGapMs: number | null;
  maxAcceptedBatchGapMs: number | null;

  /** Callbacks con locationCount > 1 (Android acumuló fixes). */
  multiLocationCallbacks: number;
  maxLocationsPerCallback: number | null;
  /** Span de captured_at entre el fix más antiguo y el más reciente del mismo callback. */
  maxIntraCallbackCapturedAtSpanMs: number | null;

  /** Task recibió locations mientras un batch HTTP estaba en vuelo (puntos encolados, no descartados). */
  callbacksWhileBatchInFlight: number;
  pointsDeferredWhileInFlight: number;
  maxPendingQueueDepth: number | null;
};

export type SessionTrackingGapStatistics = {
  totalLocationGaps: number;
  stationaryGapCount: number;
  movementSuspectedGapCount: number;
  unknownGapCount: number;

  totalGapDurationMs: number;
  stationaryGapDurationMs: number;
  movementSuspectedGapDurationMs: number;
  unknownGapDurationMs: number;

  maxGapDurationMs: number | null;
  maxMovementSuspectedGapMs: number | null;
  maxMovementSuspectedGapDistanceM: number | null;
};

export type SessionTrackingGap = {
  startedAt: string;
  endedAt: string;
  durationMs: number;

  previousLat: number;
  previousLng: number;
  currentLat: number;
  currentLng: number;

  previousAccuracyM: number | null;
  currentAccuracyM: number | null;

  displacementM: number;
  impliedAverageSpeedKmh: number | null;

  classification: TrackingGapClassification;
  reason: string;

  previousAppState: string | null;
  currentAppState: string | null;
  lastTaskEventType: string | null;
};

export type SessionTrackingGapTimeline = {
  sessionId: string;
  gaps: SessionTrackingGap[];
};

export type SessionAppStateTransition = {
  from: string;
  to: string;
  timestamp: string;
};

export type SessionAppStateTimeline = {
  sessionId: string;
  transitions: SessionAppStateTransition[];
};

export type SessionTaskLifecycleSummary = {
  lastStartRequestAt: string | null;
  lastStartObservedAt: string | null;
  lastStopRequestAt: string | null;
  lastStopObservedAt: string | null;
  lastRestartAt: string | null;
  lastErrorAt: string | null;
  lastErrorDetail: string | null;
};

export const EMPTY_SESSION_TRACKING_GAP_STATISTICS: SessionTrackingGapStatistics = {
  totalLocationGaps: 0,
  stationaryGapCount: 0,
  movementSuspectedGapCount: 0,
  unknownGapCount: 0,
  totalGapDurationMs: 0,
  stationaryGapDurationMs: 0,
  movementSuspectedGapDurationMs: 0,
  unknownGapDurationMs: 0,
  maxGapDurationMs: null,
  maxMovementSuspectedGapMs: null,
  maxMovementSuspectedGapDistanceM: null,
};

export function createEmptySessionTrackingPipelineStatistics(
  sessionId: string,
  startedAt = new Date().toISOString(),
): SessionTrackingPipelineStatistics {
  return {
    sessionId,
    startedAt,
    endedAt: null,
    locationCallbacks: 0,
    locationFixesReceived: 0,
    locationFixesValid: 0,
    locationFixesInvalid: 0,
    pointsMapped: 0,
    pointsBuffered: 0,
    pointsQueuedBackground: 0,
    pointsDequeued: 0,
    batchesCreated: 0,
    batchesSendAttempts: 0,
    batchesAccepted: 0,
    batchesFailed: 0,
    pointsSendAttempted: 0,
    pointsAcceptedByApi: 0,
    http401: 0,
    http403: 0,
    http429: 0,
    http5xx: 0,
    networkErrors: 0,
    taskStartRequests: 0,
    taskStopRequests: 0,
    taskStartsObserved: 0,
    taskStopsObserved: 0,
    taskRestarts: 0,
    taskErrors: 0,
    foregroundTransitions: 0,
    backgroundTransitions: 0,
    preSessionFixRejected: 0,
    futureFixRejected: 0,
    invalidTimestampRejected: 0,
    withinEarlyToleranceAccepted: 0,
    lastPreSessionFixRejectedAt: null,
    lastFutureFixRejectedAt: null,
    lastLocationCallbackAt: null,
    lastFixReceivedAt: null,
    lastValidFixAt: null,
    lastPointMappedAt: null,
    lastPointBufferedAt: null,
    lastPointQueuedBackgroundAt: null,
    lastBatchCreatedAt: null,
    lastBatchSendAttemptAt: null,
    lastBatchAcceptedAt: null,
    lastBatchSuccessAt: null,
    lastTaskStartRequestAt: null,
    lastTaskStartObservedAt: null,
    lastTaskStopRequestAt: null,
    lastTaskStopObservedAt: null,
    lastForegroundAt: null,
    lastBackgroundAt: null,
    maxLocationCallbackGapMs: null,
    maxValidFixGapMs: null,
    maxAcceptedBatchGapMs: null,
    multiLocationCallbacks: 0,
    maxLocationsPerCallback: null,
    maxIntraCallbackCapturedAtSpanMs: null,
    callbacksWhileBatchInFlight: 0,
    pointsDeferredWhileInFlight: 0,
    maxPendingQueueDepth: null,
  };
}
