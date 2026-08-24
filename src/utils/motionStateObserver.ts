/**
 * Observer Motion State v1 (Tracking 3C).
 * Consume effectiveSpeed post-fusión — sin recalcular Speed Fusion.
 */

import {
  beginSessionMotionStateStatistics,
  getSessionMotionStateStatistics,
  recordMotionStateStepDiagnostic,
} from '@/services/trackingDiagnostics';
import type { EffectiveSpeedDecision } from '@/types/effectiveSpeed';
import {
  createInitialMotionStateMachineSnapshot,
  snapshotFromSessionStats,
  stepMotionStateMachine,
} from '@/utils/motionStateMachine';

let boundSessionId: string | null = null;
let machineSnapshot = createInitialMotionStateMachineSnapshot(Date.now());

export function resetMotionStateObserver(): void {
  boundSessionId = null;
  machineSnapshot = createInitialMotionStateMachineSnapshot(Date.now());
}

export function resetMotionStateForNewSession(sessionId: string): void {
  boundSessionId = sessionId;
  machineSnapshot = createInitialMotionStateMachineSnapshot(Date.now());
  beginSessionMotionStateStatistics(sessionId);
  void hydrateMotionStateFromStorage(sessionId);
}

async function hydrateMotionStateFromStorage(sessionId: string): Promise<void> {
  const stats = await getSessionMotionStateStatistics();
  if (stats && stats.sessionId === sessionId) {
    restoreMotionStateFromSessionStats(sessionId, stats);
  }
}

export function getMotionStateSnapshotForDiagnostics() {
  return machineSnapshot;
}

export function observeMotionStateFromEffectiveSpeed(
  sessionId: string,
  capturedAtIso: string,
  effectiveSpeed: EffectiveSpeedDecision,
  deltaMsFromPreviousSample: number | null,
  motionActivityLevel?: 'low' | 'medium' | 'high' | null,
): void {
  if (!sessionId.trim()) return;

  if (boundSessionId !== sessionId) {
    resetMotionStateForNewSession(sessionId);
  }

  const timestampMs = Date.parse(capturedAtIso);
  if (!Number.isFinite(timestampMs)) return;

  const step = stepMotionStateMachine({
    snapshot: machineSnapshot,
    effectiveSpeed,
    timestampMs,
    deltaMsFromPreviousSample,
    motionActivityLevel,
  });

  machineSnapshot = step.snapshot;

  recordMotionStateStepDiagnostic(
    sessionId,
    capturedAtIso,
    step,
    effectiveSpeed,
  );
}

export function restoreMotionStateFromSessionStats(
  sessionId: string,
  stats: Parameters<typeof snapshotFromSessionStats>[0],
): void {
  boundSessionId = sessionId;
  machineSnapshot = snapshotFromSessionStats(stats);
}
