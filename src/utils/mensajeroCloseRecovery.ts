export const CLOSE_AVAILABILITY_WARNING =
  'El servicio ya está cerrado. No se pudo restaurar la disponibilidad en línea.';

export type CloseRecoveryResult = {
  availabilityOk: boolean;
  availabilityWarning: string | null;
  didRefreshMyServices: boolean;
  didRestoreLocalOnline: boolean;
};

/**
 * Tras close 2xx, CLOSED es autoridad.
 * Si PATCH AVAILABLE responde 2xx, restaurar isOnline local ANTES de refresh,
 * para no pintar OFFLINE con el backend ya AVAILABLE.
 * Si PATCH falla, no forzar isOnline=true. refreshMyServices corre siempre.
 */
export async function recoverAfterCloseSuccess(params: {
  patchAvailabilityAvailable: () => Promise<void>;
  refreshMyServices: () => Promise<void>;
  restoreLocalOnline: () => void;
}): Promise<CloseRecoveryResult> {
  let availabilityOk = false;
  let availabilityWarning: string | null = null;
  let didRestoreLocalOnline = false;

  try {
    await params.patchAvailabilityAvailable();
    availabilityOk = true;
    params.restoreLocalOnline();
    didRestoreLocalOnline = true;
  } catch {
    availabilityOk = false;
    availabilityWarning = CLOSE_AVAILABILITY_WARNING;
  }

  await params.refreshMyServices();
  return {
    availabilityOk,
    availabilityWarning,
    didRefreshMyServices: true,
    didRestoreLocalOnline,
  };
}
