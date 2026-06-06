import axios from 'axios';

import { isTransientNetworkError, NETWORK_UNAVAILABLE_MESSAGE } from '@/utils/networkErrors';

export function getApiErrorMessage(error: unknown, fallback = 'Ocurrió un error'): string {
  if (isTransientNetworkError(error)) {
    return NETWORK_UNAVAILABLE_MESSAGE;
  }
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
