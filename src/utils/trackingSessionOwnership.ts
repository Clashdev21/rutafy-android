import axios from 'axios';

import { stopOperatorTrackingAsync } from '@/services/operatorTrackingService';
import {
  startMotionTelemetryForSession,
  stopMotionTelemetryForSession,
} from '@/services/motionTelemetryService';
import {
  endSessionMotionStateStatistics,
  endSessionSpeedStatistics,
  endSessionTrackingPipelineStatistics,
  recordTrackingDiagnostic,
  setSessionEndReason,
} from '@/services/trackingDiagnostics';
import { operatorTrackingPendingQueue } from '@/storage/operatorTrackingPendingQueue';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { TrackingSessionEndReason } from '@/types/trackingDiagnostics';
import { clearOperatorIngestion } from '@/utils/operatorIngestionCoordinator';
import { resetMotionStateObserver } from '@/utils/motionStateObserver';
import { resetSpeedTelemetryForNewSession, resetSpeedTelemetryPreviousFix } from '@/utils/speedTelemetryObserver';
import { resetTrackingPipelinePreviousFix } from '@/utils/trackingPipelineObserver';

export {
  buildStoredTrackingSession,
  isStoredTrackingSessionOwnedByUser,
} from './trackingSessionIdentity';

export function isTrackingSessionForbiddenOrNotFound(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 403 || status === 404;
}

function mapCleanupToEndReason(reason: string): TrackingSessionEndReason {
  if (reason.includes('session_not_active')) return 'session_not_active';
  if (reason === 'capture_closed') return 'user';
  if (reason === 'owner_mismatch' || reason.startsWith('remote_')) return 'cleanup';
  return 'cleanup';
}

export async function cleanupLocalTrackingSession(
  reason: string,
  options?: {
    /**
     * - always: borra cola (CANCEL, sesión muerta, start nueva)
     * - if-empty: solo si depth 0 (END exitoso)
     * - never: preserva pending (END timeout / fallo de drain)
     */
    pendingQueuePolicy?: 'always' | 'if-empty' | 'never';
  },
): Promise<void> {
  if (__DEV__) {
    console.log('[tracking-cleanup-local]', { reason, pendingQueuePolicy: options?.pendingQueuePolicy });
  }
  const endReason = mapCleanupToEndReason(reason);
  await setSessionEndReason(endReason);
  recordTrackingDiagnostic('tracking-cleanup', {
    reason,
    endReason,
    pendingQueuePolicy: options?.pendingQueuePolicy ?? 'always',
  });
  await stopMotionTelemetryForSession(reason);
  await endSessionSpeedStatistics();
  await endSessionMotionStateStatistics();
  await endSessionTrackingPipelineStatistics();
  resetSpeedTelemetryPreviousFix();
  resetMotionStateObserver();
  resetTrackingPipelinePreviousFix();
  // Fase A: ningún punto de esta sesión puede participar en la siguiente.
  clearOperatorIngestion();
  await stopOperatorTrackingAsync();

  const active = await trackingSessionStorage.getActive();
  const sessionId = active?.sessionId;
  const policy = options?.pendingQueuePolicy ?? 'always';

  if (policy === 'always') {
    await operatorTrackingPendingQueue.clear(sessionId);
  } else if (policy === 'if-empty' && sessionId) {
    const depth = await operatorTrackingPendingQueue.depth(sessionId);
    if (depth === 0) {
      await operatorTrackingPendingQueue.clear(sessionId);
    } else {
      recordTrackingDiagnostic(
        'finalization-pending-points',
        { preserved: true, pendingRemaining: depth, reason: 'cleanup_skipped_clear' },
        sessionId,
      );
    }
  } else if (policy === 'never' && sessionId) {
    const depth = await operatorTrackingPendingQueue.depth(sessionId);
    recordTrackingDiagnostic(
      'finalization-pending-points',
      { preserved: true, pendingRemaining: depth, reason: 'cleanup_preserve' },
      sessionId,
    );
  }

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

export {
  decideCaptureResumeFollowUp,
  decideOperatorBatchCatchAction,
  getExistingSessionIdFromStartConflict,
  isActiveSessionExistsError,
  isTrackingSessionNotActiveError,
  isWriterConflictError,
  isWriterUnclaimedError,
} from './trackingSessionErrors';
