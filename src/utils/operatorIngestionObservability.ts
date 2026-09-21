/**
 * Fase A — capa de observabilidad de la ingesta operator.
 *
 * Separa el registro de diagnósticos del mapeo puro y del coordinador:
 *  - `mapTrackingPointPure` produce el resultado discriminado y sus detalles;
 *  - el coordinador decide ownership, orden y dedupe;
 *  - este módulo registra los eventos, solo para el canal autoritativo.
 *
 * Reemplaza a los productores que vivían en el mapeo mutante previo, sin
 * reintroducir una ruta que permita omitir el coordinador.
 */

import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import type {
  OperatorIngestionChannel,
  OperatorMapRejection,
} from '@/types/operatorIngestion';

/**
 * Registra los descartes de la etapa de mapeo conservando la forma de campos
 * previa de cada evento y añadiendo `channel`.
 *
 * Debe invocarse UNA sola vez por ciclo y únicamente con role 'authoritative':
 * así un mismo fix rechazado no se cuenta por foreground y por background.
 */
export function recordOperatorMapRejections(input: {
  sessionId: string;
  channel: OperatorIngestionChannel;
  sessionStartedAt: string | null;
  rejections: OperatorMapRejection[];
}): void {
  for (const rejection of input.rejections) {
    if (rejection.reason === 'invalid_coords') {
      recordTrackingDiagnostic(
        'tracking-fix-invalid',
        { reason: 'invalid_coords', channel: input.channel },
        input.sessionId,
      );
      continue;
    }

    recordTrackingDiagnostic(
      'tracking-fix-temporal-rejected',
      {
        reason: rejection.reason,
        sessionId: input.sessionId,
        capturedAt: rejection.capturedAt,
        sessionStartedAt: input.sessionStartedAt,
        // `deltaMs` se conserva como alias histórico de ageRelativeToSessionMs.
        deltaMs: rejection.ageRelativeToSessionMs,
        ageRelativeToSessionMs: rejection.ageRelativeToSessionMs,
        fixAgeMs: rejection.fixAgeMs,
        channel: input.channel,
      },
      input.sessionId,
    );
  }
}

export type OperatorEmptyCallbackKind = 'timeout' | 'ingestion_noop';

/**
 * Un callback sin puntos aceptados no es timeout si el payload traía locations:
 * fueron descartadas por ingesta (dedupe, orden, colisión o inválidos).
 */
export function classifyOperatorBackgroundEmptyCallback(
  rawLocationCount: number,
): OperatorEmptyCallbackKind {
  return rawLocationCount > 0 ? 'ingestion_noop' : 'timeout';
}

export function recordOperatorIngestionNoop(input: {
  sessionId: string;
  locationCount: number;
  rejectedCount: number;
  invalidCount: number;
}): void {
  recordTrackingDiagnostic(
    'operator-ingestion-noop',
    {
      channel: 'background',
      locationCount: input.locationCount,
      rejectedCount: input.rejectedCount,
      invalidCount: input.invalidCount,
    },
    input.sessionId,
  );
}

/**
 * Callback BG sin puntos aceptados: timeout si no hubo locations, noop si la
 * ingesta las descartó. Devuelve el kind para que el task solo haga drop en timeout.
 */
export function recordOperatorBackgroundEmptyCallback(input: {
  sessionId: string;
  rawLocationCount: number;
  rejectedCount: number;
  invalidCount: number;
}): OperatorEmptyCallbackKind {
  const kind = classifyOperatorBackgroundEmptyCallback(input.rawLocationCount);
  if (kind === 'ingestion_noop') {
    recordOperatorIngestionNoop({
      sessionId: input.sessionId,
      locationCount: input.rawLocationCount,
      rejectedCount: input.rejectedCount,
      invalidCount: input.invalidCount,
    });
    return kind;
  }
  recordTrackingDiagnostic(
    'gps-location-timeout',
    { channel: 'background', reason: 'empty_points' },
    input.sessionId,
  );
  return kind;
}

export function recordOperatorForegroundIngestionError(
  sessionId: string,
  error: unknown,
): void {
  recordTrackingDiagnostic(
    'operator-ingestion-error',
    { channel: 'foreground', error: String(error) },
    sessionId,
  );
}
