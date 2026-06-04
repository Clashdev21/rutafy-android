export type MensajeroOperationalUiState =
  | 'OFFLINE'
  | 'AVAILABLE'
  | 'OFFER'
  | 'ASSIGNED'
  | 'IN_SERVICE';

/** Intervalos de polling HTTP del mensajero por estado operacional (ms). 0 = deshabilitado. */
export const MENSAJERO_POLL_INTERVALS = {
  offersAvailableMs: 15000,
  servicesAvailableMs: 30000,
  offersOfferMs: 12000,
  servicesOfferMs: 20000,
  activeServiceMs: 15000,
} as const;

export type MensajeroPollConfig = {
  offersMs: number;
  servicesMs: number;
  offersEnabled: boolean;
  servicesEnabled: boolean;
};

export function getMensajeroPollConfig(uiState: MensajeroOperationalUiState): MensajeroPollConfig {
  switch (uiState) {
    case 'OFFLINE':
      return { offersMs: 0, servicesMs: 0, offersEnabled: false, servicesEnabled: false };
    case 'AVAILABLE':
      return {
        offersMs: MENSAJERO_POLL_INTERVALS.offersAvailableMs,
        servicesMs: MENSAJERO_POLL_INTERVALS.servicesAvailableMs,
        offersEnabled: true,
        servicesEnabled: true,
      };
    case 'OFFER':
      return {
        offersMs: MENSAJERO_POLL_INTERVALS.offersOfferMs,
        servicesMs: MENSAJERO_POLL_INTERVALS.servicesOfferMs,
        offersEnabled: true,
        servicesEnabled: true,
      };
    case 'ASSIGNED':
    case 'IN_SERVICE':
      return {
        offersMs: MENSAJERO_POLL_INTERVALS.activeServiceMs,
        servicesMs: MENSAJERO_POLL_INTERVALS.activeServiceMs,
        offersEnabled: true,
        servicesEnabled: true,
      };
    default:
      return { offersMs: 0, servicesMs: 0, offersEnabled: false, servicesEnabled: false };
  }
}
