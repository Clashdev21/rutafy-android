/**
 * Lógica pura de cola durable de puntos background (sin I/O).
 * Conserva captured_at, orden temporal y evita duplicados.
 */

import type { TrackingPointInput } from '@/types/tracking';

export const MAX_OPERATOR_PENDING_POINTS = 1000;

export function pointDedupeKey(point: TrackingPointInput): string {
  return `${point.captured_at}|${point.lat}|${point.lng}`;
}

export function sortPointsByCapturedAt(points: TrackingPointInput[]): TrackingPointInput[] {
  return [...points].sort((a, b) => {
    const aMs = Date.parse(a.captured_at);
    const bMs = Date.parse(b.captured_at);
    const aOk = Number.isFinite(aMs);
    const bOk = Number.isFinite(bMs);
    if (aOk && bOk && aMs !== bMs) return aMs - bMs;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    return 0;
  });
}

/**
 * Fusiona puntos nuevos en la cola existente.
 * Deduplica por captured_at+lat+lng; conserva orden temporal.
 * Si excede el máximo, retiene los más recientes (y reporta overflow).
 */
export function mergePendingPoints(
  existing: TrackingPointInput[],
  incoming: TrackingPointInput[],
  maxPoints = MAX_OPERATOR_PENDING_POINTS,
): {
  points: TrackingPointInput[];
  added: number;
  duplicatesSkipped: number;
  overflowDropped: number;
} {
  const seen = new Set(existing.map(pointDedupeKey));
  let duplicatesSkipped = 0;
  const toAdd: TrackingPointInput[] = [];

  for (const point of incoming) {
    const key = pointDedupeKey(point);
    if (seen.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seen.add(key);
    toAdd.push(point);
  }

  let merged = sortPointsByCapturedAt([...existing, ...toAdd]);
  let overflowDropped = 0;
  if (merged.length > maxPoints) {
    overflowDropped = merged.length - maxPoints;
    merged = merged.slice(overflowDropped);
  }

  const retainedKeys = new Set(merged.map(pointDedupeKey));
  const added = toAdd.filter((p) => retainedKeys.has(pointDedupeKey(p))).length;

  return {
    points: merged,
    added,
    duplicatesSkipped,
    overflowDropped,
  };
}

/**
 * Extrae un batch del frente (más antiguos primero) sin mutar el resto.
 */
export function takePendingBatch(
  points: TrackingPointInput[],
  maxBatchSize: number,
): { batch: TrackingPointInput[]; remaining: TrackingPointInput[] } {
  if (maxBatchSize <= 0 || points.length === 0) {
    return { batch: [], remaining: points };
  }
  const size = Math.min(maxBatchSize, points.length);
  return {
    batch: points.slice(0, size),
    remaining: points.slice(size),
  };
}

/**
 * Reinserta un batch fallido al frente, sin duplicar claves ya presentes.
 */
export function requeueFailedBatch(
  remaining: TrackingPointInput[],
  failedBatch: TrackingPointInput[],
  maxPoints = MAX_OPERATOR_PENDING_POINTS,
): TrackingPointInput[] {
  return mergePendingPoints(failedBatch, remaining, maxPoints).points;
}

/** Span de captured_at dentro de un callback (ayuda a detectar locations acumuladas). */
export function computeIntraCallbackCapturedAtSpanMs(
  points: TrackingPointInput[],
): number | null {
  if (points.length < 2) return null;
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const ms = Date.parse(point.captured_at);
    if (!Number.isFinite(ms)) continue;
    if (ms < minMs) minMs = ms;
    if (ms > maxMs) maxMs = ms;
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;
  return Math.max(0, maxMs - minMs);
}
