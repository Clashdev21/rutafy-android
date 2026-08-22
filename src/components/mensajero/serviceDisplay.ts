import type { Service } from '@/types/service';

export function getServiceCode(service: Pick<Service, 'service_id' | 'service_code'>): string {
  const raw = String(service.service_id || '')
    .replace(/-/g, '')
    .slice(0, 6)
    .toUpperCase();
  return raw ? `RTF-${raw}` : service.service_code || 'RTF-SINCOD';
}

/**
 * Etiqueta humana de service_type.
 * Solo mapea valores confirmados; no inventa categorías backend.
 */
export function formatServiceTypeLabel(serviceType: string | null | undefined): string {
  const key = String(serviceType ?? '')
    .trim()
    .toUpperCase();
  if (!key) return 'Servicio';

  const MAP: Record<string, string> = {
    DOCS: 'Servicio documental',
  };

  return MAP[key] ?? humanizeUnknownType(key);
}

function humanizeUnknownType(key: string): string {
  if (key.length <= 24 && /^[A-Z0-9_]+$/.test(key)) {
    return key.replace(/_/g, ' ');
  }
  return key;
}

/** Tiempo relativo compacto para tarjetas de actividad. */
export function formatServiceRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return 'hace un momento';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
