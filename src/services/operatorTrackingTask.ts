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
  buildOperatorTrackingRequestHeaders,
  getOrCreateInstallationId,
} from '@/utils/operatorInstallation';
import { mensajeroResumeSingleFlight } from '@/utils/mensajeroStartFlow';
import {
  classifyTrackingConflictFromResponse,
  decideOperatorBatchCatchAction,
} from '@/utils/trackingSessionErrors';
import {
  computeIntraCallbackCapturedAtSpanMs,
} from '@/utils/operatorTrackingPendingQueueLogic';
import {
  FINALIZATION_DRAIN_TIMEOUT_MS,
  type FinalizationDrainOutcome,
} from '@/utils/operatorTrackingFinalization';
import {
  recordOperatorBackgroundEmptyCallback,
} from '@/utils/operatorIngestionObservability';
import {
  clearOperatorIngestion,
  ingestOperatorLocations,
} from '@/utils/operatorIngestionCoordinator';
import { setOperatorBackgroundOwnership } from '@/utils/operatorIngestionOwnership';
import { resetSpeedTelemetryPreviousFix } from '@/utils/speedTelemetryObserver';
import { buildTraceId } from '@/utils/traceId';

/** Task de ubicación en segundo plano para captura logística (separada del mensajero). */
export const OPERATOR_TRACKING_TASK_NAME = 'rutafy-operator-tracking';

/**
 * Timeout HTTP de un POST background. Distinto de FINALIZATION_DRAIN_TIMEOUT_MS:
 * este acota el fetch; el drain acota la espera de cierre.
 *
 * 20s: por encima del axios FG (15s) para redes BG más lentas; por debajo
 * del drain (25s) para que un hang aborte y libere batchInFlight antes del
 * deadline de finalization. No hay evidencia de latencias normales >20s.
 */
export const OPERATOR_BATCH_HTTP_TIMEOUT_MS = 20_000;

const BG_POINT_METADATA = { source: 'android_background' as const };
/** Tamaño máximo por POST; la cola puede acumular más mientras hay batch en vuelo. */
const BG_BATCH_MAX_POINTS = 25;

let operatorBatchHttpTimeoutMs = OPERATOR_BATCH_HTTP_TIMEOUT_MS;

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

export class OperatorBatchHttpTimeoutError extends Error {
  readonly name = 'OperatorBatchHttpTimeoutError';
  readonly reason = 'http_timeout' as const;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`operator_batch_http_timeout:${timeoutMs}`);
    this.timeoutMs = timeoutMs;
  }
}

export function __setOperatorBatchHttpTimeoutMsForTests(ms: number | null): void {
  operatorBatchHttpTimeoutMs = ms == null ? OPERATOR_BATCH_HTTP_TIMEOUT_MS : ms;
}

export function __resetOperatorBatchRuntimeForTests(): void {
  batchInFlight = false;
  finalizationActive = false;
  batchIdleResolvers = [];
}

function classifyOperatorBatchFetchFailure(
  error: unknown,
  signal: AbortSignal,
): 'http_timeout' | 'aborted' | 'network_error' {
  if (signal.aborted || error instanceof OperatorBatchHttpTimeoutError) {
    return 'http_timeout';
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return 'aborted';
    }
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'http_timeout';
    }
    if (msg.includes('aborted') || msg.includes('abort')) {
      return 'aborted';
    }
  }
  return 'network_error';
}

async function recordTaskDrop(reason: string): Promise<void> {
  console.log('[operator-bg-task-drop]', { reason });
  await operatorTrackingHealthStorage.recordDrop(reason);
}

async function claimWriterFromBackground(sessionId: string): Promise<void> {
  const flight = await mensajeroResumeSingleFlight.run(async () => {
    const token = await getValidAccessToken({ source: 'operator_tracking_bg_resume' });
    if (!token) {
      throw new Error('401');
    }
    const installationId = await getOrCreateInstallationId();
    const path = TRACKING_SESSION_ENDPOINTS.resume(sessionId);
    const response = await expoFetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: buildOperatorTrackingRequestHeaders({
        accessToken: token,
        installationId,
        traceId: buildTraceId('operator-bg-resume'),
      }),
      body: '{}',
    });
    const text = await response.text();
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
      const code = classifyTrackingConflictFromResponse(response.status, parsed, detail);
      if (code === 'writer_conflict') {
        throw new Error('writer_conflict');
      }
      throw new Error(detail);
    }
    recordTrackingDiagnostic('tracking-resume', { channel: 'background' }, sessionId);
  });

  if (flight.status === 'skipped') return;
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
  clearOperatorIngestion();
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
  const installationId = await getOrCreateInstallationId();
  const controller = new AbortController();
  const timeoutMs = operatorBatchHttpTimeoutMs;
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await expoFetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: buildOperatorTrackingRequestHeaders({
        accessToken: token,
        installationId,
        traceId: buildTraceId('operator-bg-batch'),
      }),
      body: JSON.stringify({ points }),
      signal: controller.signal,
    });
  } catch (e) {
    const apiLatencyMs = Date.now() - apiStartedAt;
    const kind = classifyOperatorBatchFetchFailure(e, controller.signal);
    if (kind === 'http_timeout') {
      recordTrackingDiagnostic(
        'batch-timeout',
        {
          channel: 'background',
          reason: 'http_timeout',
          timeoutMs,
          apiLatencyMs,
          latencyMs: apiLatencyMs,
        },
        sessionId,
      );
      throw new OperatorBatchHttpTimeoutError(timeoutMs);
    }
    const msg = e instanceof Error ? e.message : String(e);
    recordTrackingDiagnostic(
      kind === 'aborted' ? 'batch-timeout' : 'batch-error',
      {
        channel: 'background',
        ...(kind === 'aborted' ? { reason: 'aborted' } : {}),
        apiLatencyMs,
        latencyMs: apiLatencyMs,
        error: msg,
      },
      sessionId,
    );
    throw e;
  } finally {
    clearTimeout(timeoutId);
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
    const conflict = classifyTrackingConflictFromResponse(
      result.status,
      result.parsed,
      result.detail,
    );
    if (conflict === 'session_not_active') {
      throw new Error('session_not_active');
    }
    if (conflict === 'writer_conflict') {
      throw new Error('writer_conflict');
    }
    if (conflict === 'writer_unclaimed') {
      throw new Error('writer_unclaimed');
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
export async function enqueueAndFlushBackgroundPoints(
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
        const action = decideOperatorBatchCatchAction(e);
        if (action.requeue) {
          await operatorTrackingPendingQueue.requeueFront(sessionId, batch);
        }
        if (action.type === 'cleanup') {
          if (action.reason === 'session_not_active') {
            sessionNotActive = true;
          }
          stoppedForError = true;
          recordTrackingDiagnostic(
            action.reason === 'writer_conflict' ? 'writer-conflict' : 'tracking-cleanup',
            { channel: 'background', reason: action.reason, requeued: false },
            sessionId,
          );
          await cleanupClosedSessionLocally(
            action.reason === 'writer_conflict' ? 'writer_conflict_bg' : 'session_not_active_bg',
          );
          break;
        }
        if (action.type === 'resume_writer') {
          stoppedForError = true;
          recordTrackingDiagnostic(
            'writer-unclaimed',
            { channel: 'background', requeued: false },
            sessionId,
          );
          try {
            await claimWriterFromBackground(sessionId);
          } catch (resumeError) {
            const resumeAction = decideOperatorBatchCatchAction(resumeError);
            if (resumeAction.type === 'cleanup' && resumeAction.reason === 'writer_conflict') {
              recordTrackingDiagnostic(
                'writer-conflict',
                { channel: 'background', source: 'resume_after_unclaimed' },
                sessionId,
              );
              await cleanupClosedSessionLocally('writer_conflict_bg');
            }
          }
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
    // Ownership confirmado en un evento de lifecycle/health ya existente:
    // no se consulta el TaskManager por cada punto.
    setOperatorBackgroundOwnership(taskStarted);
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

    const startedAtMs = stored?.startedAt ? Date.parse(stored.startedAt) : null;
    // Fase A: orden cronológico + dedupe exacto + gate temporal antes del estimador.
    const ingestion = await ingestOperatorLocations({
      sessionId,
      locations: payload?.locations,
      channel: 'background',
      metadata: BG_POINT_METADATA,
      role: 'authoritative',
      sessionStartedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : null,
      sessionStartedAt: stored?.startedAt ?? null,
    });
    const points = ingestion.points;

    const intraCallbackCapturedAtSpanMs = computeIntraCallbackCapturedAtSpanMs(points);

    recordTrackingDiagnostic(
      'tracking-location-callback',
      {
        channel: 'background',
        locationCount: rawLocationCount,
        mappedPointCount: points.length,
        intraCallbackCapturedAtSpanMs,
        sortedCallback: ingestion.sortedCallback,
        rejectedCount: ingestion.rejected.length,
        // Solo informativo: los inválidos ya se contaron en su propio evento.
        invalidCount: ingestion.invalid,
        batchInFlight,
        finalizationActive,
      },
      sessionId,
    );

    if (points.length === 0) {
      const emptyKind = recordOperatorBackgroundEmptyCallback({
        sessionId,
        rawLocationCount,
        rejectedCount: ingestion.rejected.length,
        invalidCount: ingestion.invalid,
      });
      if (emptyKind === 'timeout') {
        await recordTaskDrop('empty_points');
      }
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
