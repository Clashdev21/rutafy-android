import type {
  AssessSpeedSampleQualityInput,
  SpeedQualityAssessment,
} from '@/types/speedQuality';
import {
  GOOD_RATIO,
  MAX_DERIVED_GAP_MS,
  MAX_PLAUSIBLE_ROAD_SPEED_KMH,
  POOR_ACCURACY_M,
  STALE_FIX_MS,
  WEAK_RATIO,
} from '@/types/speedQuality';

function isValidAccuracy(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Incertidumbre espacial combinada (RSS).
 * Heurística geométrica: sqrt(a_prev² + a_curr²).
 * NO es probabilidad ni intervalo de confianza estadístico.
 */
export function computeCombinedAccuracyM(
  previousAccuracyM: number | null | undefined,
  currentAccuracyM: number | null | undefined,
): number | null {
  if (!isValidAccuracy(previousAccuracyM) || !isValidAccuracy(currentAccuracyM)) {
    return null;
  }
  return Math.sqrt(previousAccuracyM ** 2 + currentAccuracyM ** 2);
}

/**
 * displacementQualityRatio = distance / combinedAccuracy
 * null si combinedAccuracy no disponible o <= 0.
 */
export function computeDisplacementQualityRatio(
  distanceFromPreviousM: number,
  combinedAccuracyM: number | null,
): number | null {
  if (
    !Number.isFinite(distanceFromPreviousM) ||
    combinedAccuracyM == null ||
    !Number.isFinite(combinedAccuracyM) ||
    combinedAccuracyM <= 0
  ) {
    return null;
  }
  return distanceFromPreviousM / combinedAccuracyM;
}

/**
 * Clasifica una muestra derived ya calculada matemáticamente.
 * No modifica valores; solo asigna quality + reason.
 */
export function assessSpeedSampleQuality(
  input: AssessSpeedSampleQualityInput,
): SpeedQualityAssessment {
  const {
    previousAccuracyM,
    currentAccuracyM,
    distanceFromPreviousM,
    deltaTimeMs,
    speedDerivedKmh,
    fixAgeMs,
  } = input;

  const combinedAccuracyM = computeCombinedAccuracyM(
    previousAccuracyM,
    currentAccuracyM,
  );
  const displacementQualityRatio = computeDisplacementQualityRatio(
    distanceFromPreviousM,
    combinedAccuracyM,
  );
  const staleFix =
    typeof fixAgeMs === 'number' && Number.isFinite(fixAgeMs) && fixAgeMs > STALE_FIX_MS;

  if (!Number.isFinite(deltaTimeMs) || deltaTimeMs <= 0) {
    return {
      quality: 'rejected',
      qualityReason: 'invalid_delta',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (!Number.isFinite(distanceFromPreviousM) || !Number.isFinite(speedDerivedKmh)) {
    return {
      quality: 'rejected',
      qualityReason: 'invalid_coordinates',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (deltaTimeMs > MAX_DERIVED_GAP_MS) {
    return {
      quality: 'rejected',
      qualityReason: 'long_gap',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (speedDerivedKmh > MAX_PLAUSIBLE_ROAD_SPEED_KMH) {
    return {
      quality: 'rejected',
      qualityReason: 'implausible_speed',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  const currentPoor =
    isValidAccuracy(currentAccuracyM) && currentAccuracyM > POOR_ACCURACY_M;
  const previousPoor =
    isValidAccuracy(previousAccuracyM) && previousAccuracyM > POOR_ACCURACY_M;
  const anyPoorAccuracy = currentPoor || previousPoor;

  if (displacementQualityRatio == null) {
    // Sin accuracy combinada no podemos afirmar geometría buena.
    if (anyPoorAccuracy) {
      return {
        quality: 'rejected',
        qualityReason: 'poor_accuracy',
        combinedAccuracyM,
        displacementQualityRatio,
        staleFix,
      };
    }
    return {
      quality: 'weak',
      qualityReason: 'missing_accuracy',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (displacementQualityRatio < WEAK_RATIO) {
    return {
      quality: 'rejected',
      qualityReason: anyPoorAccuracy ? 'poor_accuracy' : 'weak_geometry',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  if (displacementQualityRatio < GOOD_RATIO) {
    return {
      quality: 'weak',
      qualityReason: anyPoorAccuracy ? 'poor_accuracy' : 'weak_geometry',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  // ratio >= GOOD_RATIO
  if (anyPoorAccuracy) {
    // Accuracy mala: no puede ser good aunque el ratio sea alto.
    return {
      quality: 'weak',
      qualityReason: 'poor_accuracy',
      combinedAccuracyM,
      displacementQualityRatio,
      staleFix,
    };
  }

  return {
    quality: 'good',
    qualityReason: 'good_geometry',
    combinedAccuracyM,
    displacementQualityRatio,
    staleFix,
  };
}
