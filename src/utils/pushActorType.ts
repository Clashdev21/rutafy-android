import type { AuthUser } from '@/types/auth';
import { isAdminRole } from '@/utils/roles';

function normalizeActorType(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'messenger' || raw === 'mensajero') return 'messenger';
  if (raw === 'transporter' || raw === 'transportista') return 'transporter';
  return raw;
}

/**
 * Deriva actor_type para registro push cuando /me no lo incluye.
 */
export function derivePushActorType(user: AuthUser | null): string | null {
  if (!user || isAdminRole(user.appRole)) return null;

  const fromUser = normalizeActorType(user.actor_type);
  if (fromUser) return fromUser;

  if (user.appRole === 'MENSAJERO') return 'messenger';
  if (user.appRole === 'TRANSPORTISTA') return 'transporter';

  return null;
}
