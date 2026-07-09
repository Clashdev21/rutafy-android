import { getValidAccessToken } from '@/auth/accessTokenManager';
import { tokenStorage } from '@/auth/tokenStorage';
import { canAttemptPushRegister, recordPushDiagnostic } from '@/services/pushDiagnostics';
import {
  registerDevicePushTokenAsync,
  type RegisterDeviceOptions,
} from '@/services/notificationService';
import type { AuthUser } from '@/types/auth';
import { derivePushActorType } from '@/utils/pushActorType';
import { isAdminRole } from '@/utils/roles';

export type PushRegisterSource =
  | 'login'
  | 'restore_session'
  | 'register_transportista'
  | 'app_foreground'
  | 'manual_debug';

const registerInFlightByActor = new Map<string, Promise<void>>();

function pushRegisterLog(tag: string, detail?: Record<string, unknown>): void {
  if (detail && Object.keys(detail).length > 0) {
    console.log(tag, detail);
  } else {
    console.log(tag);
  }
}

/**
 * Único punto de entrada para registrar el device push tras sesión válida.
 */
export async function registerPushIfSessionReady(
  user: AuthUser | null,
  source: PushRegisterSource,
): Promise<void> {
  if (!user || isAdminRole(user.appRole)) {
    recordPushDiagnostic('push-register-skip-no-session', {
      reason: 'no_user_or_admin',
      source,
    });
    return;
  }

  const actorId = user.actor_id?.trim() ?? '';
  const actorType = derivePushActorType(user);

  if (!actorId) {
    recordPushDiagnostic('push-register-skip-no-session', {
      reason: 'missing_actor_id',
      source,
      actorType,
    });
    pushRegisterLog('[push-register-skip-no-session]', { reason: 'missing_actor_id', source });
    return;
  }

  if (!actorType) {
    recordPushDiagnostic('push-register-skip-no-session', {
      reason: 'missing_actor_type',
      source,
      actorId,
      appRole: user.appRole,
    });
    pushRegisterLog('[push-register-skip-no-session]', {
      reason: 'missing_actor_type',
      source,
      actorId,
      appRole: user.appRole,
    });
    return;
  }

  const allowed = await canAttemptPushRegister(source);
  if (!allowed) {
    pushRegisterLog('[push-register-skip-no-session]', {
      reason: 'throttled',
      source,
      actorId,
      actorType,
    });
    return;
  }

  const refresh = await tokenStorage.getRefreshToken();
  const accessToken = await getValidAccessToken({ source: `push_${source}` });
  if (!accessToken && !refresh) {
    recordPushDiagnostic('push-register-skip-no-session', {
      reason: 'no_session_tokens',
      source,
      actorId,
      actorType,
    });
    pushRegisterLog('[push-register-skip-no-session]', {
      reason: 'no_session_tokens',
      source,
      actorId,
      actorType,
    });
    return;
  }

  const inFlight = registerInFlightByActor.get(actorId);
  if (inFlight) {
    pushRegisterLog('[push-register-skip-no-session]', {
      reason: 'register_in_flight',
      source,
      actorId,
      actorType,
    });
    return inFlight;
  }

  pushRegisterLog('[push-register-session-ready]', {
    source,
    actorId,
    actorType,
    hasAccessToken: Boolean(accessToken),
  });

  const options: RegisterDeviceOptions = {
    source,
    actorId,
    actorType,
  };

  const registration = registerDevicePushTokenAsync(options).finally(() => {
    registerInFlightByActor.delete(actorId);
  });

  registerInFlightByActor.set(actorId, registration);
  return registration;
}

export async function retryPushRegistrationManual(user: AuthUser | null): Promise<void> {
  return registerPushIfSessionReady(user, 'manual_debug');
}
