/**
 * Enrichment puro Tracking 3D.1 — metadata aditiva, sin mutar speed_mps.
 */

import type { TrackingPointInput } from '@/types/tracking';
import type {
  TrackingEnrichedTelemetry,
  TrackingTelemetryMetadataFields,
} from '@/types/trackingTelemetry';
import { TRACKING_TELEMETRY_VERSION } from '@/types/trackingTelemetry';

function normalizeFiniteOrNull(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Fusiona telemetría en metadata sin overwrite de keys existentes (salvo las de telemetría).
 * Preserva metadata.source y cualquier otro campo previo.
 * speed_mps del punto NO se toca.
 */
export function enrichTrackingPointTelemetry(
  point: TrackingPointInput,
  telemetry: TrackingEnrichedTelemetry,
): TrackingPointInput {
  const existing =
    point.metadata && typeof point.metadata === 'object' && !Array.isArray(point.metadata)
      ? { ...point.metadata }
      : {};

  const kmh =
    telemetry.effectiveSpeedSource === 'unavailable'
      ? null
      : normalizeFiniteOrNull(telemetry.effectiveSpeedKmh);

  const fields: TrackingTelemetryMetadataFields = {
    tracking_telemetry_version: TRACKING_TELEMETRY_VERSION,
    effective_speed_kmh: kmh,
    effective_speed_source: telemetry.effectiveSpeedSource,
    effective_speed_confidence:
      telemetry.effectiveSpeedSource === 'unavailable'
        ? null
        : telemetry.effectiveSpeedConfidence,
    effective_speed_reason: telemetry.effectiveSpeedReason,
    motion_state: telemetry.motionState,
    motion_state_reason: telemetry.motionStateReason,
  };

  return {
    ...point,
    // speed_mps / lat / lng / captured_at intactos
    metadata: {
      ...existing,
      ...fields,
    },
  };
}

/** Shape legacy mínimo que el backend actual ya acepta (sin telemetría). */
export function isLegacyTrackingPointShape(point: TrackingPointInput): boolean {
  return (
    typeof point.lat === 'number' &&
    Number.isFinite(point.lat) &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lng) &&
    typeof point.captured_at === 'string' &&
    typeof point.app_state === 'string' &&
    (point.speed_mps == null ||
      (typeof point.speed_mps === 'number' && Number.isFinite(point.speed_mps)))
  );
}
