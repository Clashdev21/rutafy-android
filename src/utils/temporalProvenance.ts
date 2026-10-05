/**
 * Procedencia temporal de cliente. Observabilidad: no altera coordenadas,
 * velocidad nativa ni captured_at.
 *
 * Las claves de metadata.temporal son las que el backend ya valida.
 * upload_batch_id y upload_attempt_at viven en la raíz del POST, no en el punto.
 */

import type { TrackingPointInput } from '@/types/tracking';
import { createTechnicalUuid } from '@/utils/technicalUuid';

export const MEASUREMENT_SOURCE_NATIVE = 'NATIVE_LOCATION_TIMESTAMP' as const;
export const MEASUREMENT_SOURCE_FALLBACK = 'FALLBACK_CLIENT_WALL_CLOCK' as const;

export const QUEUE_ADMISSION_DURABLE = 'DURABLE_PENDING_QUEUE' as const;
export const QUEUE_ADMISSION_FOREGROUND = 'FOREGROUND_MEMORY_BUFFER' as const;

export type MeasurementTimestampSource =
  | typeof MEASUREMENT_SOURCE_NATIVE
  | typeof MEASUREMENT_SOURCE_FALLBACK;

export type QueueAdmission =
  | typeof QUEUE_ADMISSION_DURABLE
  | typeof QUEUE_ADMISSION_FOREGROUND;

export type CallbackProvenanceInput = {
  callback_at: string;
  callback_batch_id: string;
  callback_index: number;
  callback_size: number;
};

export type TemporalProvenance = {
  measurement_at: string | null;
  measurement_timestamp_source: MeasurementTimestampSource;
  callback_at?: string;
  callback_batch_id?: string;
  callback_index?: number;
  callback_size?: number;
  queued_at?: string;
  queue_admission?: QueueAdmission;
};

export type TrackingPointsBatchRequest = {
  points: TrackingPointInput[];
  upload_batch_id: string;
  upload_attempt_at: string;
};

export function utcIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function readTemporalProvenance(
  point: TrackingPointInput,
): TemporalProvenance | null {
  const metadata = point.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const temporal = metadata.temporal;
  if (!temporal || typeof temporal !== 'object' || Array.isArray(temporal)) return null;
  return temporal as TemporalProvenance;
}

export function withObservationTemporal(
  metadata: Record<string, unknown> | undefined,
  temporal: TemporalProvenance,
): Record<string, unknown> {
  const existing =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
  return {
    ...existing,
    temporal,
  };
}

/**
 * Admisión a cola o buffer. Si ya hay queued_at o queue_admission, el punto
 * no cambia. No inventa callback ni fuente de medición.
 */
export function admitQueueProvenance(
  point: TrackingPointInput,
  queueAdmission: QueueAdmission,
  nowMs: number = Date.now(),
): TrackingPointInput {
  const current = readTemporalProvenance(point);
  if (current?.queued_at || current?.queue_admission) {
    return point;
  }
  const queued_at = utcIso(nowMs);
  const temporal = {
    ...(current ?? {}),
    queued_at,
    queue_admission: queueAdmission,
  };
  return {
    ...point,
    metadata: withObservationTemporal(point.metadata, temporal as TemporalProvenance),
  };
}

/**
 * Cada intento HTTP es un upload nuevo. No escribe esos ids en el punto.
 */
export function buildTrackingPointsBatchRequest(
  points: TrackingPointInput[],
  nowMs: number = Date.now(),
): TrackingPointsBatchRequest {
  return {
    points,
    upload_batch_id: createTechnicalUuid(),
    upload_attempt_at: utcIso(nowMs),
  };
}
