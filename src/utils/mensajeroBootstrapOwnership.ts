import type { StoredMensajeroBootstrap } from '../types/operationalBootstrap.ts';

const ACTIONS = [
  'NONE',
  'CAPTURE_REQUIRED',
  'CAPTURE_ACTIVE',
  'CONFLICT',
  'PENDING_ASSIGNMENT',
];

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * El snapshot de bootstrap es por usuario: journeyId/trackingSessionId de otro
 * mensajero nunca deben alimentar el metadata de un start ajeno.
 * Storage corrupto o de otro dueño → null (fail-safe).
 */
export function normalizeStoredBootstrap(
  raw: unknown,
  userId: string | null | undefined,
): StoredMensajeroBootstrap | null {
  const owner = trimOrNull(userId);
  if (!owner) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const row = raw as Record<string, unknown>;
  if (trimOrNull(row.userId) !== owner) return null;

  const action = row.lastBootstrapAction;
  const lastBootstrapAction =
    typeof action === 'string' && ACTIONS.includes(action)
      ? (action as StoredMensajeroBootstrap['lastBootstrapAction'])
      : null;

  return {
    journeyId: trimOrNull(row.journeyId),
    trackingSessionId: trimOrNull(row.trackingSessionId),
    lastBootstrapAction,
    lastBootstrapAt: trimOrNull(row.lastBootstrapAt),
  };
}

export function serializeStoredBootstrap(
  userId: string,
  snapshot: StoredMensajeroBootstrap,
): Record<string, unknown> {
  return { ...snapshot, userId };
}

/** Fail-safe: storage corrupto o de otro usuario nunca concede consentimiento. */
export function isConsentAcceptedFor(
  raw: unknown,
  userId: string | null | undefined,
): boolean {
  const id = trimOrNull(userId);
  if (!id) return false;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const row = raw as Record<string, unknown>;
  if (trimOrNull(row.userId) !== id) return false;
  return trimOrNull(row.acceptedAt) !== null;
}
