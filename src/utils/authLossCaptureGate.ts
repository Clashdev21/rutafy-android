import {
  clearAuthenticatedIdentity,
  getAuthenticatedIdentity,
  setAuthenticatedIdentity,
} from '@/auth/authenticatedIdentity';
import type { AuthUser } from '@/types/auth';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import { isStoredTrackingSessionOwnedByUser } from '@/utils/trackingSessionIdentity';

/**
 * Pérdida confirmada de auth.
 * Bloquea observaciones Operator nuevas y la restauración de Messenger.
 * No borra la cola ni la TrackingSession local.
 *
 * La renovación válida del access token y un fallo transitorio de refresh
 * no activan estas banderas.
 */
let blockNewOperatorObservations = false;
let blockMessengerRestore = false;
const foregroundStoppers = new Set<() => void>();

export function markAuthLossCaptureBlocked(): void {
  blockNewOperatorObservations = true;
  blockMessengerRestore = true;
}

export function isNewOperatorObservationBlocked(): boolean {
  return blockNewOperatorObservations;
}

export function isMessengerBackgroundRestoreBlocked(): boolean {
  return blockMessengerRestore;
}

/** Login o restore con identidad válida. No reanuda Operator. */
export function allowMessengerBackgroundAfterAuthenticatedSession(): void {
  blockMessengerRestore = false;
}

/** Solo el arranque autorizado de Operator, cuando el dueño coincide. */
export function allowNewOperatorObservationsAfterAuthorizedStart(): void {
  blockNewOperatorObservations = false;
}

export function refreshStatusRequiresLocationShutdown(
  status: 'success' | 'network_error' | 'auth_invalid',
): boolean {
  return status === 'auth_invalid';
}

export function registerForegroundCaptureStopper(stop: () => void): () => void {
  foregroundStoppers.add(stop);
  return () => {
    foregroundStoppers.delete(stop);
  };
}

export function runForegroundCaptureStoppers(): void {
  for (const stop of foregroundStoppers) {
    try {
      stop();
    } catch {
      // Un watcher ya desmontado no impide el resto del shutdown.
    }
  }
}

export function adoptAuthenticatedIdentity(user: AuthUser): void {
  setAuthenticatedIdentity(user);
  allowMessengerBackgroundAfterAuthenticatedSession();
}

export function dropAuthenticatedIdentity(): void {
  clearAuthenticatedIdentity();
}

/**
 * false si la captura está quiesced o si hay una identidad conocida que
 * no es dueña de la sesión. Sin identidad y sin quiesce se mantiene el
 * camino del token: un refresh válido no se trata como logout.
 */
export async function currentIdentityMayUploadOperatorSession(
  sessionId: string,
): Promise<boolean> {
  if (blockNewOperatorObservations) return false;
  const identity = getAuthenticatedIdentity();
  if (!identity) return true;
  const stored = await trackingSessionStorage.getActive();
  if (!stored || stored.sessionId !== sessionId) return false;
  return isStoredTrackingSessionOwnedByUser(stored, identity);
}

export function resetAuthLossCaptureGateForTests(): void {
  blockNewOperatorObservations = false;
  blockMessengerRestore = false;
  foregroundStoppers.clear();
}
