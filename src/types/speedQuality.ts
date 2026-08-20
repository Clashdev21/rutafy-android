/**
 * Quality Gate de velocidad derivada (Speed 2A.2) — solo diagnóstico local.
 * No altera speed_mps ni el payload al backend.
 */

/** Clasificación geométrica / temporal de una muestra derived. */
export type SpeedQuality = 'good' | 'weak' | 'rejected';

/**
 * Razones observables del Quality Gate.
 * Thresholds son hipótesis experimentales — no usar en Journey/ETA.
 */
export type SpeedQualityReason =
  | 'good_geometry'
  | 'weak_geometry'
  | 'poor_accuracy'
  | 'long_gap'
  | 'implausible_speed'
  | 'invalid_delta'
  | 'invalid_coordinates'
  | 'stale_fix'
  | 'missing_accuracy';

export type SpeedQualityAssessment = {
  quality: SpeedQuality;
  qualityReason: SpeedQualityReason;
  combinedAccuracyM: number | null;
  displacementQualityRatio: number | null;
  /** Flag paralelo: fixAge > STALE_FIX_MS (no fuerza rejected por sí solo). */
  staleFix: boolean;
};

export type AssessSpeedSampleQualityInput = {
  previousAccuracyM: number | null;
  currentAccuracyM: number | null;
  distanceFromPreviousM: number;
  deltaTimeMs: number;
  speedDerivedKmh: number;
  /** Edad del fix actual respecto a Date.now() al observar. */
  fixAgeMs?: number | null;
};

/** Ratio mínimo para candidato "good" (experimental). */
export const GOOD_RATIO = 3.0;
/** Ratio mínimo para candidato "weak" (experimental). */
export const WEAK_RATIO = 1.5;
/** Accuracy individual por encima → no puede ser good (experimental). */
export const POOR_ACCURACY_M = 50;
/** Gap temporal máximo para derived "usable" en diagnóstico (experimental). */
export const MAX_DERIVED_GAP_MS = 60_000;
/** Techo diagnóstico de velocidad vial (experimental). */
export const MAX_PLAUSIBLE_ROAD_SPEED_KMH = 160;
/** Edad del fix respecto a now para marcar stale (experimental). */
export const STALE_FIX_MS = 30_000;
/**
 * Umbral mínimo de derived "good" para contar native-zero-while-moving.
 * Conservador: no interpreta native=0 como detenido.
 */
export const NATIVE_ZERO_MOVING_MIN_DERIVED_KMH = 10;
