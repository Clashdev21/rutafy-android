import type { AuthUser } from '@/types/auth';

/**
 * Identidad en memoria del usuario autenticado.
 * La tarea de Operator no tiene acceso al árbol de React. No se persiste
 * y no duplica tokens: SecureStore sigue siendo la única copia.
 */
let current: AuthUser | null = null;

export function setAuthenticatedIdentity(user: AuthUser): void {
  current = user;
}

export function clearAuthenticatedIdentity(): void {
  current = null;
}

export function getAuthenticatedIdentity(): AuthUser | null {
  return current;
}

export function resetAuthenticatedIdentityForTests(): void {
  current = null;
}
