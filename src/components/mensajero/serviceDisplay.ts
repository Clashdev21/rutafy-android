import type { Service } from '@/types/service';

export function getServiceCode(service: Service): string {
  const raw = String(service.service_id || '')
    .replace(/-/g, '')
    .slice(0, 6)
    .toUpperCase();
  return raw ? `RTF-${raw}` : service.service_code || 'RTF-SINCOD';
}
