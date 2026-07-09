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
  gpsDetailFromPoint,
  recordTrackingDiagnostic,
  runTrackingHealthCheck,
} from '@/services/trackingDiagnostics';
import { operatorTrackingHealthStorage } from '@/storage/operatorTrackingHealthStorage';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingPointInput } from '@/types/tracking';
import { classifyOperatorBgBatchError } from '@/utils/operatorTrackingHealthAudit';
import { locationsToTrackingPoints } from '@/utils/trackingPointMapper';
import { buildTraceId } from '@/utils/traceId';

/** Task de ubicación en segundo plano para captura logística (separada del mensajero). */
export const OPERATOR_TRACKING_TASK_NAME = 'rutafy-operator-tracking';

const BG_POINT_METADATA = { source: 'android_background' as const };

let batchInFlight = false;

function shortSessionId(id: string): string {
  const compact = id.replace(/-/g, '');
  return compact.length > 8 ? compact.slice(0, 8) : compact;
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
  await trackingSessionStorage.clearActive();
}

async function executeBatchPost(
  sessionId: string,
  points: TrackingPointInput[],
  token: string,
  startedAt: number,
): Promise<
  | { ok: true; accepted: number; latencyMs: number; status: number }
  | { ok: false; status: number; detail: string; latencyMs: number; parsed: Record<string, unknown> | null }
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
    const latencyMs = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes('timeout');
    recordTrackingDiagnostic(
      isTimeout ? 'batch-timeout' : 'batch-error',
      { channel: 'background', latencyMs, error: msg },
      sessionId,
    );
    throw e;
  }

  const latencyMs = Date.now() - startedAt;
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
    return {
      ok: false,
      status: response.status,
      detail,
      latencyMs,
      parsed,
    };
  }

  const accepted =
    typeof parsed?.accepted === 'number'
      ? parsed.accepted
      : typeof parsed?.accepted_count === 'number'
        ? parsed.accepted_count
        : points.length;

  return { ok: true, accepted, latencyMs, status: response.status };
}

function recordBatchSuccess(
  sessionId: string,
  points: TrackingPointInput[],
  latencyMs: number,
  status: number,
  accepted: number,
): void {
  recordTrackingDiagnostic(
    'batch-success',
    { channel: 'background', status, latencyMs, pointCount: points.length },
    sessionId,
  );
  recordTrackingDiagnostic(
    'batch-accepted',
    { channel: 'background', accepted, latencyMs },
    sessionId,
  );
}

async function postPointsBatch(sessionId: string, points: TrackingPointInput[]): Promise<number> {
  const startedAt = Date.now();
  recordTrackingDiagnostic(
    'batch-created',
    { pointCount: points.length, channel: 'background' },
    sessionId,
  );

  let token = await getValidAccessToken({ source: 'operator_tracking_bg' });
  if (!token) {
    recordBatchHttpError(401, sessionId, {
      channel: 'background',
      latencyMs: Date.now() - startedAt,
      reason: 'no_valid_access_token',
    });
    throw new Error('401');
  }

  recordTrackingDiagnostic(
    'batch-send',
    { pointCount: points.length, channel: 'background' },
    sessionId,
  );

  let result = await executeBatchPost(sessionId, points, token, startedAt);

  if (!result.ok && result.status === 401) {
    recordBatchHttpError(401, sessionId, {
      channel: 'background',
      status: 401,
      latencyMs: result.latencyMs,
      pointCount: points.length,
      error: result.detail,
      retry: true,
    });

    const refreshOutcome = await refreshAccessTokenWithOutcome({
      source: 'operator_tracking_bg_401',
    });

    if (refreshOutcome.status === 'success') {
      token = refreshOutcome.token;
      recordTrackingDiagnostic(
        'batch-send',
        { pointCount: points.length, channel: 'background', retryAfter401: true },
        sessionId,
      );
      result = await executeBatchPost(sessionId, points, token, startedAt);
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
      recordBatchHttpError(result.status, sessionId, {
        channel: 'background',
        status: result.status,
        latencyMs: result.latencyMs,
        pointCount: points.length,
        error: result.detail,
      });
    }
    throw new Error(String(result.status) === '401' ? '401' : result.detail);
  }

  recordBatchSuccess(sessionId, points, result.latencyMs, result.status, result.accepted);
  return result.accepted;
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
    const points = locationsToTrackingPoints(
      payload?.locations,
      'background',
      BG_POINT_METADATA,
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

    if (batchInFlight) {
      await recordTaskDrop('in_flight');
      return;
    }

    batchInFlight = true;
    try {
      if (__DEV__) {
        console.log('[operator-bg-batch]', {
          sessionId: shortSessionId(sessionId),
          count: points.length,
        });
      }
      const accepted = await postPointsBatch(sessionId, points);
      await operatorTrackingHealthStorage.recordBatchOk();
      console.log('[operator-bg-batch-ok]', { accepted });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('session_not_active')) {
        await cleanupClosedSessionLocally('session_not_active_bg');
        return;
      }
      const errorCode = classifyOperatorBgBatchError(e);
      console.warn('[operator-bg-batch-error]', { errorCode, detail: e });
      await operatorTrackingHealthStorage.recordBatchError(errorCode);
    } finally {
      batchInFlight = false;
    }
  });

  if (__DEV__) {
    console.log('[operator-bg-task-defined]', OPERATOR_TRACKING_TASK_NAME);
  }
}
