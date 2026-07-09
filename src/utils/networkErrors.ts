import axios from 'axios';

export const NETWORK_UNAVAILABLE_MESSAGE = 'Sin conexión. Reintentando.';

export function isTransientNetworkError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) return true;
    const code = error.code ?? '';
    if (code === 'ECONNABORTED' || code === 'ERR_NETWORK' || code === 'ETIMEDOUT') {
      return true;
    }
    if (error.message === 'Network Error') return true;
  }

  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('network error') ||
      msg.includes('fetch failed') ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('offline') ||
      msg.includes('sin conexión')
    ) {
      return true;
    }
  }

  return false;
}

export function isTransientServerError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 500 || status === 502 || status === 503 || status === 504;
}

export function isConfirmedAuthInvalidError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}
