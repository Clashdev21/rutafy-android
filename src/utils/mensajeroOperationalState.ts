import type { MensajeroOperationalUiState } from '@/constants/mensajeroPollIntervals';

/**
 * Catálogo Android actual: solo POST /v1/service-offers/:id/accept.
 * No hay endpoint contractual de reject/decline.
 */
export const MENSAJERO_OFFER_REJECT_SUPPORTED = false;

/**
 * GET availability no existe en el catálogo Android (solo PATCH).
 * isOnline se mantiene local; el servicio activo manda sobre el toggle.
 */
export const MENSAJERO_AVAILABILITY_GET_SUPPORTED = false;

export function canHydrateMyServices(params: {
  canOperate: boolean;
  actorId: string | null | undefined;
}): boolean {
  return Boolean(params.canOperate && params.actorId);
}

/**
 * UI operacional del mensajero. El servicio activo (backend) manda sobre isOnline local.
 * STARTED → IN_SERVICE; CLAIMED → ASSIGNED; isOnline no oculta un CLAIMED/STARTED.
 *
 * Sprint 3C.4: NO mapear actions de operational-bootstrap a estos estados.
 * ASSIGNED/IN_SERVICE activan heartbeat GPS del mensajero, que bloquea captura logística.
 * Bootstrap se superpone como notice + start/hydrate/stop del tracking manager 3B.
 */
export function deriveMensajeroOperationalUiState(input: {
  activeServiceStatus: string | null | undefined;
  isOnline: boolean;
  hasFirstOffer: boolean;
  pushOfferActive?: boolean;
}): MensajeroOperationalUiState {
  const status = String(input.activeServiceStatus ?? '')
    .trim()
    .toUpperCase();
  const hasActiveOperational = status === 'STARTED' || status === 'CLAIMED';
  const effectiveIsOnline = input.isOnline || hasActiveOperational;
  const pushOfferActive = Boolean(input.pushOfferActive);

  if (status === 'STARTED') return 'IN_SERVICE';
  if (status === 'CLAIMED') return 'ASSIGNED';
  if ((effectiveIsOnline || pushOfferActive) && input.hasFirstOffer) return 'OFFER';
  if (!effectiveIsOnline) return 'OFFLINE';
  if (input.hasFirstOffer) return 'OFFER';
  return 'AVAILABLE';
}
