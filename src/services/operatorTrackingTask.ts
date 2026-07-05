import { fetch as expoFetch } from 'expo/fetch';
import * as TaskManager from 'expo-task-manager';

import { TRACKING_SESSION_ENDPOINTS } from '@/api/endpoints';
import { tokenStorage } from '@/auth/tokenStorage';
import { API_BASE_URL } from '@/config/env';
import { stopOperatorTrackingAsync } from '@/services/operatorTrackingService';
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

async function cleanupClosedSessionLocally(reason: string): Promise<void> {
  if (__DEV__) {
    console.log('[tracking-cleanup-local]', { reason });
  }
  await stopOperatorTrackingAsync();
  await trackingSessionStorage.clearActive();
}

async function postPointsBatch(sessionId: string, points: TrackingPointInput[]): Promise<number> {
  const token = await tokenStorage.getAccessToken();
  if (!token) {
    throw new Error('401');
  }

  const path = TRACKING_SESSION_ENDPOINTS.pointsBatch(sessionId);
  const response = await expoFetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-trace-id': buildTraceId('operator-bg-batch'),
    },
    body: JSON.stringify({ points }),
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
    if (isSessionNotActiveResponse(response.status, parsed, detail)) {
      throw new Error('session_not_active');
    }
    throw new Error(String(response.status) === '401' ? '401' : detail);
  }

  if (typeof parsed?.accepted === 'number') return parsed.accepted;
  if (typeof parsed?.accepted_count === 'number') return parsed.accepted_count;
  return points.length;
}

if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
  TaskManager.defineTask(OPERATOR_TRACKING_TASK_NAME, async ({ data, error }) => {
    if (error) {
      const errorCode = classifyOperatorBgBatchError(error);
      console.warn('[operator-bg-batch-error]', error);
      await operatorTrackingHealthStorage.recordBatchError(errorCode);
      return;
    }

    const stored = await trackingSessionStorage.getActive();
    if (!stored?.sessionId?.trim()) {
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
      await recordTaskDrop('empty_points');
      return;
    }

    const lastCapturedAt = points[points.length - 1]?.captured_at ?? null;
    await operatorTrackingHealthStorage.recordEvent();
    console.log('[operator-bg-event]', {
      sessionId: shortSessionId(stored.sessionId),
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
          sessionId: shortSessionId(stored.sessionId),
          count: points.length,
        });
      }
      const accepted = await postPointsBatch(stored.sessionId, points);
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
