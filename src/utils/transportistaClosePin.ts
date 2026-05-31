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

function pickFromRecord(row: Record<string, unknown>, pinKeys: boolean): unknown {
  if (pinKeys) {
    return row.close_pin ?? row.closePin ?? row.close_code ?? null;
  }
  const id = String(row.service_id ?? row.id ?? row.serviceId ?? row.uuid ?? '').trim();
  return id && id !== 'sin-id' ? id : null;
}

export function pickClosePinFromCreateResponse(data: unknown): unknown {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const direct = pickFromRecord(row, true);
  if (direct != null) return direct;

  for (const key of ['service', 'data', 'result'] as const) {
    const nested = row[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const fromNested = pickFromRecord(nested as Record<string, unknown>, true);
      if (fromNested != null) return fromNested;
    }
  }
  return null;
}

export function pickServiceIdFromCreateResponse(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const direct = pickFromRecord(row, false);
  if (typeof direct === 'string') return direct;

  for (const key of ['service', 'data', 'result'] as const) {
    const nested = row[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const fromNested = pickFromRecord(nested as Record<string, unknown>, false);
      if (typeof fromNested === 'string') return fromNested;
    }
  }
  return null;
}

/** Log de auditoría temporal para inspeccionar respuesta de POST /v1/services. */
export function auditCreateServiceResponse(data: unknown): void {
  console.log('[create-service-response]', JSON.stringify(data, null, 2));

  if (!data || typeof data !== 'object') {
    console.log('[create-service-audit]', { root: 'not-an-object' });
    return;
  }

  const row = data as Record<string, unknown>;
  const rootKeys = Object.keys(row);
  const nestedService =
    row.service && typeof row.service === 'object' ? Object.keys(row.service as object) : null;
  const nestedData =
    row.data && typeof row.data === 'object' ? Object.keys(row.data as object) : null;

  console.log('[create-service-audit]', {
    rootKeys,
    hasClosePin: 'close_pin' in row,
    hasClosePinCamel: 'closePin' in row,
    hasCloseCode: 'close_code' in row,
    close_pin: row.close_pin ?? null,
    closePin: row.closePin ?? null,
    close_code: row.close_code ?? null,
    service_id: row.service_id ?? null,
    id: row.id ?? null,
    nestedServiceKeys: nestedService,
    nestedDataKeys: nestedData,
    pickedServiceId: pickServiceIdFromCreateResponse(data),
    pickedClosePin: pickClosePinFromCreateResponse(data),
    pickedClosePinValid: extractValidClosePinDigits(pickClosePinFromCreateResponse(data)),
  });
}
