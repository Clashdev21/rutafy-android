import { fetch as expoFetch } from 'expo/fetch';
import * as TaskManager from 'expo-task-manager';

import { TRACKING_SESSION_ENDPOINTS } from '@/api/endpoints';
import { tokenStorage } from '@/auth/tokenStorage';
import { API_BASE_URL } from '@/config/env';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingPointInput } from '@/types/tracking';
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

async function postPointsBatch(sessionId: string, points: TrackingPointInput[]): Promise<number> {
  const token = await tokenStorage.getAccessToken();
  if (!token) {
    throw new Error('Sin token de sesión para enviar puntos en segundo plano');
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
    throw new Error(detail);
  }

  if (typeof parsed?.accepted === 'number') return parsed.accepted;
  if (typeof parsed?.accepted_count === 'number') return parsed.accepted_count;
  return points.length;
}

if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
  TaskManager.defineTask(OPERATOR_TRACKING_TASK_NAME, async ({ data, error }) => {
    if (error) {
      if (__DEV__) {
        console.warn('[operator-bg-batch-error]', error);
      }
      return;
    }

    const stored = await trackingSessionStorage.getActive();
    if (!stored?.sessionId?.trim()) {
      return;
    }

    const payload = data as { locations?: unknown } | undefined;
    const points = locationsToTrackingPoints(
      payload?.locations,
      'background',
      BG_POINT_METADATA,
    );

    if (points.length === 0) return;

    if (__DEV__) {
      for (const point of points) {
        console.log('[operator-bg-point-quality]', {
          accuracy_m: point.accuracy_m,
          speed_mps: point.speed_mps,
          heading: point.heading,
        });
      }
    }

    if (__DEV__) {
      console.log('[operator-bg-event]', {
        sessionId: shortSessionId(stored.sessionId),
        count: points.length,
        at: points[points.length - 1]?.captured_at ?? null,
      });
    }

    if (batchInFlight) return;

    batchInFlight = true;
    try {
      if (__DEV__) {
        console.log('[operator-bg-batch]', {
          sessionId: shortSessionId(stored.sessionId),
          count: points.length,
        });
      }
      const accepted = await postPointsBatch(stored.sessionId, points);
      if (__DEV__) {
        console.log('[operator-bg-batch-ok]', { accepted });
      }
    } catch (e) {
      if (__DEV__) {
        console.warn('[operator-bg-batch-error]', e);
      }
    } finally {
      batchInFlight = false;
    }
  });

  if (__DEV__) {
    console.log('[operator-bg-task-defined]', OPERATOR_TRACKING_TASK_NAME);
  }
}
