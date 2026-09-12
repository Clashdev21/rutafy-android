import type { AuthUser } from '../types/auth.ts';
import type { StoredTrackingSession, TrackingSession } from '../types/tracking.ts';

function normId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Política 3B: una sesión local solo se hidrata si user_id, actor_id y actor_type
 * coinciden. Sesiones legacy sin ownership no se reclaman.
 */
export function isStoredTrackingSessionOwnedByUser(
  stored: StoredTrackingSession,
  user: AuthUser | null,
): boolean {
  if (!user) return false;

  const ownerUserId = normId(stored.ownerUserId);
  const actorId = normId(stored.actorId);
  if (!ownerUserId || !actorId) return false;

  const currentUserId = normId(user.user_id);
  const currentActorId = normId(user.actor_id);
  if (ownerUserId !== currentUserId) return false;
  if (actorId !== currentActorId) return false;

  return normId(stored.actorType) === normId(user.actor_type);
}

export function buildStoredTrackingSession(
  session: TrackingSession,
  user: AuthUser,
  vehicleLabelFallback: string,
): StoredTrackingSession {
  const ownerUserId = normId(session.owner_user_id) ?? normId(user.user_id);
  const actorId = normId(session.actor_id) ?? normId(user.actor_id);
  if (!ownerUserId || !actorId) {
    throw new Error('La sesión de captura no incluye datos de propietario válidos');
  }

  return {
    sessionId: session.id,
    ownerUserId,
    actorId,
    actorType: normId(session.actor_type) ?? normId(user.actor_type),
    purpose: session.purpose,
    vehicleLabel: session.vehicle_label || vehicleLabelFallback,
    startedAt: session.started_at ?? new Date().toISOString(),
  };
}
