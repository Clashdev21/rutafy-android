import type { LocationObject } from 'expo-location';

import { gpsDetailFromPoint, recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import type { TrackingPointAppState, TrackingPointInput } from '@/types/tracking';

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
};

export function toTrackingPoint(
  location: LocationLike | LocationObject,
  appState: TrackingPointAppState,
  metadata?: Record<string, unknown>,
): TrackingPointInput | null {
  const coords = location.coords;
  const lat = coords?.latitude;
  const lng = coords?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const timestamp = location.timestamp ?? Date.now();
  const speed = coords?.speed;
  const heading = coords?.heading;

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

  recordTrackingDiagnostic('point-mapped', gpsDetailFromPoint(point));
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
