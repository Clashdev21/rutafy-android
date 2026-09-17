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
