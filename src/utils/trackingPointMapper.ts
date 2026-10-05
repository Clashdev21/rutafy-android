import type { LocationObject } from 'expo-location';

import { gpsDetailFromPoint, recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import type { TrackingPointAppState, TrackingPointInput } from '@/types/tracking';
import { observeSpeedTelemetryFromPoint } from '@/utils/speedTelemetryObserver';
import { enrichTrackingPointTelemetry } from '@/utils/trackingTelemetryEnrichment';
import {
  evaluateSessionFixTemporalValidity,
  resolveCapturedAtMs,
  type SessionFixTemporalReason,
} from '@/utils/trackingTemporalGuard';
import { observeTrackingPipelineFromPoint } from '@/utils/trackingPipelineObserver';
import { readNativeQualityV1 } from '@/utils/nativeQuality';
import { createTechnicalUuid } from '@/utils/technicalUuid';
import {
  MEASUREMENT_SOURCE_FALLBACK,
  MEASUREMENT_SOURCE_NATIVE,
  withObservationTemporal,
  type CallbackProvenanceInput,
} from '@/utils/temporalProvenance';

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

/** Contexto observacional Speed 2A.2 + snapshot 3D.1 del MISMO fix. */
export type TrackingPointFixContext = {
  fixAgeMs: number | null;
  mocked: boolean | null;
  locationTimestampMs: number | null;
};

export type MapTrackingPointPureResult =
  | {
      ok: true;
      point: TrackingPointInput;
      context: TrackingPointFixContext;
      temporalReason: SessionFixTemporalReason | null;
    }
  | {
      ok: false;
      reason: 'invalid_coords' | SessionFixTemporalReason;
      detail?: {
        capturedAtMs: number | null;
        ageRelativeToSessionMs: number | null;
        fixAgeMs: number | null;
      };
    };

/**
 * Fase A — mapeo PURO de LocationObject a TrackingPointInput.
 *
 * Sin efectos secundarios: no registra diagnósticos, no toca el estimador, no
 * mueve previousFix. Permite que el canal `observe` construya un snapshot de UI
 * sin atravesar el camino mutante.
 */
export function mapTrackingPointPure(
  location: LocationLike | LocationObject,
  appState: TrackingPointAppState,
  metadata: Record<string, unknown> | undefined,
  sessionContext?: {
    sessionStartedAtMs?: number | null;
    nowMs?: number;
    callback?: CallbackProvenanceInput;
  },
): MapTrackingPointPureResult {
  const coords = location.coords;
  const lat = coords?.latitude;
  const lng = coords?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'invalid_coords' };
  }

  const nowMs = sessionContext?.nowMs ?? Date.now();
  const capturedAtMs = resolveCapturedAtMs(location.timestamp);
  const sessionStartedAtMs =
    sessionContext?.sessionStartedAtMs != null &&
    Number.isFinite(sessionContext.sessionStartedAtMs)
      ? sessionContext.sessionStartedAtMs
      : null;

  let temporalReason: SessionFixTemporalReason | null = null;
  if (sessionStartedAtMs != null) {
    const validity = evaluateSessionFixTemporalValidity({
      capturedAtMs,
      sessionStartedAtMs,
      nowMs,
    });
    if (!validity.accepted) {
      return {
        ok: false,
        reason: validity.reason,
        detail: {
          capturedAtMs,
          ageRelativeToSessionMs: validity.ageRelativeToSessionMs,
          fixAgeMs: validity.fixAgeMs,
        },
      };
    }
    temporalReason = validity.reason;
  }

  const nativeTimestampValid = capturedAtMs != null;
  const timestamp = capturedAtMs ?? nowMs;
  const capturedAt = new Date(timestamp).toISOString();
  const speed = coords?.speed;
  const heading = coords?.heading;
  const callback = sessionContext?.callback;

  // TrackingPointInput / backend payload — contrato original intacto.
  // speed_mps conserva el valor nativo en m/s: nunca derived/effective.
  // measurement_at solo existe cuando el timestamp nativo es válido; el fallback
  // no inventa un instante de medición.
  const point: TrackingPointInput = {
    lat: lat as number,
    lng: lng as number,
    captured_at: capturedAt,
    accuracy_m:
      coords?.accuracy != null && Number.isFinite(coords.accuracy) ? coords.accuracy : null,
    speed_mps: speed != null && Number.isFinite(speed) && speed >= 0 ? speed : null,
    heading: heading != null && Number.isFinite(heading) && heading >= 0 ? heading : null,
    battery_level: null,
    app_state: appState,
    fix_id: createTechnicalUuid(),
    metadata: withObservationTemporal(
      {
        ...(metadata ?? {}),
        native_quality: readNativeQualityV1(location),
      },
      {
        measurement_at: nativeTimestampValid ? capturedAt : null,
        measurement_timestamp_source: nativeTimestampValid
          ? MEASUREMENT_SOURCE_NATIVE
          : MEASUREMENT_SOURCE_FALLBACK,
        ...(callback
          ? {
              callback_at: callback.callback_at,
              callback_batch_id: callback.callback_batch_id,
              callback_index: callback.callback_index,
              callback_size: callback.callback_size,
            }
          : {}),
      },
    ),
  };

  const locationTimestampMs =
    typeof location.timestamp === 'number' && Number.isFinite(location.timestamp)
      ? location.timestamp
      : null;

  return {
    ok: true,
    point,
    temporalReason,
    context: {
      fixAgeMs: locationTimestampMs != null ? Math.max(0, nowMs - locationTimestampMs) : null,
      mocked:
        typeof (location as LocationLike).mocked === 'boolean'
          ? ((location as LocationLike).mocked as boolean)
          : null,
      locationTimestampMs,
    },
  };
}

/**
 * Aplica la observación AUTORITATIVA de un punto ya mapeado: stats de pipeline,
 * estimador de velocidad/motion y enrichment de metadata.
 *
 * Solo debe invocarse desde el canal autoritativo (ver operatorIngestionOwnership).
 */
export function observeAuthoritativeTrackingPoint(
  point: TrackingPointInput,
  sessionId: string,
  context: TrackingPointFixContext,
): TrackingPointInput {
  recordTrackingDiagnostic('point-mapped', gpsDetailFromPoint(point), sessionId);
  observeTrackingPipelineFromPoint(point, sessionId);
  const telemetry = observeSpeedTelemetryFromPoint(point, sessionId, {
    fixAgeMs: context.fixAgeMs,
    mocked: context.mocked,
    locationTimestampMs: context.locationTimestampMs,
  });

  // Tracking 3D.1 — metadata aditiva del MISMO fix (speed_mps intacto).
  return telemetry ? enrichTrackingPointTelemetry(point, telemetry) : point;
}
