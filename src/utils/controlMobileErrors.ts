import axios from 'axios';

export type ControlUiErrorKind = 'forbidden' | 'not_found' | 'network' | 'generic';

export type ControlUiError = {
  kind: ControlUiErrorKind;
  message: string;
};

export const CONTROL_NETWORK_ERROR_MESSAGE = 'No pudimos actualizar la operación.';
export const CONTROL_FORBIDDEN_ERROR_MESSAGE = 'No tienes permisos para ver esta operación.';
export const CONTROL_NOT_FOUND_ERROR_MESSAGE = 'No encontramos esta unidad.';
export const CONTROL_EMPTY_TODAY_MESSAGE = 'No hay unidades programadas para hoy.';

function isNetworkLike(error: unknown): boolean {
  if (axios.isAxiosError(error) && !error.response) return true;
  const code = axios.isAxiosError(error) ? error.code ?? '' : '';
  if (code === 'ECONNABORTED' || code === 'ERR_NETWORK' || code === 'ETIMEDOUT') return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('offline') ||
    msg.includes('sin conexión')
  );
}

export function resolveControlUiError(error: unknown): ControlUiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 403) {
      return { kind: 'forbidden', message: CONTROL_FORBIDDEN_ERROR_MESSAGE };
    }
    if (status === 404) {
      return { kind: 'not_found', message: CONTROL_NOT_FOUND_ERROR_MESSAGE };
    }
    if (status === 401) {
      return { kind: 'generic', message: CONTROL_NETWORK_ERROR_MESSAGE };
    }
    if (status === 500 || status === 502 || status === 503 || status === 504) {
      return { kind: 'network', message: CONTROL_NETWORK_ERROR_MESSAGE };
    }
  }

  if (isNetworkLike(error)) {
    return { kind: 'network', message: CONTROL_NETWORK_ERROR_MESSAGE };
  }

  return { kind: 'generic', message: CONTROL_NETWORK_ERROR_MESSAGE };
}
