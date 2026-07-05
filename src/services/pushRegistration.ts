import { tokenStorage } from '@/auth/tokenStorage';
import {
  registerDevicePushTokenAsync,
  type RegisterDeviceOptions,
} from '@/services/notificationService';
import type { AuthUser } from '@/types/auth';

export type PushRegisterSource = 'login' | 'restore_session' | 'register_transportista';

const registerInFlightByActor = new Map<string, Promise<void>>();

function pushRegisterLog(tag: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (detail && Object.keys(detail).length > 0) {
    console.log(tag, detail);
  } else {
    console.log(tag);
  }
}

function sessionGuardFields(user: AuthUser | null, accessToken: string | null) {
  const actorId = user?.actor_id?.trim() ?? '';
  const actorType = user?.actor_type?.trim() ?? '';
  return {
    hasAccessToken: Boolean(accessToken),
    hasUser: Boolean(user),
    actorId: actorId || null,
    actorType: actorType || null,
  };
}

/**
 * Único punto de entrada para registrar el device push tras sesión válida.
 */
export async function registerPushIfSessionReady(
  user: AuthUser | null,
  source: PushRegisterSource,
): Promise<void> {
  const accessToken = await tokenStorage.getAccessToken();
  const fields = sessionGuardFields(user, accessToken);

  if (!fields.hasAccessToken || !fields.hasUser || !fields.actorId || !fields.actorType) {
    pushRegisterLog('[push-register-skip-no-session]', { ...fields, source });
    return;
  }

  const actorId = fields.actorId;
  const inFlight = registerInFlightByActor.get(actorId);
  if (inFlight) {
    pushRegisterLog('[push-register-skip-no-session]', {
      ...fields,
      source,
      reason: 'register_in_flight',
    });
    return inFlight;
  }

  pushRegisterLog('[push-register-session-ready]', {
    ...fields,
    source,
  });

  const options: RegisterDeviceOptions = {
    source,
    actorId,
    actorType: fields.actorType,
  };

  const registration = registerDevicePushTokenAsync(options).finally(() => {
    registerInFlightByActor.delete(actorId);
  });

  registerInFlightByActor.set(actorId, registration);
  return registration;
}
