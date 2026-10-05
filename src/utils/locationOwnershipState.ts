/**
 * Ownership de Location entre Messenger heartbeat y Operator/Journey.
 *
 * Flag en memoria: se reclama ANTES de detener Messenger BG para cerrar la
 * ventana en la que un efecto de mensajero podría volver a arrancar
 * rutafy-background-location. El chequeo nativo cubre restart de proceso.
 */

import * as Location from 'expo-location';

/** Debe coincidir con OPERATOR_TRACKING_TASK_NAME (evita ciclo de imports). */
const OPERATOR_TASK_NAME = 'rutafy-operator-tracking';

let journeyCaptureOwnsLocation = false;

export function setJourneyCaptureOwnsLocation(owns: boolean): void {
  journeyCaptureOwnsLocation = owns === true;
}

export function getJourneyCaptureOwnsLocation(): boolean {
  return journeyCaptureOwnsLocation;
}

export async function isJourneyCaptureOwningLocation(): Promise<boolean> {
  if (journeyCaptureOwnsLocation) return true;
  try {
    return await Location.hasStartedLocationUpdatesAsync(OPERATOR_TASK_NAME);
  } catch {
    return false;
  }
}

export function logLocationOwnership(
  event: string,
  extra?: Record<string, unknown>,
): void {
  console.log('[location-ownership]', extra ? { event, ...extra } : { event });
}

export function resetLocationOwnershipStateForTests(): void {
  journeyCaptureOwnsLocation = false;
}
