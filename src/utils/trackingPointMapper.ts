import type { LocationObject } from 'expo-location';

import { gpsDetailFromPoint, recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingPointAppState, TrackingPointInput } from '@/types/tracking';
import { observeSpeedTelemetryFromPoint } from '@/utils/speedTelemetryObserver';
import {
  evaluateSessionFixTemporalValidity,
  resolveCapturedAtMs,
} from '@/utils/trackingTemporalGuard';
import { observeTrackingPipelineFromPoint } from '@/utils/trackingPipelineObserver';

type CoordsLike = {
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
};

type LocationLike = {
  coords?: CoordsLike;
  timestamp?: number;
  mocked?: boolean;
};

export function toTrackingPoint(
  location: LocationLike | LocationObject,
  appState: TrackingPointAppState,
  metadata?: Record<string, unknown>,
): TrackingPointInput | null {
  const coords = location.coords;
  const lat = coords?.latitude;
  const lng = coords?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const sessionId = trackingSessionStorage.getActiveSessionIdSync();
    if (sessionId) {
      recordTrackingDiagnostic('tracking-fix-invalid', { reason: 'invalid_coords' }, sessionId);
    }
    return null;
  }

  const sessionId = trackingSessionStorage.getActiveSessionIdSync();
  const capturedAtMs = resolveCapturedAtMs(location.timestamp);

  if (sessionId) {
    const sessionStartedAt = trackingSessionStorage.getActiveSessionStartedAtSync();
    const sessionStartedAtMs = sessionStartedAt ? Date.parse(sessionStartedAt) : null;
    const validity = evaluateSessionFixTemporalValidity({
      capturedAtMs,
      sessionStartedAtMs:
        sessionStartedAtMs != null && Number.isFinite(sessionStartedAtMs)
          ? sessionStartedAtMs
          : null,
      nowMs: Date.now(),
    });

    if (!validity.accepted) {
      recordTrackingDiagnostic(
        'tracking-fix-temporal-rejected',
        {
          reason: validity.reason,
          sessionId,
          capturedAt: capturedAtMs != null ? new Date(capturedAtMs).toISOString() : null,
          sessionStartedAt: sessionStartedAt ?? null,
          deltaMs: validity.ageRelativeToSessionMs,
          ageRelativeToSessionMs: validity.ageRelativeToSessionMs,
          fixAgeMs: validity.fixAgeMs,
        },
        sessionId,
      );
      return null;
    }

    if (validity.reason === 'within_early_tolerance') {
      recordTrackingDiagnostic('tracking-stat-early-tolerance', {}, sessionId);
    }
  }

  const timestamp = capturedAtMs ?? Date.now();
  const speed = coords?.speed;
  const heading = coords?.heading;

  // TrackingPointInput / backend payload — contrato original intacto.
  const point: TrackingPointInput = {
    lat: lat as number,
    lng: lng as number,
    captured_at: new Date(timestamp).toISOString(),
    accuracy_m:
      coords?.accuracy != null && Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    speed_mps:
      speed != null && Number.isFinite(speed) && speed >= 0 ? speed : null,
    heading:
      heading != null && Number.isFinite(heading) && heading >= 0 ? heading : null,
    battery_level: null,
    app_state: appState,
    metadata,
  };

  // Contexto observacional Speed 2A.2 — NO se añade al batch API.
  const locationTimestampMs =
    typeof location.timestamp === 'number' && Number.isFinite(location.timestamp)
      ? location.timestamp
      : null;
  const fixAgeMs =
    locationTimestampMs != null ? Math.max(0, Date.now() - locationTimestampMs) : null;
  const mocked =
    typeof (location as LocationLike).mocked === 'boolean'
      ? (location as LocationLike).mocked
      : null;

  recordTrackingDiagnostic('point-mapped', gpsDetailFromPoint(point));
  observeTrackingPipelineFromPoint(point, trackingSessionStorage.getActiveSessionIdSync());
  observeSpeedTelemetryFromPoint(point, undefined, {
    fixAgeMs,
    mocked,
    locationTimestampMs,
  });
  return point;
}

export function locationsToTrackingPoints(
  locations: unknown,
  appState: TrackingPointAppState,
  metadata?: Record<string, unknown>,
): TrackingPointInput[] {
  if (!Array.isArray(locations)) return [];
  const points: TrackingPointInput[] = [];
  for (const loc of locations) {
    const point = toTrackingPoint(loc as LocationLike, appState, metadata);
    if (point) points.push(point);
  }
  return points;
}
