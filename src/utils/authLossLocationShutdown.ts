/**
 * Parada única cuando la identidad confirmada desaparece.
 * Idempotente. No restaura Messenger, no borra la cola y no borra
 * la TrackingSession local.
 */

import { stopBackgroundLocation } from '@/services/backgroundLocationService';
import {
  markAuthLossCaptureBlocked,
  runForegroundCaptureStoppers,
} from '@/utils/authLossCaptureGate';
import { releaseJourneyLocationBecauseAuthLost } from '@/utils/locationOwnershipHandoff';

let shutdownInFlight: Promise<void> | null = null;

async function performAuthLossLocationShutdown(): Promise<void> {
  runForegroundCaptureStoppers();
  const { stopOperatorTrackingAsync } = await import('@/services/operatorTrackingService');
  await stopOperatorTrackingAsync();
  await releaseJourneyLocationBecauseAuthLost();
  await stopBackgroundLocation();
}

export async function stopLocationCaptureForAuthLoss(): Promise<void> {
  markAuthLossCaptureBlocked();
  if (shutdownInFlight) return shutdownInFlight;

  const run = performAuthLossLocationShutdown();
  shutdownInFlight = run;
  try {
    await run;
  } finally {
    if (shutdownInFlight === run) {
      shutdownInFlight = null;
    }
  }
}

export function resetAuthLossLocationShutdownForTests(): void {
  shutdownInFlight = null;
}
