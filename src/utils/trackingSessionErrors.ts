import axios from 'axios';

export function isTrackingSessionNotActiveError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (error.response?.status !== 409) return false;
    const data = error.response.data as { error?: string; code?: string; message?: string };
    const token = [data?.error, data?.code, data?.message]
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    return token.includes('session_not_active');
  }
  if (error instanceof Error) {
    return error.message.includes('session_not_active');
  }
  return false;
}

export function isActiveSessionExistsError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (error.response?.status !== 409) return false;
    const data = error.response.data as { error?: string; code?: string; message?: string };
    const token = [data?.error, data?.code, data?.message]
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    return token.includes('active_session_exists');
  }
  if (error instanceof Error) {
    return error.message.includes('active_session_exists');
  }
  return false;
}

export function getExistingSessionIdFromStartConflict(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as { existing_session_id?: unknown } | undefined;
  const id = data?.existing_session_id;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length ? trimmed : null;
}
