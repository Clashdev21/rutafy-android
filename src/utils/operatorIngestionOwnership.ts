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
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

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

export type OperatorNativeTaskState = 'active' | 'inactive' | 'unknown';

/**
 * Lee el estado nativo del task operator. `unknown` significa que la consulta
 * falló: el llamador no debe inventar ownership.
 */
export async function readOperatorTaskNativeState(
  taskName: string,
): Promise<OperatorNativeTaskState> {
  if (!TaskManager.isTaskDefined(taskName)) {
    return 'inactive';
  }
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(taskName);
    return started ? 'active' : 'inactive';
  } catch {
    return 'unknown';
  }
}

/**
 * Sincroniza ownership solo cuando el estado nativo está confirmado.
 * Devuelve el estado leído para que start/ensure/stop decidan el flujo.
 */
export async function syncOperatorBackgroundOwnershipFromNative(
  taskName: string,
): Promise<OperatorNativeTaskState> {
  const state = await readOperatorTaskNativeState(taskName);
  if (state === 'unknown') return state;
  setOperatorBackgroundOwnership(state === 'active');
  return state;
}

/**
 * Restaura ownership confirmado sin arrancar el task.
 * `ensureOperatorBackgroundTracking` la usa antes de start: si el task ya
 * corre, FG pasa a observe de inmediato, sin esperar el siguiente callback BG.
 */
export async function ensureOperatorBackgroundOwnership(
  hasActiveSession: boolean,
  taskName: string,
): Promise<boolean> {
  if (!hasActiveSession) {
    setOperatorBackgroundOwnership(false);
    return false;
  }
  const native = await syncOperatorBackgroundOwnershipFromNative(taskName);
  return native === 'active';
}
