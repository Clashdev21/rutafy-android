export const CLOSE_AVAILABILITY_WARNING =
  'El servicio ya está cerrado. No se pudo restaurar la disponibilidad en línea.';

export type CloseRecoveryResult = {
  availabilityOk: boolean;
  availabilityWarning: string | null;
  didRefreshMyServices: boolean;
};

/**
 * Tras close 2xx, CLOSED es autoridad. refreshMyServices corre siempre,
 * incluso si PATCH availability falla. Ese fallo no puede dejar IN_SERVICE.
 */
export async function recoverAfterCloseSuccess(params: {
  patchAvailabilityAvailable: () => Promise<void>;
  refreshMyServices: () => Promise<void>;
}): Promise<CloseRecoveryResult> {
  let availabilityOk = false;
  let availabilityWarning: string | null = null;

  try {
    await params.patchAvailabilityAvailable();
    availabilityOk = true;
  } catch {
    availabilityOk = false;
    availabilityWarning = CLOSE_AVAILABILITY_WARNING;
  }

  await params.refreshMyServices();
  return {
    availabilityOk,
    availabilityWarning,
    didRefreshMyServices: true,
  };
}
