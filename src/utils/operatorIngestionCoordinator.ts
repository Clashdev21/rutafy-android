/**
 * Fase A — coordinador de ingesta operator.
 *
 * Pipeline serial por sessionId:
 *   validate → sort → exact dedupe → temporal validation
 *   → estimate → motion → commit → enrichment → transport
 *
 * No redefine speed_mps, no cambia umbrales del estimador y no altera la
 * semántica del batch: solo corrige el ORDEN y la UNICIDAD de lo que entra.
 */

import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import type { TrackingPointAppState, TrackingPointInput } from '@/types/tracking';
import {
  EMPTY_OPERATOR_INGESTION_METRICS,
  type OperatorIngestionChannel,
  type OperatorIngestionMetrics,
  type OperatorIngestionRejection,
  type OperatorIngestionRole,
  type OperatorLastAcceptedFix,
  type OperatorMapRejection,
} from '@/types/operatorIngestion';
import { recordOperatorMapRejections } from '@/utils/operatorIngestionObservability';
import {
  BoundedExactDedupe,
  buildOperatorExactDedupeKey,
  OPERATOR_DEDUPE_CAPACITY,
} from '@/utils/operatorIngestionDedupe';
import {
  drainOperatorIngestionChain,
  resetOperatorIngestionChain,
  runOnOperatorIngestionChain,
} from '@/utils/operatorIngestionChain';
import { resolveOperatorIngestionRole } from '@/utils/operatorIngestionOwnership';
import {
  mapTrackingPointPure,
  observeAuthoritativeTrackingPoint,
  type TrackingPointFixContext,
} from '@/utils/trackingPointMapper';

let boundSessionId: string | null = null;
let lastAcceptedFix: OperatorLastAcceptedFix | null = null;
let dedupe = new BoundedExactDedupe(OPERATOR_DEDUPE_CAPACITY);
let metrics: OperatorIngestionMetrics = { ...EMPTY_OPERATOR_INGESTION_METRICS };

export type IngestOperatorLocationsInput = {
  sessionId: string;
  locations: unknown;
  channel: OperatorIngestionChannel;
  metadata?: Record<string, unknown>;
  /** Override explícito; por defecto se deriva del ownership confirmado. */
  role?: OperatorIngestionRole;
  sessionStartedAtMs?: number | null;
  /** ISO original de la sesión, para conservar la forma del diagnóstico. */
  sessionStartedAt?: string | null;
  nowMs?: number;
};

export type IngestOperatorLocationsResult = {
  role: OperatorIngestionRole;
  /** Puntos aceptados y enriquecidos, en orden cronológico. Van al transporte. */
  points: TrackingPointInput[];
  /** Snapshot NO mutante para UI cuando role === 'observe'. */
  observed: TrackingPointInput[];
  rejected: OperatorIngestionRejection[];
  invalid: number;
  sortedCallback: boolean;
  metrics: OperatorIngestionMetrics;
};

export function getOperatorIngestionMetrics(): OperatorIngestionMetrics {
  return { ...metrics };
}

export function getOperatorLastAcceptedFix(): OperatorLastAcceptedFix | null {
  return lastAcceptedFix ? { ...lastAcceptedFix } : null;
}

export function getOperatorDedupeSize(): number {
  return dedupe.size;
}

export function getOperatorDedupeCapacity(): number {
  return dedupe.capacity;
}

/**
 * Reset de sesión (G): limpia lastAcceptedFix, claves de dedupe, cadena y
 * métricas, de forma que un punto de la sesión anterior no participe en la
 * siguiente.
 */
export function resetOperatorIngestionForSession(sessionId: string | null): void {
  if (boundSessionId && boundSessionId !== sessionId) {
    resetOperatorIngestionChain(boundSessionId);
  }
  boundSessionId = sessionId;
  lastAcceptedFix = null;
  dedupe = new BoundedExactDedupe(OPERATOR_DEDUPE_CAPACITY);
  metrics = { ...EMPTY_OPERATOR_INGESTION_METRICS };
}

export function clearOperatorIngestion(): void {
  resetOperatorIngestionChain();
  boundSessionId = null;
  lastAcceptedFix = null;
  dedupe = new BoundedExactDedupe(OPERATOR_DEDUPE_CAPACITY);
  metrics = { ...EMPTY_OPERATOR_INGESTION_METRICS };
}

export async function drainOperatorIngestion(sessionId: string): Promise<void> {
  await drainOperatorIngestionChain(sessionId);
}

function ensureSessionBinding(sessionId: string): void {
  if (boundSessionId !== sessionId) {
    resetOperatorIngestionForSession(sessionId);
  }
}

/** No inventa timestamps: solo serializa capturedAtMs finito. */
function isoFromCapturedAtMs(capturedAtMs: number | null | undefined): string | null {
  if (capturedAtMs == null || !Number.isFinite(capturedAtMs)) return null;
  return new Date(capturedAtMs).toISOString();
}

type MappedCandidate = {
  point: TrackingPointInput;
  context: TrackingPointFixContext;
  capturedAtMs: number;
  earlyTolerance: boolean;
};

/**
 * Etapa de mapeo PURA: clasifica descartes sin registrar diagnósticos. El
 * registro lo hace la capa de observabilidad, ya confirmado el rol autoritativo.
 */
function toCandidates(
  locations: unknown[],
  channel: OperatorIngestionChannel,
  metadata: Record<string, unknown> | undefined,
  sessionStartedAtMs: number | null,
  nowMs: number,
): { candidates: MappedCandidate[]; invalidRejections: OperatorMapRejection[] } {
  const appState: TrackingPointAppState = channel;
  const candidates: MappedCandidate[] = [];
  const invalidRejections: OperatorMapRejection[] = [];

  for (const location of locations) {
    const mapped = mapTrackingPointPure(
      location as Parameters<typeof mapTrackingPointPure>[0],
      appState,
      metadata,
      { sessionStartedAtMs, nowMs },
    );
    if (!mapped.ok) {
      invalidRejections.push({
        reason: mapped.reason,
        capturedAt: isoFromCapturedAtMs(mapped.detail?.capturedAtMs),
        ageRelativeToSessionMs: mapped.detail?.ageRelativeToSessionMs ?? null,
        fixAgeMs: mapped.detail?.fixAgeMs ?? null,
      });
      continue;
    }
    const capturedAtMs = Date.parse(mapped.point.captured_at);
    if (!Number.isFinite(capturedAtMs)) {
      invalidRejections.push({
        reason: 'invalid_timestamp',
        capturedAt: null,
        ageRelativeToSessionMs: null,
        fixAgeMs: null,
      });
      continue;
    }
    candidates.push({
      point: mapped.point,
      context: mapped.context,
      capturedAtMs,
      earlyTolerance: mapped.temporalReason === 'within_early_tolerance',
    });
  }

  return { candidates, invalidRejections };
}

/** Orden cronológico ascendente por capturedAt (nunca receivedAt). Estable. */
function sortChronologically(candidates: MappedCandidate[]): boolean {
  let wasOutOfOrder = false;
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].capturedAtMs < candidates[i - 1].capturedAtMs) {
      wasOutOfOrder = true;
      break;
    }
  }
  if (wasOutOfOrder) {
    candidates.sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  }
  return wasOutOfOrder;
}

function runIngestionCycle(input: IngestOperatorLocationsInput): IngestOperatorLocationsResult {
  const sessionId = input.sessionId;
  const role = input.role ?? resolveOperatorIngestionRole(input.channel);
  const nowMs = input.nowMs ?? Date.now();
  const locations = Array.isArray(input.locations) ? input.locations : [];

  ensureSessionBinding(sessionId);

  const { candidates, invalidRejections } = toCandidates(
    locations,
    input.channel,
    input.metadata,
    input.sessionStartedAtMs ?? null,
    nowMs,
  );
  const invalid = invalidRejections.length;

  // Ordenar es puro; contabilizarlo y registrarlo no lo es.
  const sortedCallback = sortChronologically(candidates);

  // Canal observe: NO atraviesa el camino mutante ni incrementa estadísticas
  // operacionales. Solo devuelve un snapshot de UI.
  if (role === 'observe') {
    metrics.observeOnlySamples += candidates.length;
    return {
      role,
      points: [],
      observed: candidates.map((c) => c.point),
      rejected: [],
      invalid,
      sortedCallback,
      metrics: { ...metrics },
    };
  }

  // Desde aquí el rol es autoritativo: único canal que puede observar.
  if (sortedCallback && candidates.length > 1) {
    metrics.sortedMultiLocationCallbacks += 1;
    recordTrackingDiagnostic(
      'operator-ingestion-reordered',
      { channel: input.channel, count: candidates.length },
      sessionId,
    );
  }

  recordOperatorMapRejections({
    sessionId,
    channel: input.channel,
    sessionStartedAt: input.sessionStartedAt ?? null,
    rejections: invalidRejections,
  });

  const accepted: TrackingPointInput[] = [];
  const rejected: OperatorIngestionRejection[] = [];

  for (const candidate of candidates) {
    const key = buildOperatorExactDedupeKey({
      sessionId,
      capturedAt: candidate.point.captured_at,
      lat: candidate.point.lat,
      lng: candidate.point.lng,
    });

    // 1. Duplicado exacto → descartar antes del estimador.
    if (dedupe.has(key)) {
      metrics.exactDuplicateSamples += 1;
      rejected.push({ reason: 'exact_duplicate', capturedAt: candidate.point.captured_at });
      continue;
    }

    if (lastAcceptedFix && lastAcceptedFix.sessionId === sessionId) {
      // 2. Timestamp anterior al último aceptado → fuera de orden.
      if (candidate.capturedAtMs < lastAcceptedFix.capturedAtMs) {
        metrics.outOfOrderSamples += 1;
        rejected.push({ reason: 'out_of_order', capturedAt: candidate.point.captured_at });
        continue;
      }
      // 3. Mismo timestamp con coordenadas distintas → colisión temporal.
      //    Exige capturedAtMs > lastAccepted, no solo "<".
      if (candidate.capturedAtMs === lastAcceptedFix.capturedAtMs) {
        metrics.timestampCollisionSamples += 1;
        rejected.push({ reason: 'timestamp_collision', capturedAt: candidate.point.captured_at });
        continue;
      }
    }

    // 4. Coordenadas iguales con timestamp posterior = permanencia legítima.
    dedupe.add(key);
    if (candidate.earlyTolerance) {
      recordTrackingDiagnostic('tracking-stat-early-tolerance', {}, sessionId);
    }
    const enriched = observeAuthoritativeTrackingPoint(
      candidate.point,
      sessionId,
      candidate.context,
    );
    lastAcceptedFix = {
      sessionId,
      capturedAtMs: candidate.capturedAtMs,
      lat: candidate.point.lat,
      lng: candidate.point.lng,
    };
    metrics.authoritativeSamples += 1;
    metrics.operationalPointsMapped += 1;
    accepted.push(enriched);
  }

  if (rejected.length) {
    recordTrackingDiagnostic(
      'operator-ingestion-rejected',
      {
        channel: input.channel,
        exactDuplicate: rejected.filter((r) => r.reason === 'exact_duplicate').length,
        outOfOrder: rejected.filter((r) => r.reason === 'out_of_order').length,
        timestampCollision: rejected.filter((r) => r.reason === 'timestamp_collision').length,
      },
      sessionId,
    );
  }

  return {
    role,
    points: accepted,
    observed: [],
    rejected,
    invalid,
    sortedCallback,
    metrics: { ...metrics },
  };
}

/**
 * Entrada única de ingesta operator. Serializa por sessionId para que dos
 * callbacks concurrentes no intercalen mutaciones del estimador.
 */
export function ingestOperatorLocations(
  input: IngestOperatorLocationsInput,
): Promise<IngestOperatorLocationsResult> {
  return runOnOperatorIngestionChain(input.sessionId, async () => runIngestionCycle(input));
}
