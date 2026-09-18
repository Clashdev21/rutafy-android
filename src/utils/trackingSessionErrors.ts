import axios from 'axios';

export type TrackingConflictCode =
  | 'session_not_active'
  | 'writer_conflict'
  | 'writer_unclaimed'
  | 'active_session_exists';

export type OperatorBatchCatchAction =
  | { type: 'cleanup'; reason: 'session_not_active' | 'writer_conflict'; requeue: false }
  | { type: 'resume_writer'; requeue: false }
  | { type: 'retry'; requeue: true };

function joinConflictToken(parts: unknown[]): string {
  return parts.filter((v): v is string => typeof v === 'string').join(' ');
}

export function classifyTrackingConflictCode(
  status: number,
  token: string,
): TrackingConflictCode | null {
  if (status !== 409) return null;
  if (token.includes('writer_conflict')) return 'writer_conflict';
  if (token.includes('writer_unclaimed')) return 'writer_unclaimed';
  if (token.includes('session_not_active')) return 'session_not_active';
  if (token.includes('active_session_exists')) return 'active_session_exists';
  return null;
}

function conflictTokenFromUnknown(error: unknown): { status: number; token: string } {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: string; code?: string; message?: string }
      | undefined;
    return {
      status: error.response?.status ?? 0,
      token: joinConflictToken([data?.error, data?.code, data?.message, error.message]),
    };
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const httpMatch = message.match(/http\s*(\d{3})/i);
  const status = httpMatch?.[1] ? Number(httpMatch[1]) : message.includes('409') ? 409 : 0;
  return { status: Number.isFinite(status) ? status : 0, token: message };
}

function hasConflictCode(error: unknown, code: TrackingConflictCode): boolean {
  const { status, token } = conflictTokenFromUnknown(error);
  if (status === 409) {
    return classifyTrackingConflictCode(status, token) === code;
  }
  // Tasks BG lanzan Error(code) sin status HTTP estructurado.
  return token.includes(code);
}

export function isTrackingSessionNotActiveError(error: unknown): boolean {
  return hasConflictCode(error, 'session_not_active');
}

export function isActiveSessionExistsError(error: unknown): boolean {
  return hasConflictCode(error, 'active_session_exists');
}

export function isWriterConflictError(error: unknown): boolean {
  return hasConflictCode(error, 'writer_conflict');
}

export function isWriterUnclaimedError(error: unknown): boolean {
  return hasConflictCode(error, 'writer_unclaimed');
}

export function classifyTrackingConflictFromResponse(
  status: number,
  parsed: Record<string, unknown> | null,
  detail: string,
): TrackingConflictCode | null {
  const token = joinConflictToken([
    parsed?.error,
    parsed?.code,
    parsed?.message,
    detail,
  ]);
  return classifyTrackingConflictCode(status, token);
}

export function decideOperatorBatchCatchAction(error: unknown): OperatorBatchCatchAction {
  if (isWriterConflictError(error)) {
    return { type: 'cleanup', reason: 'writer_conflict', requeue: false };
  }
  if (isWriterUnclaimedError(error)) {
    return { type: 'resume_writer', requeue: false };
  }
  if (isTrackingSessionNotActiveError(error)) {
    return { type: 'cleanup', reason: 'session_not_active', requeue: false };
  }
  return { type: 'retry', requeue: true };
}

/**
 * Errores 409 de /resume que hydrate debe consumir sin relanzar.
 * `forbidden`/red se clasifican aparte en el lifecycle (403/404 y transitorios).
 */
export function mapResumeHttpErrorToHydrateOutcome(
  error: unknown,
): 'writer_conflict' | 'inactive' | null {
  if (isWriterConflictError(error)) return 'writer_conflict';
  if (isTrackingSessionNotActiveError(error)) return 'inactive';
  return null;
}

export type CaptureResumeFollowUp = 'enable_gps' | 'cleanup' | 'preserve_offline' | 'abort';

export function decideCaptureResumeFollowUp(input: {
  resumeOutcome: 'ok' | 'writer_conflict' | 'transient' | 'forbidden' | 'inactive' | 'skipped';
  hasMatchingLocalSession: boolean;
}): CaptureResumeFollowUp {
  switch (input.resumeOutcome) {
    case 'ok':
      return 'enable_gps';
    case 'writer_conflict':
      return 'cleanup';
    case 'forbidden':
    case 'inactive':
      return input.hasMatchingLocalSession ? 'cleanup' : 'abort';
    case 'transient':
    case 'skipped':
      return input.hasMatchingLocalSession ? 'preserve_offline' : 'abort';
  }
}

export function getExistingSessionIdFromStartConflict(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { existing_session_id?: unknown } | undefined;
  const id = data?.existing_session_id;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length ? trimmed : null;
}
