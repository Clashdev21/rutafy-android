/**
 * Handoff mínimo Messenger BG → Operator BG.
 * No es un Location Engine: solo libera rutafy-background-location y reclama
 * ownership para que Journey pueda registrar rutafy-operator-tracking.
 */

import {
  noteBackgroundTrackingExternallyStopped,
  restoreBackgroundTrackingIfRequested,
  stopBackgroundLocation,
  suppressMessengerBackgroundRestore,
} from '@/services/backgroundLocationService';
import { isMessengerBackgroundTrackingStarted } from '@/utils/operatorTrackingGuards';
import {
  getJourneyCaptureOwnsLocation,
  logLocationOwnership,
  setJourneyCaptureOwnsLocation,
} from '@/utils/locationOwnershipState';

let handoffInFlight: Promise<boolean> | null = null;

/**
 * Reclama ownership de Journey y detiene Messenger BG si está activo.
 * Si Operator aún no arrancó, el flag impide que Messenger se restaure.
 * Fallo al detener Messenger → false; no se fabrica captura.
 */
export async function handoffMessengerBackgroundIfNeeded(): Promise<boolean> {
  if (handoffInFlight) return handoffInFlight;

  const run = (async (): Promise<boolean> => {
    const alreadyClaimed = getJourneyCaptureOwnsLocation();
    setJourneyCaptureOwnsLocation(true);

    const messengerActive = await isMessengerBackgroundTrackingStarted();
    if (!alreadyClaimed || messengerActive) {
      logLocationOwnership('LOCATION_HANDOFF', {
        phase: 'begin',
        from: 'messenger',
        to: 'operator',
      });
    }

    if (!messengerActive) {
      noteBackgroundTrackingExternallyStopped();
      return true;
    }

    logLocationOwnership('LOCATION_OWNER', { owner: 'messenger' });
    await stopBackgroundLocation();
    noteBackgroundTrackingExternallyStopped();

    const stillActive = await isMessengerBackgroundTrackingStarted();
    if (stillActive) {
      logLocationOwnership('LOCATION_HANDOFF', {
        phase: 'operator_start_failed',
        reason: 'messenger_stop_failed',
      });
      return false;
    }

    logLocationOwnership('LOCATION_HANDOFF', { phase: 'messenger_stopped' });
    return true;
  })();

  handoffInFlight = run;
  try {
    return await run;
  } finally {
    if (handoffInFlight === run) {
      handoffInFlight = null;
    }
  }
}

/**
 * RELEASE_BECAUSE_JOURNEY_FINISHED.
 * Suelta el ownership y puede restaurar Messenger si el último pedido
 * del usuario autenticado era tenerlo activo.
 */
export async function releaseJourneyLocationAndRestoreMessenger(): Promise<boolean> {
  // El cierre de UI y el stop de bootstrap pueden coincidir. Si Journey ya
  // soltó Location, no se vuelve a restaurar Messenger.
  if (!getJourneyCaptureOwnsLocation()) {
    return false;
  }
  setJourneyCaptureOwnsLocation(false);
  logLocationOwnership('LOCATION_RELEASE', { owner: 'operator', reason: 'journey_finished' });
  const restored = await restoreBackgroundTrackingIfRequested();
  if (restored) {
    logLocationOwnership('LOCATION_OWNER', { owner: 'messenger', restored: true });
  }
  return restored;
}

/**
 * RELEASE_BECAUSE_AUTH_LOST.
 * Suelta el ownership y deja Messenger apagado. No consulta
 * lastRequestedEnabled para volver a arrancarlo.
 */
export async function releaseJourneyLocationBecauseAuthLost(): Promise<void> {
  if (getJourneyCaptureOwnsLocation()) {
    logLocationOwnership('LOCATION_RELEASE', { owner: 'operator', reason: 'auth_loss' });
  }
  setJourneyCaptureOwnsLocation(false);
  suppressMessengerBackgroundRestore();
  await stopBackgroundLocation();
}

export function resetLocationOwnershipHandoffForTests(): void {
  handoffInFlight = null;
}
