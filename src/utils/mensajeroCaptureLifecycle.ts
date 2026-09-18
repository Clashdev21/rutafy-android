import type { AuthUser } from '@/types/auth';
import type { TrackingSession } from '@/types/tracking';
import {
  endTrackingSession,
  fetchMyTrackingSessions,
  fetchTrackingSession,
  resumeTrackingSession,
  startTrackingSession,
} from '@/services/trackingSessionService';
import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import {
  ensureOperatorBackgroundTracking,
  stopOperatorTrackingAsync,
} from '@/services/operatorTrackingService';
import { operatorTrackingHealthStorage } from '@/storage/operatorTrackingHealthStorage';
import { operatorTrackingPendingQueue } from '@/storage/operatorTrackingPendingQueue';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import {
  buildTrackingStartParams,
  mensajeroResumeSingleFlight,
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
import {
  decideCaptureResumeFollowUp,
  mapResumeHttpErrorToHydrateOutcome,
} from '@/utils/trackingSessionErrors';
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

async function persistHydratedSession(
  remote: TrackingSession,
  user: AuthUser,
  fallbackVehicleLabel: string | undefined,
): Promise<void> {
  const hydrated = buildStoredTrackingSession(
    remote,
    user,
    remote.vehicle_label || fallbackVehicleLabel || 'Unidad operativa',
  );
  await trackingSessionStorage.setActive(hydrated);
  resetSpeedTelemetryForNewSession(hydrated.sessionId);
  resetTrackingPipelineForNewSession(hydrated.sessionId);
  resetOperatorIngestionForSession(hydrated.sessionId);
  void startMotionTelemetryForSession(hydrated.sessionId);
}

async function enableCaptureAfterResume(input: {
  sessionId: string;
  user: AuthUser;
  local: Awaited<ReturnType<typeof trackingSessionStorage.getActive>>;
  resumed: TrackingSession | null;
}): Promise<void> {
  let remote = input.resumed;
  if (!remote || remote.status !== 'active') {
    try {
      remote = await fetchTrackingSession(input.sessionId);
    } catch (error) {
      if (isTrackingSessionForbiddenOrNotFound(error)) {
        if (input.local?.sessionId === input.sessionId) {
          await cleanupLocalTrackingSession('remote_forbidden');
        }
        return;
      }
      if (isTransientNetworkError(error) || isTransientServerError(error)) {
        if (input.local?.sessionId === input.sessionId) {
          await ensureOperatorBackgroundTracking();
        }
        return;
      }
      throw error;
    }
  }

  if (!remote || remote.status !== 'active') {
    if (input.local?.sessionId === input.sessionId) {
      await cleanupLocalTrackingSession('remote_inactive');
    }
    return;
  }

  if (input.local?.sessionId !== input.sessionId) {
    await persistHydratedSession(remote, input.user, input.local?.vehicleLabel);
  }
  await ensureOperatorBackgroundTracking();
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
  const hasMatchingLocalSession = local?.sessionId === sessionId;

  const flight = await mensajeroResumeSingleFlight.run(async () => {
    try {
      const resumed = await resumeTrackingSession(sessionId);
      recordTrackingDiagnostic(
        'tracking-resume',
        { sessionId, sameLocalSession: hasMatchingLocalSession },
        sessionId,
      );
      return { outcome: 'ok' as const, resumed };
    } catch (error) {
      const mapped = mapResumeHttpErrorToHydrateOutcome(error);
      if (mapped) {
        return { outcome: mapped, resumed: null };
      }
      if (isTrackingSessionForbiddenOrNotFound(error)) {
        return { outcome: 'forbidden' as const, resumed: null };
      }
      if (isTransientNetworkError(error) || isTransientServerError(error)) {
        return { outcome: 'transient' as const, resumed: null };
      }
      throw error;
    }
  });

  const resumeOutcome =
    flight.status === 'skipped' ? 'skipped' : flight.value.outcome;
  const followUp = decideCaptureResumeFollowUp({
    resumeOutcome,
    hasMatchingLocalSession,
  });

  if (followUp === 'cleanup') {
    const cleanupReason =
      resumeOutcome === 'writer_conflict'
        ? 'writer_conflict'
        : resumeOutcome === 'inactive'
          ? 'session_not_active'
          : 'remote_forbidden';
    recordTrackingDiagnostic(
      resumeOutcome === 'writer_conflict'
        ? 'writer-conflict'
        : resumeOutcome === 'inactive'
          ? 'tracking-session-inactive'
          : 'tracking-resume-denied',
      { source: 'hydrate', sessionId, resumeOutcome },
      sessionId,
    );
    await cleanupLocalTrackingSession(cleanupReason);
    return;
  }

  if (followUp === 'preserve_offline') {
    await ensureOperatorBackgroundTracking();
    return;
  }

  if (followUp === 'abort') {
    return;
  }

  await enableCaptureAfterResume({
    sessionId,
    user: input.user,
    local,
    resumed: flight.status === 'ran' && flight.value.outcome === 'ok' ? flight.value.resumed : null,
  });
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
