import { getOperationalBootstrap } from '@/services/operationalBootstrapService';
import { operatorCaptureConsentStorage } from '@/storage/operatorCaptureConsentStorage';
import { mensajeroBootstrapStorage } from '@/storage/mensajeroBootstrapStorage';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import {
  assertCanStartOperatorCapture,
  isMessengerBackgroundTrackingStarted,
} from '@/utils/operatorTrackingGuards';
import { isOperatorTrackingStartedAsync } from '@/services/operatorTrackingService';
import { isStoredTrackingSessionOwnedByUser } from '@/utils/trackingSessionOwnership';
import {
  mensajeroBootstrapSingleFlight,
  runOperationalBootstrapCycle,
  type BootstrapCycleDeps,
  type BootstrapCycleResult,
} from '@/utils/mensajeroBootstrapCoordinator';
import { mensajeroStartSingleFlight } from '@/utils/mensajeroStartFlow';
import {
  runMensajeroHydrateCapture,
  runMensajeroStartWithJourney,
  runMensajeroStopCapture,
} from '@/utils/mensajeroCaptureLifecycle';
import type { AuthUser } from '@/types/auth';
import type { MensajeroBootstrapSource } from '@/types/operationalBootstrap';

/**
 * Un solo set de deps: el ciclo de re-bootstrap (409 recovery) reusa exactamente
 * los mismos owners de sesión/consent que el ciclo inicial.
 */
function buildCycleDeps(user: AuthUser): BootstrapCycleDeps {
  return {
    fetchBootstrap: getOperationalBootstrap,
    getLocalSessionId: async () => {
      const local = await trackingSessionStorage.getActive();
      if (!local) return null;
      // Sesión de otro usuario no cuenta como captura local del actual.
      if (!isStoredTrackingSessionOwnedByUser(local, user)) return null;
      return local.sessionId;
    },
    isCaptureActive: isOperatorTrackingStartedAsync,
    hasConsent: () => operatorCaptureConsentStorage.hasAccepted(user.user_id),
    // 3B manda: el heartbeat GPS del servicio activo es dueño del task nativo.
    canStartOperatorGps: async () => {
      if (await isMessengerBackgroundTrackingStarted()) return false;
      try {
        await assertCanStartOperatorCapture(user.actor_id?.trim() ?? null, user.appRole);
        return true;
      } catch {
        return false;
      }
    },
    isStartBusy: () => mensajeroStartSingleFlight.isBusy(),
    getPersisted: () => mensajeroBootstrapStorage.get(user.user_id),
    persist: (snapshot) => mensajeroBootstrapStorage.set(user.user_id, snapshot),
    startWithJourney: ({ journeyId, vehicleLabel }) =>
      runMensajeroStartWithJourney({ user, journeyId, vehicleLabel }),
    hydrateSession: (sessionId) => runMensajeroHydrateCapture({ sessionId, user }),
    stopCapture: runMensajeroStopCapture,
    nowIso: () => new Date().toISOString(),
  };
}

export async function syncMensajeroOperationalBootstrap(input: {
  user: AuthUser;
  source: MensajeroBootstrapSource;
  force?: boolean;
  now?: number;
}): Promise<BootstrapCycleResult> {
  return mensajeroBootstrapSingleFlight.run(
    {
      force:
        input.force ||
        input.source === 'session_ready' ||
        input.source === 'reconnect',
      now: input.now,
    },
    async () => {
      const deps = buildCycleDeps(input.user);
      const result = await runOperationalBootstrapCycle(deps);

      if (__DEV__) {
        console.log('[mensajero-bootstrap]', {
          source: input.source,
          action: result.bootstrap?.action ?? null,
          reason: result.bootstrap?.reason ?? null,
          decision: result.decision.type,
          fetchError: result.fetchError,
        });
      }

      if (result.shouldRebootstrap) {
        return runOperationalBootstrapCycle(deps);
      }

      return result;
    },
  );
}
