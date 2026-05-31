import type { Service, ServiceStatus } from '@/types/service';

export const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Solicitado',
  OFFERED: 'Buscando',
  CLAIMED: 'Tomado',
  STARTED: 'En curso',
  CLOSED: 'Cerrado',
  EXPIRED: 'Expirado',
  CANCELLED_BY_TRANSPORTER: 'Cancelado (transportista)',
  CANCELLED_BY_MESSENGER: 'Cancelado (mensajero)',
  FAILED_PICKUP: 'Falló recogida',
  FAILED_DROPOFF: 'Falló entrega',
  NO_SHOW: 'No show',
  PENDING: 'Pendiente',
  SEARCHING: 'Buscando',
};

export function getStatusLabel(status: ServiceStatus | string): string {
  const key = String(status).toUpperCase();
  return STATUS_LABELS[key] ?? key;
}

const TRANSPORTISTA_ACTIVE_PRIORITY: ServiceStatus[] = [
  'STARTED',
  'CLAIMED',
  'OFFERED',
  'REQUESTED',
  'SEARCHING',
  'PENDING',
];

const MENSAJERO_ACTIVE_STATUSES = new Set<ServiceStatus>(['CLAIMED', 'STARTED']);

export function pickTransportistaActiveService(services: Service[]): Service | null {
  for (const status of TRANSPORTISTA_ACTIVE_PRIORITY) {
    const found = services.find((s) => s.status === status);
    if (found) return found;
  }
  return services[0] ?? null;
}

export function pickMensajeroActiveService(services: Service[]): Service | null {
  const started = services.find((s) => s.status === 'STARTED');
  if (started) return started;
  const claimed = services.find((s) => s.status === 'CLAIMED');
  if (claimed) return claimed;
  return null;
}

export function isMensajeroOperationalActive(service: Service | null): boolean {
  if (!service) return false;
  return MENSAJERO_ACTIVE_STATUSES.has(service.status);
}
