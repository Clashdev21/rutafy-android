import { fetch as expoFetch } from 'expo/fetch';
import * as TaskManager from 'expo-task-manager';

import { getValidAccessToken } from '@/auth/accessTokenManager';
import { API_BASE_URL } from '@/config/env';
import { buildTraceId } from '@/utils/traceId';

/** Única fuente de verdad del nombre de task (defineTask + start/stop). */
export const BACKGROUND_LOCATION_TASK_NAME = 'rutafy-background-location';
export const TASK_NAME = BACKGROUND_LOCATION_TASK_NAME;

console.log('[bg-task-module-loaded]', TASK_NAME);

let lastSentAt = 0;
let isSending = false;
const THROTTLE_MS = 30000;

type TaskLocation = {
  coords?: {
    latitude?: number;
    longitude?: number;
  };
  timestamp?: number;
};

function extractLastValidLocation(locations: unknown): TaskLocation | null {
  if (!Array.isArray(locations) || locations.length === 0) return null;
  for (let i = locations.length - 1; i >= 0; i -= 1) {
    const location = locations[i] as TaskLocation;
    const lat = location?.coords?.latitude;
    const lng = location?.coords?.longitude;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return location;
    }
  }
  return null;
}

async function sendBackgroundHeartbeat(lat: number, lng: number): Promise<void> {
  const now = Date.now();
  if (isSending) return;
  if (now - lastSentAt < THROTTLE_MS) return;

  const token = await getValidAccessToken({ source: 'mensajero_bg_heartbeat' });
  if (!token) return;

  isSending = true;
  try {
    const payload = { lat, lng };
    if (__DEV__) {
      console.log('[bg-heartbeat-payload]', payload);
    }
    const response = await expoFetch(`${API_BASE_URL}/v1/mensajero/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-trace-id': buildTraceId('bg-heartbeat'),
      },
      body: JSON.stringify(payload),
    });

    lastSentAt = Date.now();
    let parsed: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      console.warn('[bg-heartbeat-error]', { status: response.status, body: parsed });
      return;
    }

    console.log('[bg-heartbeat-response]', parsed);
  } catch (error) {
    console.warn('[bg-heartbeat-error]', error);
  } finally {
    isSending = false;
  }
}

if (!TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.warn('[bg-heartbeat-error]', error);
      return;
    }

    const payload = data as { locations?: unknown } | undefined;
    const lastLocation = extractLastValidLocation(payload?.locations);
    if (__DEV__) {
      console.log('[bg-location-event]', {
        hasLocations: Array.isArray(payload?.locations),
        count: Array.isArray(payload?.locations) ? payload.locations.length : 0,
        timestamp: lastLocation?.timestamp ?? null,
      });
    }

    if (!lastLocation) return;

    const lat = lastLocation.coords?.latitude;
    const lng = lastLocation.coords?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    await sendBackgroundHeartbeat(lat as number, lng as number);
  });
  console.log('[bg-task-defined]', TASK_NAME);
} else {
  console.log('[bg-task-already-defined]', TASK_NAME);
}
