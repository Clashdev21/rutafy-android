/**
 * Fase A — ingesta serial por sessionId.
 *
 * Reutiliza el patrón de promise chain ya empleado en el repositorio: cada
 * sessionId tiene una cola lógica y solo una operación corre a la vez.
 *
 * Una excepción o rechazo NO rompe la cadena de forma permanente: la cola
 * continúa con la siguiente operación y el error se propaga solo al llamador.
 */

const chains = new Map<string, Promise<void>>();

export function runOnOperatorIngestionChain<T>(
  sessionId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = chains.get(sessionId) ?? Promise.resolve();
  // Se ejecuta tanto si la anterior resolvió como si falló: sin envenenamiento.
  const result = previous.then(task, task);
  chains.set(
    sessionId,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/** Espera a que se vacíe la cola lógica de una sesión (tests/finalización). */
export async function drainOperatorIngestionChain(sessionId: string): Promise<void> {
  const tail = chains.get(sessionId);
  if (tail) await tail;
}

/**
 * Descarta la referencia a la cola. No corta una operación en curso: la
 * operación activa termina sola y su resultado se ignora, evitando dejar la
 * cadena en un estado inconsistente.
 */
export function resetOperatorIngestionChain(sessionId?: string): void {
  if (sessionId) {
    chains.delete(sessionId);
    return;
  }
  chains.clear();
}

export function getOperatorIngestionChainCount(): number {
  return chains.size;
}
