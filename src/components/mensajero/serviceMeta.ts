import type { Service } from '@/types/service';

export function getServiceClosePin(service: Service): string | null {
  const meta = service.meta;
  if (!meta || typeof meta !== 'object') return null;
  const record = meta as Record<string, unknown>;
  const raw = record.close_pin ?? record.closure_pin ?? record.delivery_pin ?? record.pin;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}
