/**
 * Cola durable de puntos de captura logística en background.
 * AsyncStorage (no SecureStore) por volumen; scoped por sessionId.
 *
 * Todas las lecturas/escrituras RMW pasan por mutationChain (serialización
 * por proceso). batchInFlight (HTTP) es responsabilidad aparte en el task.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TrackingPointInput } from '@/types/tracking';
import {
  MAX_OPERATOR_PENDING_POINTS,
  mergePendingPoints,
  requeueFailedBatch,
  takePendingBatch,
} from '@/utils/operatorTrackingPendingQueueLogic';

const QUEUE_KEY = 'rutafy_operator_tracking_pending_points';

export type OperatorPendingQueueState = {
  sessionId: string;
  points: TrackingPointInput[];
};

/** Cadena de mutación: una operación de cola a la vez; fallos no rompen la cadena. */
let mutationChain: Promise<void> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationChain.then(operation, operation);
  mutationChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStateUnlocked(): Promise<OperatorPendingQueueState | null> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OperatorPendingQueueState;
    if (!parsed?.sessionId?.trim() || !Array.isArray(parsed.points)) return null;
    return {
      sessionId: parsed.sessionId,
      points: parsed.points.filter(
        (p): p is TrackingPointInput =>
          p != null &&
          typeof p === 'object' &&
          typeof p.lat === 'number' &&
          typeof p.lng === 'number' &&
          typeof p.captured_at === 'string',
      ),
    };
  } catch {
    return null;
  }
}

async function writeStateUnlocked(state: OperatorPendingQueueState | null): Promise<void> {
  if (!state || state.points.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
    return;
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(state));
}

export const operatorTrackingPendingQueue = {
  /** Lectura consistente: espera mutaciones previas. */
  async get(sessionId: string): Promise<TrackingPointInput[]> {
    return serializeMutation(async () => {
      const state = await readStateUnlocked();
      if (!state || state.sessionId !== sessionId) return [];
      return state.points;
    });
  },

  async depth(sessionId: string): Promise<number> {
    return (await this.get(sessionId)).length;
  },

  /**
   * Encola puntos para la sesión. Si la cola es de otra sesión, la reemplaza
   * (no envía puntos de A bajo sessionId B).
   */
  async enqueue(
    sessionId: string,
    incoming: TrackingPointInput[],
  ): Promise<{
    added: number;
    duplicatesSkipped: number;
    overflowDropped: number;
    queueDepth: number;
  }> {
    return serializeMutation(async () => {
      if (!sessionId.trim() || incoming.length === 0) {
        const state = await readStateUnlocked();
        const depth =
          state && state.sessionId === sessionId ? state.points.length : 0;
        return { added: 0, duplicatesSkipped: 0, overflowDropped: 0, queueDepth: depth };
      }

      const state = await readStateUnlocked();
      const existing =
        state && state.sessionId === sessionId ? state.points : [];

      const merged = mergePendingPoints(existing, incoming, MAX_OPERATOR_PENDING_POINTS);
      await writeStateUnlocked({ sessionId, points: merged.points });
      return {
        added: merged.added,
        duplicatesSkipped: merged.duplicatesSkipped,
        overflowDropped: merged.overflowDropped,
        queueDepth: merged.points.length,
      };
    });
  },

  async dequeueBatch(
    sessionId: string,
    maxBatchSize: number,
  ): Promise<TrackingPointInput[]> {
    return serializeMutation(async () => {
      const state = await readStateUnlocked();
      if (!state || state.sessionId !== sessionId || state.points.length === 0) {
        return [];
      }
      const { batch, remaining } = takePendingBatch(state.points, maxBatchSize);
      await writeStateUnlocked(
        remaining.length > 0 ? { sessionId, points: remaining } : null,
      );
      return batch;
    });
  },

  async requeueFront(sessionId: string, failedBatch: TrackingPointInput[]): Promise<number> {
    return serializeMutation(async () => {
      if (failedBatch.length === 0) {
        const state = await readStateUnlocked();
        return state && state.sessionId === sessionId ? state.points.length : 0;
      }
      const state = await readStateUnlocked();
      const remaining =
        state && state.sessionId === sessionId ? state.points : [];
      const points = requeueFailedBatch(remaining, failedBatch, MAX_OPERATOR_PENDING_POINTS);
      await writeStateUnlocked({ sessionId, points });
      return points.length;
    });
  },

  async clear(sessionId?: string): Promise<void> {
    return serializeMutation(async () => {
      if (!sessionId) {
        await AsyncStorage.removeItem(QUEUE_KEY);
        return;
      }
      const state = await readStateUnlocked();
      if (!state || state.sessionId === sessionId) {
        await AsyncStorage.removeItem(QUEUE_KEY);
      }
    });
  },
};

/** Solo tests: permite inspeccionar que la cadena no queda rota tras un rechazo. */
export function __resetOperatorPendingQueueMutationChainForTests(): void {
  mutationChain = Promise.resolve();
}
