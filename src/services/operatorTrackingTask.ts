import { fetch as expoFetch } from 'expo/fetch';
import * as TaskManager from 'expo-task-manager';

import { TRACKING_SESSION_ENDPOINTS } from '@/api/endpoints';
import {
  getValidAccessToken,
  refreshAccessTokenWithOutcome,
} from '@/auth/accessTokenManager';
import { API_BASE_URL } from '@/config/env';
import {
  isOperatorTrackingStartedAsync,
  stopOperatorTrackingAsync,
} from '@/services/operatorTrackingService';
import {
  endSessionSpeedStatistics,
  gpsDetailFromPoint,
  recordTrackingDiagnostic,
  runTrackingHealthCheck,
} from '@/services/trackingDiagnostics';
import { stopMotionTelemetryForSession } from '@/services/motionTelemetryService';
import { operatorTrackingHealthStorage } from '@/storage/operatorTrackingHealthStorage';
import { operatorTrackingPendingQueue } from '@/storage/operatorTrackingPendingQueue';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingPointInput } from '@/types/tracking';
import { classifyOperatorBgBatchError } from '@/utils/operatorTrackingHealthAudit';
import {
  computeIntraCallbackCapturedAtSpanMs,
} from '@/utils/operatorTrackingPendingQueueLogic';
import {
  FINALIZATION_DRAIN_TIMEOUT_MS,
  type FinalizationDrainOutcome,
} from '@/utils/operatorTrackingFinalization';
import { locationsToTrackingPoints } from '@/utils/trackingPointMapper';
import { resetSpeedTelemetryPreviousFix } from '@/utils/speedTelemetryObserver';
import { buildTraceId } from '@/utils/traceId';

/** Task de ubicación en segundo plano para captura logística (separada del mensajero). */
export const OPERATOR_TRACKING_TASK_NAME = 'rutafy-operator-tracking';

const BG_POINT_METADATA = { source: 'android_background' as const };
/** Tamaño máximo por POST; la cola puede acumular más mientras hay batch en vuelo. */
const BG_BATCH_MAX_POINTS = 25;

/** Concurrencia HTTP (máx. 1 POST). Distinto de mutationChain de AsyncStorage. */
let batchInFlight = false;
/** END/CANCEL en curso: callbacks pueden encolar, pero el drain lo posee finalization. */
let finalizationActive = false;
let batchIdleResolvers: Array<() => void> = [];

type BatchLatencyBreakdown = {
  authLatencyMs: number;
  apiLatencyMs: number;
  totalLatencyMs: number;
  /** Compat: total (auth + API + overhead local). */
  latencyMs: number;
};

function shortSessionId(id: string): string {
  const compact = id.replace(/-/g, '');
  return compact.length > 8 ? compact.slice(0, 8) : compact;
}

function notifyBatchIdle(): void {
  const waiters = batchIdleResolvers;
  batchIdleResolvers = [];
  for (const resolve of waiters) resolve();
}

function waitForBatchIdle(timeoutMs: number): Promise<'idle' | 'timeout'> {
  if (!batchInFlight) return Promise.resolve('idle');
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve('timeout');
    }, Math.max(0, timeoutMs));
    batchIdleResolvers.push(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve('idle');
    });
  });
}

export function beginOperatorSessionFinalization(): void {
  finalizationActive = true;
}

export function endOperatorSessionFinalization(): void {
  finalizationActive = false;
}

export function isOperatorBatchInFlight(): boolean {
  return batchInFlight;
}

export function isOperatorFinalizationActive(): boolean {
  return finalizationActive;
}

async function recordTaskDrop(reason: string): Promise<void> {
  console.log('[operator-bg-task-drop]', { reason });
  await operatorTrackingHealthStorage.recordDrop(reason);
}

function isSessionNotActiveResponse(
  status: number,
  parsed: Record<string, unknown> | null,
  detail: string,
): boolean {
  if (status !== 409) return false;
  const token = [
    parsed?.error,
    parsed?.code,
    parsed?.message,
    detail,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
  return token.includes('session_not_active');
}

function recordBatchHttpError(
  status: number,
  sessionId: string,
  detail: Record<string, unknown>,
): void {
  if (status === 401) {
    recordTrackingDiagnostic('batch-401', detail, sessionId);
  } else if (status === 403) {
    recordTrackingDiagnostic('batch-403', detail, sessionId);
  } else if (status >= 500) {
    recordTrackingDiagnostic('batch-500', detail, sessionId);
  }
  recordTrackingDiagnostic('batch-error', detail, sessionId);
}

async function cleanupClosedSessionLocally(reason: string): Promise<void> {
  if (__DEV__) {
    console.log('[tracking-cleanup-local]', { reason });
  }
  await stopOperatorTrackingAsync();
  await stopMotionTelemetryForSession(reason);
  await endSessionSpeedStatistics();
  resetSpeedTelemetryPreviousFix();
  const stored = await trackingSessionStorage.getActive();
  if (stored?.sessionId) {
    await operatorTrackingPendingQueue.clear(stored.sessionId);
  } else {
    await operatorTrackingPendingQueue.clear();
  }
  await trackingSessionStorage.clearActive();
}

async function executeBatchPost(
  sessionId: string,
  points: TrackingPointInput[],
  token: string,
  apiStartedAt: number,
): Promise<
  | { ok: true; accepted: number; apiLatencyMs: number; status: number }
  | {
      ok: false;
      status: number;
      detail: string;
      apiLatencyMs: number;
      parsed: Record<string, unknown> | null;
    }
> {
  const path = TRACKING_SESSION_ENDPOINTS.pointsBatch(sessionId);
  let response: Response;
  try {
    response = await expoFetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-trace-id': buildTraceId('operator-bg-batch'),
      },
      body: JSON.stringify({ points }),
    });
  } catch (e) {
    const apiLatencyMs = Date.now() - apiStartedAt;
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes('timeout');
    recordTrackingDiagnostic(
      isTimeout ? 'batch-timeout' : 'batch-error',
      {
        channel: 'background',
        apiLatencyMs,
        latencyMs: apiLatencyMs,
        error: msg,
      },
      sessionId,
    );
    throw e;
  }

  const text = await response.text();
  const measuredApiLatencyMs = Date.now() - apiStartedAt;
  let parsed: Record<string, unknown> | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const detail =
      typeof parsed?.error === 'string'
        ? parsed.error
        : typeof parsed?.message === 'string'
          ? parsed.message
          : `HTTP ${response.status}`;
    return {
      ok: false,
      status: response.status,
      detail,
      apiLatencyMs: measuredApiLatencyMs,
      parsed,
    };
  }

  const accepted =
    typeof parsed?.accepted === 'number'
      ? parsed.accepted
      : typeof parsed?.accepted_count === 'number'
        ? parsed.accepted_count
        : points.length;

  return { ok: true, accepted, apiLatencyMs: measuredApiLatencyMs, status: response.status };
}

function buildLatencyDetail(
  breakdown: BatchLatencyBreakdown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    authLatencyMs: breakdown.authLatencyMs,
    apiLatencyMs: breakdown.apiLatencyMs,
    totalLatencyMs: breakdown.totalLatencyMs,
    latencyMs: breakdown.latencyMs,
  };
}

function recordBatchSuccess(
  sessionId: string,
  points: TrackingPointInput[],
  status: number,
  accepted: number,
  breakdown: BatchLatencyBreakdown,
): void {
  recordTrackingDiagnostic(
    'batch-success',
    buildLatencyDetail(breakdown, {
      channel: 'background',
      status,
      pointCount: points.length,
    }),
    sessionId,
  );
  recordTrackingDiagnostic(
    'batch-accepted',
    buildLatencyDetail(breakdown, {
      channel: 'background',
      accepted,
    }),
    sessionId,
  );
}

async function postPointsBatch(sessionId: string, points: TrackingPointInput[]): Promise<number> {
  const totalStartedAt = Date.now();
  let authLatencyMs = 0;
  let apiLatencyMs = 0;

  recordTrackingDiagnostic(
    'batch-created',
    { pointCount: points.length, channel: 'background' },
    sessionId,
  );

  const authStartedAt = Date.now();
  let token = await getValidAccessToken({ source: 'operator_tracking_bg' });
  authLatencyMs += Date.now() - authStartedAt;

  if (!token) {
    const totalLatencyMs = Date.now() - totalStartedAt;
    recordBatchHttpError(401, sessionId, {
      channel: 'background',
      authLatencyMs,
      apiLatencyMs: 0,
      totalLatencyMs,
      latencyMs: totalLatencyMs,
      reason: 'no_valid_access_token',
    });
    throw new Error('401');
  }

  recordTrackingDiagnostic(
    'batch-send',
    { pointCount: points.length, channel: 'background' },
    sessionId,
  );

  let apiStartedAt = Date.now();
  let result = await executeBatchPost(sessionId, points, token, apiStartedAt);
  apiLatencyMs += result.apiLatencyMs;

  if (!result.ok && result.status === 401) {
    const totalSoFar = Date.now() - totalStartedAt;
    recordBatchHttpError(401, sessionId, {
      channel: 'background',
      status: 401,
      authLatencyMs,
      apiLatencyMs,
      totalLatencyMs: totalSoFar,
      latencyMs: totalSoFar,
      pointCount: points.length,
      error: result.detail,
      retry: true,
    });

    const refreshStartedAt = Date.now();
    const refreshOutcome = await refreshAccessTokenWithOutcome({
      source: 'operator_tracking_bg_401',
    });
    authLatencyMs += Date.now() - refreshStartedAt;

    if (refreshOutcome.status === 'success') {
      token = refreshOutcome.token;
      recordTrackingDiagnostic(
        'batch-send',
        { pointCount: points.length, channel: 'background', retryAfter401: true },
        sessionId,
      );
      apiStartedAt = Date.now();
      result = await executeBatchPost(sessionId, points, token, apiStartedAt);
      apiLatencyMs += result.apiLatencyMs;
    } else if (refreshOutcome.status === 'auth_invalid') {
      recordTrackingDiagnostic(
        'refresh-failed',
        { source: 'operator_tracking_bg_401', reason: 'auth_invalid' },
        sessionId,
      );
    }
  }

  if (!result.ok) {
    if (isSessionNotActiveResponse(result.status, result.parsed, result.detail)) {
      throw new Error('session_not_active');
    }
    if (result.status !== 401) {
      const totalLatencyMs = Date.now() - totalStartedAt;
      recordBatchHttpError(result.status, sessionId, {
        channel: 'background',
        status: result.status,
        authLatencyMs,
        apiLatencyMs,
        totalLatencyMs,
        latencyMs: totalLatencyMs,
        pointCount: points.length,
        error: result.detail,
      });
    }
    throw new Error(String(result.status) === '401' ? '401' : result.detail);
  }

  const totalLatencyMs = Date.now() - totalStartedAt;
  const breakdown: BatchLatencyBreakdown = {
    authLatencyMs,
    apiLatencyMs,
    totalLatencyMs,
    latencyMs: totalLatencyMs,
  };
  recordBatchSuccess(sessionId, points, result.status, result.accepted, breakdown);
  return result.accepted;
}

/**
 * Encola puntos y drena la cola con como máximo un POST en vuelo.
 * Si ya hay batch en vuelo, conserva puntos y retorna (sin descartar).
 * Durante finalizationActive: encola pero no inicia drain (lo posee END).
 */
async function enqueueAndFlushBackgroundPoints(
  sessionId: string,
  points: TrackingPointInput[],
  options?: { deferredBecauseInFlight?: boolean; forceFlush?: boolean },
): Promise<{ stoppedForError: boolean; sessionNotActive: boolean }> {
  if (points.length > 0) {
    const enqueueResult = await operatorTrackingPendingQueue.enqueue(sessionId, points);
    if (enqueueResult.added > 0) {
      recordTrackingDiagnostic(
        'point-queued-background',
        {
          channel: 'background',
          pointCount: enqueueResult.added,
          queueDepth: enqueueResult.queueDepth,
          duplicatesSkipped: enqueueResult.duplicatesSkipped,
          overflowDropped: enqueueResult.overflowDropped,
        },
        sessionId,
      );
    }
    if (enqueueResult.overflowDropped > 0) {
      recordTrackingDiagnostic(
        'tracking-pending-overflow',
        {
          channel: 'background',
          overflowDropped: enqueueResult.overflowDropped,
          queueDepth: enqueueResult.queueDepth,
        },
        sessionId,
      );
    }
  }

  if (finalizationActive && !options?.forceFlush) {
    if (points.length > 0) {
      recordTrackingDiagnostic(
        'finalization-pending-points',
        {
          channel: 'background',
          pointCount: points.length,
          reason: 'held_for_finalization_drain',
        },
        sessionId,
      );
    }
    return { stoppedForError: false, sessionNotActive: false };
  }

  if (options?.deferredBecauseInFlight || batchInFlight) {
    if (points.length > 0 || options?.deferredBecauseInFlight) {
      recordTrackingDiagnostic(
        'tracking-batch-deferred',
        {
          channel: 'background',
          pointCount: points.length,
          reason: 'batch_in_flight',
        },
        sessionId,
      );
      await operatorTrackingHealthStorage.recordDrop('deferred_in_flight');
    }
    return { stoppedForError: false, sessionNotActive: false };
  }

  batchInFlight = true;
  let stoppedForError = false;
  let sessionNotActive = false;
  try {
    while (true) {
      const batch = await operatorTrackingPendingQueue.dequeueBatch(
        sessionId,
        BG_BATCH_MAX_POINTS,
      );
      if (batch.length === 0) break;

      try {
        if (__DEV__) {
          console.log('[operator-bg-batch]', {
            sessionId: shortSessionId(sessionId),
            count: batch.length,
          });
        }
        const accepted = await postPointsBatch(sessionId, batch);
        await operatorTrackingHealthStorage.recordBatchOk();
        console.log('[operator-bg-batch-ok]', { accepted });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await operatorTrackingPendingQueue.requeueFront(sessionId, batch);
        if (message.includes('session_not_active')) {
          sessionNotActive = true;
          stoppedForError = true;
          await cleanupClosedSessionLocally('session_not_active_bg');
          break;
        }
        const errorCode = classifyOperatorBgBatchError(e);
        console.warn('[operator-bg-batch-error]', { errorCode, detail: e });
        await operatorTrackingHealthStorage.recordBatchError(errorCode);
        stoppedForError = true;
        break;
      }
    }
  } finally {
    batchInFlight = false;
    notifyBatchIdle();
  }

  if (!stoppedForError && !finalizationActive) {
    const stillPending = await operatorTrackingPendingQueue.depth(sessionId);
    if (stillPending > 0 && !batchInFlight) {
      await enqueueAndFlushBackgroundPoints(sessionId, [], { forceFlush: true });
    }
  }

  return { stoppedForError, sessionNotActive };
}

/**
 * Drena la cola durable antes de end remoto.
 * Espera POST in-flight de forma acotada; no hace clear; no cierra sesión.
 */
export async function drainOperatorPendingForSessionEnd(
  sessionId: string,
  timeoutMs: number = FINALIZATION_DRAIN_TIMEOUT_MS,
): Promise<FinalizationDrainOutcome> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;

  recordTrackingDiagnostic(
    'finalization-drain-start',
    { channel: 'background', timeoutMs },
    sessionId,
  );

  const idleWait = Math.max(0, deadline - Date.now());
  const idleResult = await waitForBatchIdle(idleWait);
  if (idleResult === 'timeout' && batchInFlight) {
    const pendingRemaining = await operatorTrackingPendingQueue.depth(sessionId);
    const outcome: FinalizationDrainOutcome = {
      status: 'timeout',
      pendingRemaining,
      elapsedMs: Date.now() - startedAt,
    };
    recordTrackingDiagnostic(
      'finalization-drain-timeout',
      {
        channel: 'background',
        reason: 'batch_in_flight',
        pendingRemaining,
        elapsedMs: outcome.elapsedMs,
      },
      sessionId,
    );
    return outcome;
  }

  while (Date.now() < deadline) {
    const pending = await operatorTrackingPendingQueue.depth(sessionId);
    if (pending === 0) {
      const outcome: FinalizationDrainOutcome = {
        status: 'drained',
        pendingRemaining: 0,
        elapsedMs: Date.now() - startedAt,
      };
      recordTrackingDiagnostic(
        'finalization-drain-success',
        { channel: 'background', elapsedMs: outcome.elapsedMs },
        sessionId,
      );
      return outcome;
    }

    const { stoppedForError, sessionNotActive } = await enqueueAndFlushBackgroundPoints(
      sessionId,
      [],
      { forceFlush: true },
    );

    if (sessionNotActive) {
      const pendingRemaining = await operatorTrackingPendingQueue.depth(sessionId);
      return {
        status: 'session_not_active',
        pendingRemaining,
        elapsedMs: Date.now() - startedAt,
      };
    }

    if (stoppedForError) {
      const pendingRemaining = await operatorTrackingPendingQueue.depth(sessionId);
      const outcome: FinalizationDrainOutcome = {
        status: 'network_error',
        pendingRemaining,
        elapsedMs: Date.now() - startedAt,
      };
      recordTrackingDiagnostic(
        'finalization-drain-timeout',
        {
          channel: 'background',
          reason: 'network_error',
          pendingRemaining,
          elapsedMs: outcome.elapsedMs,
        },
        sessionId,
      );
      return outcome;
    }
  }

  const pendingRemaining = await operatorTrackingPendingQueue.depth(sessionId);
  if (pendingRemaining === 0) {
    const outcome: FinalizationDrainOutcome = {
      status: 'drained',
      pendingRemaining: 0,
      elapsedMs: Date.now() - startedAt,
    };
    recordTrackingDiagnostic(
      'finalization-drain-success',
      { channel: 'background', elapsedMs: outcome.elapsedMs },
      sessionId,
    );
    return outcome;
  }

  const outcome: FinalizationDrainOutcome = {
    status: 'timeout',
    pendingRemaining,
    elapsedMs: Date.now() - startedAt,
  };
  recordTrackingDiagnostic(
    'finalization-drain-timeout',
    {
      channel: 'background',
      reason: 'deadline',
      pendingRemaining,
      elapsedMs: outcome.elapsedMs,
    },
    sessionId,
  );
  recordTrackingDiagnostic(
    'finalization-pending-points',
    { channel: 'background', pendingRemaining, preserved: true },
    sessionId,
  );
  return outcome;
}

if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
  TaskManager.defineTask(OPERATOR_TRACKING_TASK_NAME, async ({ data, error }) => {
    const stored = await trackingSessionStorage.getActive();
    const sessionId = stored?.sessionId?.trim() || undefined;
    const taskStarted = await isOperatorTrackingStartedAsync();
    await runTrackingHealthCheck({
      sessionId,
      fgServiceStarted: taskStarted,
      taskManagerStarted: taskStarted,
      hasLocalSession: Boolean(sessionId),
    });

    if (error) {
      const errorCode = classifyOperatorBgBatchError(error);
      console.warn('[operator-bg-batch-error]', error);
      recordTrackingDiagnostic(
        'gps-location-error',
        { channel: 'background', errorCode, detail: String(error) },
        sessionId,
      );
      await operatorTrackingHealthStorage.recordBatchError(errorCode);
      return;
    }

    if (!sessionId) {
      await recordTaskDrop('no_session');
      return;
    }

    const payload = data as { locations?: unknown } | undefined;
    const rawLocationCount = Array.isArray(payload?.locations) ? payload.locations.length : 0;

    const points = locationsToTrackingPoints(
      payload?.locations,
      'background',
      BG_POINT_METADATA,
    );

    const intraCallbackCapturedAtSpanMs = computeIntraCallbackCapturedAtSpanMs(points);

    recordTrackingDiagnostic(
      'tracking-location-callback',
      {
        channel: 'background',
        locationCount: rawLocationCount,
        mappedPointCount: points.length,
        intraCallbackCapturedAtSpanMs,
        batchInFlight,
        finalizationActive,
      },
      sessionId,
    );

    if (points.length === 0) {
      recordTrackingDiagnostic(
        'gps-location-timeout',
        { channel: 'background', reason: 'empty_points' },
        sessionId,
      );
      await recordTaskDrop('empty_points');
      return;
    }

    for (const point of points) {
      recordTrackingDiagnostic('gps-fix-received', gpsDetailFromPoint(point), sessionId);
    }

    const lastCapturedAt = points[points.length - 1]?.captured_at ?? null;
    await operatorTrackingHealthStorage.recordEvent();
    console.log('[operator-bg-event]', {
      sessionId: shortSessionId(sessionId),
      count: points.length,
      at: lastCapturedAt,
      locationCount: rawLocationCount,
      batchInFlight,
      finalizationActive,
    });

    if (__DEV__) {
      for (const point of points) {
        console.log('[operator-bg-point-quality]', {
          accuracy_m: point.accuracy_m,
          speed_mps: point.speed_mps,
          heading: point.heading,
        });
      }
    }

    const wasInFlight = batchInFlight;
    await enqueueAndFlushBackgroundPoints(sessionId, points, {
      deferredBecauseInFlight: wasInFlight,
    });
  });

  if (__DEV__) {
    console.log('[operator-bg-task-defined]', OPERATOR_TRACKING_TASK_NAME);
  }
}
