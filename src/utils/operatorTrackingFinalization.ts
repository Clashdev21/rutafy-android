/**
 * Políticas de cierre de captura logística (END vs CANCEL) y drenaje acotado.
 * Lógica pura + constantes — sin I/O.
 */

/** Timeout total para esperar POST in-flight + drenar cola durable antes de end remoto. */
export const FINALIZATION_DRAIN_TIMEOUT_MS = 25_000;

export type FinalizationDrainStatus =
  | 'drained'
  | 'timeout'
  | 'network_error'
  | 'session_not_active';

export type FinalizationDrainOutcome = {
  status: FinalizationDrainStatus;
  pendingRemaining: number;
  elapsedMs: number;
};

/**
 * CANCEL = abandono deliberado de la captura (status abandoned).
 * Los puntos pendientes NO se priorizan: se descartan de forma explícita.
 */
export function cancelDiscardsPendingPoints(): boolean {
  return true;
}

/**
 * END = cierre normal: drenar pending mientras session sigue ACTIVE;
 * solo entonces end remoto. Si timeout → no clear silencioso, no end remoto.
 */
export function endRequiresPendingDrain(): boolean {
  return true;
}

export function shouldClearPendingQueueAfterEnd(outcome: FinalizationDrainOutcome): boolean {
  return outcome.status === 'drained' && outcome.pendingRemaining === 0;
}

export function shouldProceedWithRemoteEnd(outcome: FinalizationDrainOutcome): boolean {
  return outcome.status === 'drained' && outcome.pendingRemaining === 0;
}

export function shouldPreservePendingOnEndFailure(outcome: FinalizationDrainOutcome): boolean {
  return (
    outcome.status === 'timeout' ||
    outcome.status === 'network_error' ||
    outcome.pendingRemaining > 0
  );
}

/**
 * Simula scheduling de mutaciones serializadas (espejo de mutationChain)
 * para tests determinísticos de concurrencia.
 */
export function createSerializedMutationRunner() {
  let chain: Promise<void> = Promise.resolve();

  function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = chain.then(operation, operation);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return { serializeMutation };
}
