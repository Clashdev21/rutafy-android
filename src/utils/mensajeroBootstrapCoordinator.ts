import type {
  OperationalBootstrapResponse,
  StoredMensajeroBootstrap,
} from '@/types/operationalBootstrap';
import {
  bootstrapNoticeForDecision,
  classifyBootstrapFetchError,
  decideMensajeroBootstrapApply,
  nextBootstrapSnapshot,
  type MensajeroBootstrapDecision,
} from './mensajeroBootstrapPolicy.ts';
import { parseOperationalBootstrapResponse } from './operationalBootstrapParse.ts';
import type { MensajeroStopExecution } from '@/utils/mensajeroStopFlow';

export const MENSAJERO_BOOTSTRAP_DEBOUNCE_MS = 2500;

export type BootstrapStartOutcome =
  | { status: 'started'; sessionId: string }
  | { status: 'skipped' }
  | { status: 'recovered_existing'; sessionId: string };

export type BootstrapCycleDeps = {
  fetchBootstrap: () => Promise<unknown>;
  getLocalSessionId: () => Promise<string | null>;
  isCaptureActive: () => Promise<boolean>;
  hasConsent: () => Promise<boolean>;
  canStartOperatorGps: () => Promise<boolean>;
  isStartBusy: () => boolean;
  getPersisted: () => Promise<StoredMensajeroBootstrap | null>;
  persist: (snapshot: StoredMensajeroBootstrap) => Promise<void>;
  startWithJourney: (input: {
    journeyId: string;
    vehicleLabel: string;
  }) => Promise<BootstrapStartOutcome>;
  hydrateSession: (sessionId: string) => Promise<void>;
  stopCapture: (sessionId: string | null) => Promise<MensajeroStopExecution>;
  nowIso: () => string;
};

export type BootstrapCycleResult = {
  decision: MensajeroBootstrapDecision;
  notice: string | null;
  bootstrap: OperationalBootstrapResponse | null;
  fetchError: ReturnType<typeof classifyBootstrapFetchError> | null;
  needsRetryOnReconnect: boolean;
  shouldRebootstrap: boolean;
  snapshot: StoredMensajeroBootstrap;
  stopResult: MensajeroStopExecution | null;
  startOutcome: BootstrapStartOutcome | null;
};

export function createBootstrapSingleFlight(debounceMs = MENSAJERO_BOOTSTRAP_DEBOUNCE_MS) {
  let inFlight: Promise<BootstrapCycleResult> | null = null;
  let lastCompletedAt = 0;
  let lastResult: BootstrapCycleResult | null = null;

  return {
    async run(
      input: { force?: boolean; now?: number },
      fn: () => Promise<BootstrapCycleResult>,
    ): Promise<BootstrapCycleResult> {
      if (inFlight) {
        return inFlight;
      }
      const now = input.now ?? Date.now();
      if (!input.force && lastResult && now - lastCompletedAt < debounceMs) {
        return lastResult;
      }
      const run = fn();
      inFlight = run;
      try {
        const result = await run;
        lastResult = result;
        lastCompletedAt = input.now ?? Date.now();
        return result;
      } finally {
        if (inFlight === run) {
          inFlight = null;
        }
      }
    },
    reset(): void {
      inFlight = null;
      lastCompletedAt = 0;
      lastResult = null;
    },
  };
}

export const mensajeroBootstrapSingleFlight = createBootstrapSingleFlight();

export async function runOperationalBootstrapCycle(
  deps: BootstrapCycleDeps,
): Promise<BootstrapCycleResult> {
  const localSessionId = await deps.getLocalSessionId();
  const captureActive = await deps.isCaptureActive();
  const consentAccepted = await deps.hasConsent();
  const canStartOperatorGps = await deps.canStartOperatorGps();
  const previous = await deps.getPersisted();

  let raw: unknown = null;
  let fetchError: BootstrapCycleResult['fetchError'] = null;
  let bootstrap: OperationalBootstrapResponse | null = null;

  try {
    raw = await deps.fetchBootstrap();
    bootstrap = parseOperationalBootstrapResponse(raw);
    if (!bootstrap) {
      fetchError = 'unknown';
    }
  } catch (error) {
    fetchError = classifyBootstrapFetchError(error);
  }

  const decision = decideMensajeroBootstrapApply({
    fetchError,
    bootstrap,
    localSessionId,
    captureActive,
    consentAccepted,
    canStartOperatorGps,
    startBusy: deps.isStartBusy(),
  });

  let stopResult: MensajeroStopExecution | null = null;
  let startOutcome: BootstrapStartOutcome | null = null;
  let shouldRebootstrap = false;

  if (decision.type === 'stop') {
    stopResult = await deps.stopCapture(decision.sessionId);
  } else if (decision.type === 'hydrate') {
    await deps.hydrateSession(decision.sessionId);
  } else if (decision.type === 'start') {
    startOutcome = await deps.startWithJourney({
      journeyId: decision.journeyId,
      vehicleLabel: decision.vehicleLabel,
    });
    if (startOutcome.status === 'recovered_existing') {
      await deps.hydrateSession(startOutcome.sessionId);
      shouldRebootstrap = true;
    }
  }

  const snapshot = nextBootstrapSnapshot(previous, bootstrap, deps.nowIso(), decision);
  if (startOutcome?.status === 'started' || startOutcome?.status === 'recovered_existing') {
    snapshot.trackingSessionId = startOutcome.sessionId;
    snapshot.journeyId = decision.type === 'start' ? decision.journeyId : snapshot.journeyId;
  }
  if (stopResult === 'stopped' || stopResult === 'already_stopped') {
    snapshot.journeyId = null;
    snapshot.trackingSessionId = null;
  }
  if (stopResult !== 'preserved_offline') {
    await deps.persist(snapshot);
  }

  return {
    decision,
    notice: bootstrapNoticeForDecision(decision),
    bootstrap,
    fetchError,
    needsRetryOnReconnect: fetchError === 'offline' || fetchError === 'transient',
    shouldRebootstrap,
    snapshot,
    stopResult,
    startOutcome,
  };
}
