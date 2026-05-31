import type { Service } from '@/types/service';

export const TRANSPORTISTA_CANCEL_NOT_CONNECTED =
  'Cancelación no conectada todavía';

const CANCEL_ACTION_STATUSES = new Set([
  'REQUESTED',
  'OFFERED',
  'CLAIMED',
  'STARTED',
  'PENDING',
  'SEARCHING',
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
