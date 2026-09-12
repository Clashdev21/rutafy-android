import type { OperationalBootstrapResponse } from '@/types/operationalBootstrap';

export type MensajeroStopDecision =
  | { type: 'stop'; sessionId: string | null; reason: 'JOURNEY_COMPLETED' }
  | { type: 'noop' };

/**
 * Cierre operacional vía lifecycle 3B. No inventa un close manual distinto.
 * Idempotente: si no hay sesión local ni remota, el ejecutor trata stop como already_stopped.
 */
export function decideMensajeroStopFlow(input: {
  bootstrap: OperationalBootstrapResponse;
  localSessionId: string | null;
}): MensajeroStopDecision {
  const { bootstrap, localSessionId } = input;
  const completed =
    bootstrap.action === 'NONE' &&
    bootstrap.capture_should_stop === true &&
    bootstrap.reason === 'JOURNEY_COMPLETED';

  if (!completed) {
    return { type: 'noop' };
  }

  const remoteId = bootstrap.tracking.tracking_session_id?.trim() || null;
  return {
    type: 'stop',
    sessionId: localSessionId || remoteId,
    reason: 'JOURNEY_COMPLETED',
  };
}

export type MensajeroStopExecution = 'stopped' | 'already_stopped' | 'preserved_offline';

export function resolveStopExecutionResult(input: {
  sessionId: string | null;
  remoteEnded: boolean;
  networkFailed: boolean;
  alreadyInactive: boolean;
}): MensajeroStopExecution {
  if (!input.sessionId) return 'already_stopped';
  if (input.networkFailed) return 'preserved_offline';
  if (input.alreadyInactive || input.remoteEnded) return 'stopped';
  return 'preserved_offline';
}
