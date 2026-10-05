/**
 * Suscripción de Rutafy que produjo la observación.
 * No es el proveedor de Android (GPS, red o fused).
 */
export const TRACKING_REQUEST_SOURCE = {
  operatorBackgroundHigh: 'operator_background_high',
  operatorForegroundBalanced: 'operator_foreground_balanced',
} as const;

export type TrackingRequestSource =
  (typeof TRACKING_REQUEST_SOURCE)[keyof typeof TRACKING_REQUEST_SOURCE];
