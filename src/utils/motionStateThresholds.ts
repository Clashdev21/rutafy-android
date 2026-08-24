/**
 * Umbrales Motion State v1 (Tracking 3C / 3C.1) — diagnóstico experimental.
 * Separados de NATIVE_ZERO_MOVING_MIN_DERIVED_KMH (semántica Speed Fusion).
 *
 * Semántica de bandas de velocidad:
 *   speed <= STATIONARY_MAX_SPEED_KMH (3)  → evidencia STATIONARY
 *   3 < speed <= MOVING_EXIT_SPEED_KMH (5) → histéresis de salida de MOVING;
 *                                            NO evidencia stationary fuerte
 *   5 < speed < MOVING_ENTER_SPEED_KMH (10) → zona intermedia; conservar estado
 *   speed >= MOVING_ENTER_SPEED_KMH (10)    → evidencia MOVING
 */

import { LOCATION_GAP_MIN_MS } from '@/utils/trackingGapThresholds';

/** Velocidad effective mínima para evidencia / confirmación MOVING. */
export const MOVING_ENTER_SPEED_KMH = 10;

/**
 * Histéresis de salida de MOVING: por encima se conserva MOVING.
 * Por debajo (y por encima de STATIONARY_MAX) es zona intermedia de salida,
 * NO confirma STATIONARY por sí sola.
 */
export const MOVING_EXIT_SPEED_KMH = 5;

/** Techo para evidencia STATIONARY (tráfico lento 3–5 km/h no basta). */
export const STATIONARY_MAX_SPEED_KMH = 3;

export const MOVING_CONFIRM_MIN_SAMPLES = 2;

export const MOVING_CONFIRM_MIN_DURATION_MS = 10_000;

export const STATIONARY_CONFIRM_DURATION_MS = 60_000;

/**
 * Tolera pérdida puntual de effectiveSpeed antes de MOVING/STATIONARY → UNKNOWN.
 * Una sola muestra unavailable NO debe borrar un estado confirmado.
 */
export const UNKNOWN_CONFIRM_MIN_SAMPLES = 3;

export const UNKNOWN_CONFIRM_DURATION_MS = 30_000;

/** Máximo delta entre muestras que cuenta hacia duración observada. */
export const MAX_STATE_ACCUMULATION_GAP_MS = 60_000;

/** Gap largo → UNKNOWN inmediato (reutiliza umbral Reliability 3A). */
export const LONG_GAP_FORCE_UNKNOWN_MS = LOCATION_GAP_MIN_MS;

export const MAX_MOTION_STATE_TRANSITIONS = 100;
