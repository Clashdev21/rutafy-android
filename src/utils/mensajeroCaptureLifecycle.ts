import type { AuthUser } from '@/types/auth';
import type { TrackingSession } from '@/types/tracking';
import {
  endTrackingSession,
  fetchMyTrackingSessions,
  fetchTrackingSession,
  startTrackingSession,
} from '@/services/trackingSessionService';
import {
  ensureOperatorBackgroundTracking,
  stopOperatorTrackingAsync,
} from '@/services/operatorTrackingService';
import { operatorTrackingHealthStorage } from '@/storage/operatorTrackingHealthStorage';
import { operatorTrackingPendingQueue } from '@/storage/operatorTrackingPendingQueue';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import {
  buildTrackingStartParams,
  mensajeroStartSingleFlight,
} from '@/utils/mensajeroStartFlow';
import {
  isTransientNetworkError,
  isTransientServerError,
} from '@/utils/networkErrors';
import {
  buildStoredTrackingSession,
  cleanupLocalTrackingSession,
  isActiveSessionExistsError,
  getExistingSessionIdFromStartConflict,
  isStoredTrackingSessionOwnedByUser,
  isTrackingSessionForbiddenOrNotFound,
  isTrackingSessionNotActiveError,
} from '@/utils/trackingSessionOwnership';
import { resetOperatorIngestionForSession } from '@/utils/operatorIngestionCoordinator';
import { resetSpeedTelemetryForNewSession } from '@/utils/speedTelemetryObserver';
import { resetTrackingPipelineForNewSession } from '@/utils/trackingPipelineObserver';
import { startMotionTelemetryForSession } from '@/services/motionTelemetryService';
import type { BootstrapStartOutcome } from '@/utils/mensajeroBootstrapCoordinator';
import type { MensajeroStopExecution } from '@/utils/mensajeroStopFlow';

const DEFAULT_METADATA = { source: 'android_mvp' as const };

async function persistNewActiveSession(session: TrackingSession, user: AuthUser, vehicleLabel: string) {
  const stored = buildStoredTrackingSession(session, user, vehicleLabel);
  await operatorTrackingHealthStorage.clear();
  await operatorTrackingPendingQueue.clear();
  await trackingSessionStorage.setActive(stored);
  resetSpeedTelemetryForNewSession(stored.sessionId);
  resetTrackingPipelineForNewSession(stored.sessionId);
  resetOperatorIngestionForSession(stored.sessionId);
  void startMotionTelemetryForSession(stored.sessionId);
  await ensureOperatorBackgroundTracking();
  return stored;
}

export async function findExistingActiveTrackingSessionId(
  preferredId?: string | null,
): Promise<string | null> {
  const preferred = preferredId?.trim() || null;
  if (preferred) return preferred;
  try {
    const list = await fetchMyTrackingSessions();
    const active = list.find((row) => row.status === 'active');
    return active?.id?.trim() || null;
  } catch {
    return null;
  }
}

export async function runMensajeroStartWithJourney(input: {
  user: AuthUser;
  journeyId: string;
  vehicleLabel: string;
  existingMetadata?: Record<string, unknown> | null;
}): Promise<BootstrapStartOutcome> {
  const result = await mensajeroStartSingleFlight.run(async (): Promise<BootstrapStartOutcome> => {
    const local = await trackingSessionStorage.getActive();
    if (local?.sessionId) {
      await ensureOperatorBackgroundTracking();
      return { status: 'started', sessionId: local.sessionId };
    }

    const params = buildTrackingStartParams({
      vehicleLabel: input.vehicleLabel,
      consentAccepted: true,
      existingMetadata: input.existingMetadata ?? DEFAULT_METADATA,
      journeyId: input.journeyId,
    });
    if ('error' in params) {
      return { status: 'skipped' };
    }

    try {
      const session = await startTrackingSession(params);
      const stored = await persistNewActiveSession(session, input.user, params.vehicle_label);
      return { status: 'started', sessionId: stored.sessionId };
    } catch (error) {
      if (isActiveSessionExistsError(error)) {
        const existingId = await findExistingActiveTrackingSessionId(
          getExistingSessionIdFromStartConflict(error),
        );
        if (existingId) {
          return { status: 'recovered_existing', sessionId: existingId };
        }
      }
      throw error;
    }
  });

  if (result.status === 'skipped') {
    return { status: 'skipped' };
  }
  return result.value;
}

export async function runMensajeroHydrateCapture(input: {
  sessionId: string;
  user: AuthUser;
}): Promise<void> {
  const sessionId = input.sessionId.trim();
  if (!sessionId) return;

  const localRaw = await trackingSessionStorage.getActive();
  // Una sesión local de otro usuario no se reclama ni se reanuda.
  const local =
    localRaw && isStoredTrackingSessionOwnedByUser(localRaw, input.user) ? localRaw : null;
  if (local?.sessionId === sessionId) {
    await ensureOperatorBackgroundTracking();
    return;
  }

  let remote: TrackingSession | null = null;
  try {
    remote = await fetchTrackingSession(sessionId);
  } catch (error) {
    if (isTrackingSessionForbiddenOrNotFound(error)) {
      if (local?.sessionId === sessionId) {
        await cleanupLocalTrackingSession('remote_forbidden');
      }
      return;
    }
    if (isTransientNetworkError(error) || isTransientServerError(error)) {
      if (local?.sessionId === sessionId) {
        await ensureOperatorBackgroundTracking();
      }
      return;
    }
    throw error;
  }

  if (!remote || remote.status !== 'active') {
    if (local?.sessionId === sessionId) {
      await cleanupLocalTrackingSession('remote_inactive');
    }
    return;
  }

  const hydrated = buildStoredTrackingSession(
    remote,
    input.user,
    remote.vehicle_label || local?.vehicleLabel || 'Unidad operativa',
  );
  await trackingSessionStorage.setActive(hydrated);
  resetSpeedTelemetryForNewSession(hydrated.sessionId);
  resetTrackingPipelineForNewSession(hydrated.sessionId);
  resetOperatorIngestionForSession(hydrated.sessionId);
  void startMotionTelemetryForSession(hydrated.sessionId);
  await ensureOperatorBackgroundTracking();
}

export async function runMensajeroStopCapture(
  sessionId: string | null,
): Promise<MensajeroStopExecution> {
  const local = await trackingSessionStorage.getActive();
  const targetId = sessionId?.trim() || local?.sessionId || null;
  if (!targetId) {
    return 'already_stopped';
  }

  try {
    await stopOperatorTrackingAsync();
    await endTrackingSession(targetId);
    await cleanupLocalTrackingSession('capture_closed');
    return 'stopped';
  } catch (error) {
    if (isTrackingSessionNotActiveError(error) || isTrackingSessionForbiddenOrNotFound(error)) {
      await cleanupLocalTrackingSession('session_not_active');
      return 'already_stopped';
    }
    if (isTransientNetworkError(error) || isTransientServerError(error)) {
      return 'preserved_offline';
    }
    throw error;
  }
}
