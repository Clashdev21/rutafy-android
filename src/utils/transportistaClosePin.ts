/** Paridad con portex-rutafy TransportistaPanel — PIN de cierre de 4 dígitos. */
export const CLOSE_PIN_REGEX = /^\d{4}$/;

const PLACEHOLDER_VALUES = new Set(['N/D', '----', 'N/A', 'NULL', 'UNDEFINED']);

export function extractValidClosePinDigits(value: unknown): string | null {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return null;
  if (PLACEHOLDER_VALUES.has(raw) || PLACEHOLDER_VALUES.has(raw.toUpperCase())) {
    return null;
  }
  return CLOSE_PIN_REGEX.test(raw) ? raw : null;
}

export function shouldClearPersistedTransportistaClosePin(status: string): boolean {
  const s = String(status ?? '')
    .trim()
    .toUpperCase();
  if (s === 'CLOSED' || s === 'EXPIRED' || s === 'NO_SHOW') return true;
  if (s.startsWith('CANCELLED')) return true;
  if (s === 'FAILED_PICKUP' || s === 'FAILED_DROPOFF') return true;
  return false;
}

/** Estados operativos donde el transportista puede ver el PIN (paridad web). */
export function shouldShowTransportistaClosePin(status: string): boolean {
  const s = String(status ?? '')
    .trim()
    .toUpperCase();
  return (
    s === 'REQUESTED' ||
    s === 'OFFERED' ||
    s === 'PENDING' ||
    s === 'SEARCHING' ||
    s === 'CLAIMED' ||
    s === 'STARTED'
  );
}

export function pickClosePinFromCreateResponse(data: unknown): unknown {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return row.close_pin ?? row.closePin ?? null;
}

export function pickServiceIdFromCreateResponse(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const id = String(row.service_id ?? row.id ?? row.serviceId ?? '').trim();
  return id && id !== 'sin-id' ? id : null;
}
