import type { SessionMotionStatistics } from './sessionMotionStatistics';
import type { SessionMotionTimeline } from './motionActivity';
import type { SessionSpeedStatistics } from './sessionSpeedStatistics';
import type {
  SessionAppStateTimeline,
  SessionTaskLifecycleSummary,
  SessionTrackingGapStatistics,
  SessionTrackingGapTimeline,
  SessionTrackingPipelineStatistics,
} from './sessionTrackingPipeline';

export type TrackingSessionEndReason =
  | 'user'
  | 'admin'
  | 'cleanup'
  | 'session_not_active'
  | 'timeout'
  | 'watchdog'
  | 'os_killed'
  | 'crash'
  | 'unknown';

export interface TrackingDiagnosticEvent {
  timestamp: string;
  type: string;
  sessionId?: string;
  detail?: Record<string, unknown>;
}

export interface TrackingStatistics {
  gpsFixes: number;
  pointsMapped: number;
  pointsBuffered: number;
  batchesCreated: number;
  batchesSent: number;
  batchesAccepted: number;
  httpErrors: number;
  http401: number;
  http403: number;
  http500: number;
  refreshCount: number;
  refreshFailures: number;
  backgroundRestarts: number;
  gpsErrors: number;
  taskStops: number;
  /** Speed 2A — telemetría observacional local */
  nativeSpeedSamples: number;
  derivedSpeedSamples: number;
  nativeSpeedUnavailable: number;
  derivedSpeedUnavailable: number;
  /** Rechazos matemáticos (deltaTime<=0, coords inválidas, etc.) — semántica 2A.1 */
  rejectedSpeedSamples: number;
  lastNativeSpeedKmh: number | null;
  lastDerivedSpeedKmh: number | null;
  maxNativeSpeedKmh: number | null;
  maxDerivedSpeedKmh: number | null;
  avgNativeAvailableSpeedKmh: number | null;
  avgDerivedAvailableSpeedKmh: number | null;
  /** Speed 2A.2 — quality gate / fix instrumentation */
  nativeZeroSamples: number;
  nativeZeroWhileMoving: number;
  nativeZeroWhileMovingRate: number | null;
  derivedGoodSamples: number;
  derivedWeakSamples: number;
  derivedRejectedSamples: number;
  poorAccuracySamples: number;
  longGapSpeedSamples: number;
  implausibleSpeedSamples: number;
  staleFixSamples: number;
  mockedFixes: number;
  lastDisplacementQualityRatio: number | null;
  lastCombinedAccuracyM: number | null;
  lastFixAgeMs: number | null;
  lastFixMocked: boolean | null;
  maxFixAgeMs: number | null;
  avgGoodDerivedSpeedKmh: number | null;
  maxGoodDerivedSpeedKmh: number | null;
}

export interface TrackingSnapshot {
  lastGpsAt?: string;
  lastPointBufferedAt?: string;
  lastBatchCreatedAt?: string;
  lastBatchSentAt?: string;
  lastBatchAcceptedAt?: string;
  lastRefreshAt?: string;
  lastHeartbeatAt?: string;
  lastTaskEventAt?: string;
  lastHealthCheckAt?: string;
  fgServiceStarted?: boolean;
  taskManagerStarted?: boolean;
}

export interface TrackingDiagnosticExport {
  exportedAt: string;
  device: {
    brand: string | null;
    manufacturer: string | null;
    model: string | null;
    android: number | string | null;
  };
  app: {
    version: string | null;
    buildNumber: string | number | null;
    gitCommit: string | null;
  };
  power: {
    batteryLevel: number | null;
    lowPowerMode: boolean | null;
    batteryOptimization: null;
  };
  runtime: {
    appState: string | null;
    fgServiceStarted: boolean;
    taskManagerStarted: boolean;
  };
  session: {
    id: string | null;
    localActive: boolean;
    startedAt: string | null;
    endReason: TrackingSessionEndReason | null;
  };
  statistics: TrackingStatistics;
  /** Speed 2A.2.1 — stats de la sesión activa o última cerrada (no lifetime). */
  sessionSpeedStatistics: SessionSpeedStatistics | null;
  /** Speed 2B.0 — motion FG-only, sesión activa o última cerrada. */
  sessionMotionStatistics: SessionMotionStatistics | null;
  /** Speed 2B.1 — timeline acotada (~30s buckets) de la misma sesión. */
  sessionMotionTimeline: SessionMotionTimeline | null;
  /** Reliability 3A — contadores session-scoped del pipeline de tracking. */
  sessionTrackingPipelineStatistics: SessionTrackingPipelineStatistics | null;
  /** Reliability 3A — agregados de gaps entre fixes válidos. */
  sessionTrackingGapStatistics: SessionTrackingGapStatistics | null;
  /** Reliability 3A — timeline acotada de gaps. */
  trackingGapTimeline: SessionTrackingGapTimeline | null;
  /** Reliability 3A — transiciones AppState durante la sesión. */
  appStateTimeline: SessionAppStateTimeline | null;
  /** Reliability 3A — resumen lifecycle del background task. */
  taskLifecycleSummary: SessionTaskLifecycleSummary | null;
  snapshot: TrackingSnapshot;
  events: TrackingDiagnosticEvent[];
  analysis: TrackingDiagnosticExportAnalysis;
}

export const EMPTY_TRACKING_STATISTICS: TrackingStatistics = {
  gpsFixes: 0,
  pointsMapped: 0,
  pointsBuffered: 0,
  batchesCreated: 0,
  batchesSent: 0,
  batchesAccepted: 0,
  httpErrors: 0,
  http401: 0,
  http403: 0,
  http500: 0,
  refreshCount: 0,
  refreshFailures: 0,
  backgroundRestarts: 0,
  gpsErrors: 0,
  taskStops: 0,
  nativeSpeedSamples: 0,
  derivedSpeedSamples: 0,
  nativeSpeedUnavailable: 0,
  derivedSpeedUnavailable: 0,
  rejectedSpeedSamples: 0,
  lastNativeSpeedKmh: null,
  lastDerivedSpeedKmh: null,
  maxNativeSpeedKmh: null,
  maxDerivedSpeedKmh: null,
  avgNativeAvailableSpeedKmh: null,
  avgDerivedAvailableSpeedKmh: null,
  nativeZeroSamples: 0,
  nativeZeroWhileMoving: 0,
  nativeZeroWhileMovingRate: null,
  derivedGoodSamples: 0,
  derivedWeakSamples: 0,
  derivedRejectedSamples: 0,
  poorAccuracySamples: 0,
  longGapSpeedSamples: 0,
  implausibleSpeedSamples: 0,
  staleFixSamples: 0,
  mockedFixes: 0,
  lastDisplacementQualityRatio: null,
  lastCombinedAccuracyM: null,
  lastFixAgeMs: null,
  lastFixMocked: null,
  maxFixAgeMs: null,
  avgGoodDerivedSpeedKmh: null,
  maxGoodDerivedSpeedKmh: null,
};

export type TrackingHealthCheckOptions = {
  sessionId?: string;
  fgServiceStarted?: boolean;
  taskManagerStarted?: boolean;
  hasLocalSession?: boolean;
};

export type DiagnosticIndicatorStatus = 'green' | 'red' | 'unknown';

export type OverallDiagnosticStatus = 'OPERANDO' | 'ATENCIÓN' | 'CRÍTICO';

export type FailedPipelineComponent =
  | 'GPS'
  | 'Mapper'
  | 'Buffer'
  | 'Batch'
  | 'HTTP'
  | 'Accepted'
  | 'Heartbeat'
  | 'TaskManager'
  | 'ForegroundService'
  | 'Storage'
  | 'Android OS';

export type DiagnosticConfidence = 'high' | 'medium' | 'low';

export interface PipelineStageStatus {
  stage: string;
  lastAt: string | null;
  lastEventType: string | null;
  ok: boolean;
  gapSeconds: number | null;
}

export interface TrackingDiagnosticAnalysis {
  overallStatus: OverallDiagnosticStatus;
  lastEvent: { type: string; timestamp: string } | null;
  missingAfter: string | null;
  failedComponent: FailedPipelineComponent | null;
  confidence: DiagnosticConfidence;
  probableCause: string;
  recommendation: string;
  pipelineSummary: PipelineStageStatus[];
  breakpointNarrative: string[];
  indicators: {
    gps: DiagnosticIndicatorStatus;
    foregroundService: DiagnosticIndicatorStatus;
    taskManager: DiagnosticIndicatorStatus;
    batch: DiagnosticIndicatorStatus;
    http: DiagnosticIndicatorStatus;
  };
  gaps: {
    gpsSeconds: number | null;
    bufferSeconds: number | null;
    batchSeconds: number | null;
    heartbeatSeconds: number | null;
    refreshSeconds: number | null;
  };
}

export interface TrackingDiagnosticExportAnalysis {
  lastEvent: string | null;
  lastEventAt: string | null;
  missingAfter: string | null;
  failedComponent: FailedPipelineComponent | null;
  confidence: DiagnosticConfidence;
  probableCause: string;
  recommendation: string;
  overallStatus: OverallDiagnosticStatus;
}
