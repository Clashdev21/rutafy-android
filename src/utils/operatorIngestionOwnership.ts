/**
 * Fase A — ownership explícito foreground/background.
 *
 * Background es autoritativo cuando el TaskManager operator está confirmado
 * activo. Foreground solo es autoritativo si background no lo está.
 *
 * El estado se mantiene confirmado en memoria y se revalida en eventos de
 * lifecycle/health ya existentes: NO se consulta el TaskManager por cada punto,
 * para no introducir I/O ni carreras en el camino caliente.
 */

import type {
  OperatorIngestionChannel,
  OperatorIngestionRole,
} from '@/types/operatorIngestion';

let backgroundAuthoritative = false;
let lastConfirmedAtMs: number | null = null;

/**
 * Registra el resultado de una confirmación real del TaskManager operator.
 * Llamar desde start/stop/health/lifecycle, no por punto.
 */
export function setOperatorBackgroundOwnership(
  active: boolean,
  nowMs: number = Date.now(),
): void {
  backgroundAuthoritative = active === true;
  lastConfirmedAtMs = nowMs;
}

export function isOperatorBackgroundAuthoritative(): boolean {
  return backgroundAuthoritative;
}

export function getOperatorOwnershipConfirmedAtMs(): number | null {
  return lastConfirmedAtMs;
}

/**
 * Un callback de background solo se ejecuta si el task nativo está corriendo,
 * así que es autoritativo por definición. Foreground cede ante background.
 */
export function resolveOperatorIngestionRole(
  channel: OperatorIngestionChannel,
): OperatorIngestionRole {
  if (channel === 'background') return 'authoritative';
  return backgroundAuthoritative ? 'observe' : 'authoritative';
}

export function resetOperatorBackgroundOwnership(): void {
  backgroundAuthoritative = false;
  lastConfirmedAtMs = null;
}
