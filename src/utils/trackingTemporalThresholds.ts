/**
 * Umbrales DIAGNÓSTICOS para pertenencia temporal de fixes a sesión (Tracking 3A).
 * NO alteran sampling GPS ni lógica operacional de captura.
 */

/** Tolerancia antes del inicio oficial de sesión (async lifecycle / clock skew). */
export const SESSION_FIX_EARLY_TOLERANCE_MS = 5_000;

/** Máximo skew futuro aceptable respecto a now del dispositivo. */
export const MAX_FUTURE_FIX_SKEW_MS = 30_000;
