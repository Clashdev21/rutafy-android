/**
 * Clasificador diagnóstico de gaps entre fixes válidos (Reliability 3A).
 * NO es clasificador operacional definitivo.
 */

import type { TrackingGapClassification } from '@/types/sessionTrackingPipeline';
import { computeCombinedAccuracyM, computeDisplacementQualityRatio } from '@/utils/speedQualityGate';
import { haversineDistanceM } from '@/utils/speedTelemetry';
import {
  LOCATION_GAP_MIN_MS,
  MIN_DISPLACEMENT_QUALITY_RATIO_FOR_MOVEMENT,
  MOVEMENT_MAX_IMPLIED_SPEED_KMH,
  MOVEMENT_MIN_DISPLACEMENT_M,
  MOVEMENT_MIN_IMPLIED_SPEED_KMH,
  STATIONARY_DISPLACEMENT_MAX_M,
  UNRELIABLE_SINGLE_ACCURACY_M,
} from '@/utils/trackingGapThresholds';

export type TrackingGapFixSnapshot = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  capturedAtMs: number;
  speedMps?: number | null;
  appState?: string | null;
};

export type ClassifyTrackingGapInput = {
  previous: TrackingGapFixSnapshot;
  current: TrackingGapFixSnapshot;
  lastTaskEventType?: string | null;
};

export type ClassifyTrackingGapResult = {
  classification: TrackingGapClassification;
  reason: string;
  durationMs: number;
  displacementM: number;
  impliedAverageSpeedKmh: number | null;
  previousAccuracyM: number | null;
  currentAccuracyM: number | null;
  combinedAccuracyM: number | null;
  displacementQualityRatio: number | null;
};

function impliedSpeedKmh(displacementM: number, durationMs: number): number | null {
  if (!Number.isFinite(displacementM) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  const kmh = (displacementM / durationMs) * 3600;
  return Number.isFinite(kmh) ? kmh : null;
}

/** Accuracy individual tan mala que ninguna inferencia espacial es confiable. */
function hasUnreliableSingleAccuracy(
  previousAccuracyM: number | null,
  currentAccuracyM: number | null,
): boolean {
  return (
    (previousAccuracyM != null && previousAccuracyM >= UNRELIABLE_SINGLE_ACCURACY_M) ||
    (currentAccuracyM != null && currentAccuracyM >= UNRELIABLE_SINGLE_ACCURACY_M)
  );
}

/** Incertidumbre combinada impide inferir movimiento (no aplica a desplazamiento negligible). */
function isMovementSpatiallyUnreliable(
  displacementM: number,
  combinedAccuracyM: number | null,
): boolean {
  return combinedAccuracyM != null && combinedAccuracyM >= displacementM;
}

/**
 * Clasifica un gap entre dos fixes válidos consecutivos.
 * Retorna null si durationMs < LOCATION_GAP_MIN_MS.
 */
export function classifyTrackingGap(
  input: ClassifyTrackingGapInput,
): ClassifyTrackingGapResult | null {
  const { previous, current } = input;
  const durationMs = current.capturedAtMs - previous.capturedAtMs;
  if (!Number.isFinite(durationMs) || durationMs < LOCATION_GAP_MIN_MS) {
    return null;
  }

  const displacementM = haversineDistanceM(
    previous.lat,
    previous.lng,
    current.lat,
    current.lng,
  );
  const impliedAverageSpeedKmh = impliedSpeedKmh(displacementM, durationMs);
  const previousAccuracyM = previous.accuracyM;
  const currentAccuracyM = current.accuracyM;
  const combinedAccuracyM = computeCombinedAccuracyM(previousAccuracyM, currentAccuracyM);
  const displacementQualityRatio = computeDisplacementQualityRatio(
    displacementM,
    combinedAccuracyM,
  );

  if (hasUnreliableSingleAccuracy(previousAccuracyM, currentAccuracyM)) {
    return {
      classification: 'unknown',
      reason: 'spatial_uncertainty_too_high',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
      previousAccuracyM,
      currentAccuracyM,
      combinedAccuracyM,
      displacementQualityRatio,
    };
  }

  if (displacementM <= STATIONARY_DISPLACEMENT_MAX_M) {
    return {
      classification: 'stationary',
      reason: 'negligible_displacement',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
      previousAccuracyM,
      currentAccuracyM,
      combinedAccuracyM,
      displacementQualityRatio,
    };
  }

  if (
    impliedAverageSpeedKmh != null &&
    impliedAverageSpeedKmh > MOVEMENT_MAX_IMPLIED_SPEED_KMH
  ) {
    return {
      classification: 'unknown',
      reason: 'implausible_implied_speed',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
      previousAccuracyM,
      currentAccuracyM,
      combinedAccuracyM,
      displacementQualityRatio,
    };
  }

  if (isMovementSpatiallyUnreliable(displacementM, combinedAccuracyM)) {
    return {
      classification: 'unknown',
      reason: 'spatial_uncertainty_too_high',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
      previousAccuracyM,
      currentAccuracyM,
      combinedAccuracyM,
      displacementQualityRatio,
    };
  }

  const hasMovementSignal =
    displacementM >= MOVEMENT_MIN_DISPLACEMENT_M &&
    impliedAverageSpeedKmh != null &&
    impliedAverageSpeedKmh >= MOVEMENT_MIN_IMPLIED_SPEED_KMH &&
    displacementQualityRatio != null &&
    displacementQualityRatio >= MIN_DISPLACEMENT_QUALITY_RATIO_FOR_MOVEMENT;

  if (hasMovementSignal) {
    return {
      classification: 'movement_suspected',
      reason: 'displacement_and_implied_speed_plausible',
      durationMs,
      displacementM,
      impliedAverageSpeedKmh,
      previousAccuracyM,
      currentAccuracyM,
      combinedAccuracyM,
      displacementQualityRatio,
    };
  }

  return {
    classification: 'unknown',
    reason: 'insufficient_movement_evidence',
    durationMs,
    displacementM,
    impliedAverageSpeedKmh,
    previousAccuracyM,
    currentAccuracyM,
    combinedAccuracyM,
    displacementQualityRatio,
  };
}

/** Helper para tests con timestamps ISO. */
export function classifyTrackingGapFromIso(
  input: Omit<ClassifyTrackingGapInput, 'previous' | 'current'> & {
    previous: Omit<TrackingGapFixSnapshot, 'capturedAtMs'> & { capturedAt: string };
    current: Omit<TrackingGapFixSnapshot, 'capturedAtMs'> & { capturedAt: string };
  },
): ClassifyTrackingGapResult | null {
  const prevMs = Date.parse(input.previous.capturedAt);
  const currMs = Date.parse(input.current.capturedAt);
  if (!Number.isFinite(prevMs) || !Number.isFinite(currMs)) return null;
  return classifyTrackingGap({
    ...input,
    previous: { ...input.previous, capturedAtMs: prevMs },
    current: { ...input.current, capturedAtMs: currMs },
  });
}
