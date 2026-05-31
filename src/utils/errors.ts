import axios from 'axios';

export function getApiErrorMessage(error: unknown, fallback = 'Ocurrió un error'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
