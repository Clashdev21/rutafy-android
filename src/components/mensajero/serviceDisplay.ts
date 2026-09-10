import type { Service } from '@/types/service';

export function getServiceCode(service: Pick<Service, 'service_id' | 'service_code'>): string {
  const raw = String(service.service_id || '')
    .replace(/-/g, '')
    .slice(0, 6)
    .toUpperCase();
  return raw ? `RTF-${raw}` : service.service_code || 'RTF-SINCOD';
}

/**
 * Etiquetas de presentación. Códigos = contrato backend
 * (DOCS_PICKUP, CUMPLIDOS, DOCS_DELIVERY, MOTO_COURIER, MOTO_RIDE; alias DOCS → DOCS_PICKUP).
 * La API conserva el enum; la UI nunca muestra el código crudo.
 */
const SERVICE_TYPE_LABELS: Record<string, string> = {
  DOCS_PICKUP: 'Recogida de documentos',
  DOCS: 'Recogida de documentos',
  CUMPLIDOS: 'Recogida de cumplidos',
  DOCS_DELIVERY: 'Entrega de documentos',
  MOTO_COURIER: 'Paquetes',
  MOTO_RIDE: 'Carrera de moto',
};

const UNKNOWN_SERVICE_TYPE_LABEL = 'Servicio de mensajería';

export function formatServiceTypeLabel(serviceType: string | null | undefined): string {
  const key = String(serviceType ?? '')
    .trim()
    .toUpperCase();
  if (!key) return UNKNOWN_SERVICE_TYPE_LABEL;

  const label = SERVICE_TYPE_LABELS[key];
  if (label) return label;

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[service-type-label] unknown code', key);
  }
  return UNKNOWN_SERVICE_TYPE_LABEL;
}

export const getServiceTypeLabel = formatServiceTypeLabel;

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
