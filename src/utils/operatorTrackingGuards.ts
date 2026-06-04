import * as Location from 'expo-location';

import * as mensajeroService from '@/services/mensajeroService';
import { BACKGROUND_LOCATION_TASK_NAME } from '@/services/backgroundLocationTask';
import {
  isMensajeroOperationalActive,
  pickMensajeroActiveService,
} from '@/utils/serviceStatus';

export const OPERATOR_CAPTURE_CONFLICT_MESSAGE =
  'No puedes iniciar captura logística durante un servicio activo.';

export async function isMessengerBackgroundTrackingStarted(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}

export async function assertCanStartOperatorCapture(
  actorId: string | null,
  appRole: 'ADMIN' | 'TRANSPORTISTA' | 'MENSAJERO' | null,
): Promise<void> {
  if (await isMessengerBackgroundTrackingStarted()) {
    throw new Error(OPERATOR_CAPTURE_CONFLICT_MESSAGE);
  }

  if (appRole !== 'MENSAJERO' || !actorId?.trim()) {
    return;
  }

  const services = await mensajeroService.fetchMyServices(actorId.trim());
  const active = pickMensajeroActiveService(services);
  if (isMensajeroOperationalActive(active)) {
    throw new Error(OPERATOR_CAPTURE_CONFLICT_MESSAGE);
  }
}
