/**
 * Observador session-scoped del pipeline de tracking (Reliability 3A).
 * Consumidor del watcher/mapper existente — NO crea otro GPS watch.
 */

import {
  beginSessionTrackingPipelineStatistics,
  recordPipelineGapDiagnostic,
} from '@/services/trackingDiagnostics';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingPointInput } from '@/types/tracking';
import { classifyTrackingGap } from '@/utils/trackingGapClassifier';
import type { TrackingGapFixSnapshot } from '@/utils/trackingGapClassifier';

type PreviousValidFix = TrackingGapFixSnapshot & {
  capturedAt: string;
  sessionId: string;
};

let previousValidFix: PreviousValidFix | null = null;
let lastTaskEventType: string | null = null;

export function resetTrackingPipelinePreviousFix(): void {
  previousValidFix = null;
  lastTaskEventType = null;
}

export function resetTrackingPipelineForNewSession(sessionId: string): void {
  resetTrackingPipelinePreviousFix();
  beginSessionTrackingPipelineStatistics(sessionId);
}

export function notePipelineTaskEvent(type: string): void {
  lastTaskEventType = type;
}

function snapshotFromPoint(point: TrackingPointInput): Omit<PreviousValidFix, 'sessionId'> {
  const capturedAtMs = Date.parse(point.captured_at);
  return {
    lat: point.lat,
    lng: point.lng,
    accuracyM: point.accuracy_m ?? null,
    capturedAtMs: Number.isFinite(capturedAtMs) ? capturedAtMs : Date.now(),
    capturedAt: point.captured_at,
    speedMps: point.speed_mps ?? null,
    appState: point.app_state ?? null,
  };
}

/**
 * Invocado tras mapear un fix válido (point-mapped).
 * Detecta gaps y actualiza stats session-scoped.
 */
export function observeTrackingPipelineFromPoint(
  point: TrackingPointInput,
  sessionId?: string | null,
): void {
  const resolvedSessionId = sessionId ?? trackingSessionStorage.getActiveSessionIdSync();
  if (!resolvedSessionId) return;

  const current = snapshotFromPoint(point);
  const prev = previousValidFix;

  if (prev && prev.sessionId === resolvedSessionId) {
    const gap = classifyTrackingGap({
      previous: prev,
      current,
      lastTaskEventType,
    });
    if (gap) {
      recordPipelineGapDiagnostic(resolvedSessionId, gap, prev, current, lastTaskEventType);
    }
  }

  previousValidFix = {
    ...current,
    sessionId: resolvedSessionId,
  };
}
