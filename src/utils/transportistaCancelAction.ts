import type { Service } from '@/types/service';

/** Paridad con web: TransportistaPanel TRANSPORTISTA_CANCELABLE_STATUSES */
const CANCEL_ACTION_STATUSES = new Set([
  'REQUESTED',
  'PENDING',
  'SEARCHING',
  'OFFERED',
]);

export function shouldShowTransportistaCancelButton(
  service: Service | null | undefined,
): boolean {
  if (!service) return false;
  const status = String(service.status ?? '')
    .trim()
    .toUpperCase();
  return CANCEL_ACTION_STATUSES.has(status);
}
