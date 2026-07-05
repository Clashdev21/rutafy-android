import axios from 'axios';

import { stopOperatorTrackingAsync } from '@/services/operatorTrackingService';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { AuthUser } from '@/types/auth';
import type { StoredTrackingSession, TrackingSession } from '@/types/tracking';

function normId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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

export function isTrackingSessionForbiddenOrNotFound(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 403 || status === 404;
}

export async function cleanupLocalTrackingSession(reason: string): Promise<void> {
  if (__DEV__) {
    console.log('[tracking-cleanup-local]', { reason });
  }
  await stopOperatorTrackingAsync();
  await trackingSessionStorage.clearActive();
}

export async function clearActiveTrackingSession(
  reason: 'owner_mismatch' | 'remote_inactive' | 'remote_forbidden',
): Promise<void> {
  if (reason === 'owner_mismatch' && __DEV__) {
    console.log('[tracking-session-owner-mismatch]');
  }

  await cleanupLocalTrackingSession(reason);

  if (__DEV__) {
    console.log('[tracking-session-storage-cleared]', { reason });
  }
}

export function isTrackingSessionNotActiveError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (error.response?.status !== 409) return false;
    const data = error.response.data as { error?: string; code?: string; message?: string };
    const token = [data?.error, data?.code, data?.message]
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    return token.includes('session_not_active');
  }
  if (error instanceof Error) {
    return error.message.includes('session_not_active');
  }
  return false;
}
