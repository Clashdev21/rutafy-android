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
