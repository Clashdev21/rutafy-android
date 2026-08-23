/**
 * Umbrales DIAGNÓSTICOS / EXPERIMENTALES para gaps de tracking (Reliability 3A).
 * NO usar en lógica operacional, Journey ni ETA.
 */

import { MAX_PLAUSIBLE_ROAD_SPEED_KMH } from '@/types/speedQuality';

/** Gap temporal mínimo entre fixes válidos para registrar candidato. */
export const LOCATION_GAP_MIN_MS = 60_000;

/** Capacidad máxima de gaps en timeline por sesión. */
export const MAX_TRACKING_GAPS = 100;

/** Capacidad máxima de transiciones AppState por sesión. */
export const MAX_APP_STATE_TRANSITIONS = 50;

/**
 * Desplazamiento máximo (m) para considerar gap estacionario
 * cuando la señal espacial es confiable.
 */
export const STATIONARY_DISPLACEMENT_MAX_M = 30;

/** Desplazamiento mínimo (m) para sospechar movimiento. */
export const MOVEMENT_MIN_DISPLACEMENT_M = 100;

/** Velocidad implícita mínima (km/h) para movement_suspected. */
export const MOVEMENT_MIN_IMPLIED_SPEED_KMH = 8;

/** Techo de velocidad implícita plausible — reutiliza Speed 2A.2. */
export const MOVEMENT_MAX_IMPLIED_SPEED_KMH = MAX_PLAUSIBLE_ROAD_SPEED_KMH;

/**
 * Ratio mínimo displacement/combinedAccuracy para inferir movimiento.
 * Inspirado en WEAK_RATIO del Quality Gate (experimental).
 */
export const MIN_DISPLACEMENT_QUALITY_RATIO_FOR_MOVEMENT = 1.5;

/** Accuracy individual por encima de la cual la inferencia espacial es poco confiable. */
export const UNRELIABLE_SINGLE_ACCURACY_M = 200;
