/**
 * Operational Speed and Motion Estimator V1 — Fase A.
 *
 * Contratos de la ingesta operator. No redefine speed_mps ni la semántica del
 * batch: solo describe cómo se alimenta el estimador existente.
 */

import type { SessionFixTemporalReason } from '@/utils/trackingTemporalGuard';

/**
 * Canal autoritativo vs observación no mutante.
 * Tipo explícito en lugar de un booleano ambiguo.
 */
export type OperatorIngestionRole = 'authoritative' | 'observe';

export type OperatorIngestionChannel = 'foreground' | 'background';

/** Motivos de descarte previos al estimador. */
export type OperatorIngestionRejectionReason =
  | 'exact_duplicate'
  | 'out_of_order'
  | 'timestamp_collision';

export type OperatorIngestionRejection = {
  reason: OperatorIngestionRejectionReason;
  capturedAt: string;
};

/**
 * Descarte producido en la etapa de mapeo (coordenadas inválidas o gate
 * temporal), clasificado de forma pura para que la capa de observabilidad lo
 * registre después de confirmar el rol autoritativo.
 */
export type OperatorMapRejection = {
  reason: 'invalid_coords' | SessionFixTemporalReason;
  /** null cuando el timestamp del fix no es utilizable: nunca se inventa. */
  capturedAt: string | null;
  ageRelativeToSessionMs: number | null;
  fixAgeMs: number | null;
};

export type OperatorIngestionMetrics = {
  exactDuplicateSamples: number;
  outOfOrderSamples: number;
  timestampCollisionSamples: number;
  observeOnlySamples: number;
  authoritativeSamples: number;
  sortedMultiLocationCallbacks: number;
  operationalPointsMapped: number;
};

export const EMPTY_OPERATOR_INGESTION_METRICS: OperatorIngestionMetrics = {
  exactDuplicateSamples: 0,
  outOfOrderSamples: 0,
  timestampCollisionSamples: 0,
  observeOnlySamples: 0,
  authoritativeSamples: 0,
  sortedMultiLocationCallbacks: 0,
  operationalPointsMapped: 0,
};

/** Último fix aceptado por el canal autoritativo (gate cronológico). */
export type OperatorLastAcceptedFix = {
  sessionId: string;
  capturedAtMs: number;
  lat: number;
  lng: number;
};
