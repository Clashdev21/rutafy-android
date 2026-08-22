/**
 * Speed 2B.1 — umbrales EXPERIMENTALES de actividad inercial.
 *
 * Basados en una captura corta A03 (avg RMS ≈ 0.029, max ≈ 0.070).
 * NO calibrados. NO equivalen a detenido/moviendo.
 * Ajustar aquí tras el viaje Buenaventura → Cali.
 */

/** RMS ≤ este valor → low (experimental). */
export const MOTION_LOW_MAX_RMS_G = 0.04;

/** RMS ≤ este valor (y > LOW) → medium; por encima → high (experimental). */
export const MOTION_MEDIUM_MAX_RMS_G = 0.08;

/**
 * Pico dinámico ≥ este valor cuenta como highPeakWindow (métrica, sin semántica).
 * No implica phone handling ni frenada.
 */
export const MOTION_HIGH_PEAK_MIN_G = 0.12;

/** Duración de cada bucket de timeline (~30 s). */
export const MOTION_TIMELINE_BUCKET_MS = 30_000;

/**
 * Capacidad máxima de buckets persistidos.
 * 720 × 30 s ≈ 6 h de cobertura FG continua.
 */
export const MAX_MOTION_TIMELINE_BUCKETS = 720;
