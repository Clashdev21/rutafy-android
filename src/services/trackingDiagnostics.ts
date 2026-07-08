import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState } from 'react-native';

import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
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
import { analyzeTrackingDiagnostics } from '@/utils/trackingDiagnosticAnalyzer';

const EVENTS_KEY = 'rutafy_tracking_diag_events';
const SNAPSHOT_KEY = 'rutafy_tracking_diag_snapshot';
const STATS_KEY = 'rutafy_tracking_diag_stats';
const END_REASON_KEY = 'rutafy_tracking_diag_end_reason';

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

function applyEventToStats(type: string, stats: TrackingStatistics): TrackingStatistics {
  const next = { ...stats };
  switch (type) {
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

function enqueuePersist(fn: () => Promise<void>): void {
  persistChain = persistChain.then(fn).catch(() => undefined);
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

  enqueuePersist(async () => {
    const [events, stats, snapshot] = await Promise.all([
      readJson<TrackingDiagnosticEvent[]>(EVENTS_KEY, []),
      readJson<TrackingStatistics>(STATS_KEY, { ...EMPTY_TRACKING_STATISTICS }),
      readJson<TrackingSnapshot>(SNAPSHOT_KEY, {}),
    ]);

    const nextEvents = [...events, event];
    while (nextEvents.length > MAX_EVENTS) {
      nextEvents.shift();
    }

    const nextStats = applyEventToStats(type, stats);
    const nextSnapshot = applyEventToSnapshot(type, snapshot, timestamp, detail);

    await Promise.all([
      writeJson(EVENTS_KEY, nextEvents),
      writeJson(STATS_KEY, nextStats),
      writeJson(SNAPSHOT_KEY, nextSnapshot),
    ]);
  });
}

export async function getTrackingDiagnosticEvents(
  limit = MAX_EVENTS,
): Promise<TrackingDiagnosticEvent[]> {
  const events = await readJson<TrackingDiagnosticEvent[]>(EVENTS_KEY, []);
  return events.slice(-limit);
}

export async function getTrackingStatistics(): Promise<TrackingStatistics> {
  return readJson<TrackingStatistics>(STATS_KEY, { ...EMPTY_TRACKING_STATISTICS });
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
  const [events, statistics, snapshot, endReason, localSession] = await Promise.all([
    getTrackingDiagnosticEvents(MAX_EVENTS),
    getTrackingStatistics(),
    getTrackingSnapshot(),
    getSessionEndReason(),
    trackingSessionStorage.getActive(),
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
