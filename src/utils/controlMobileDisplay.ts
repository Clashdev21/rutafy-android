import type {
  ControlKpiCard,
  ControlListFilter,
  ControlUnitCard,
  OperationalControlContainer,
  OperationalControlListResponse,
} from '../types/operationalControl';
import type {
  DigitalTwinEta,
  DigitalTwinRisk,
  DigitalTwinTimelineEvent,
  OperationalDigitalTwinDetail,
} from '../types/operationalDigitalTwin';

const BOGOTA_TIME_ZONE = 'America/Bogota';

function formatBogotaDateTime(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatBogotaTime(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export const CONTROL_EMPTY_VALUE = '—';

const TWIN_EVENT_LABELS: Record<string, string> = {
  DECLARATION: 'Programado',
  MATCHED: 'Programado',
  DRIVER_ASSIGNED: 'Programado',
  WAITING_GPS: 'Esperando señal GPS',
  APPROACHING_PORT: 'Aproximándose al puerto',
  STOPPED_ON_ACCESS_ROAD: 'Esperando ingreso',
  QUEUEING_AT_GATE: 'En fila de ingreso',
  AT_GATE: 'En ingreso al puerto',
  ENTERED_PORT: 'Ingresó al puerto',
  INSIDE_PORT: 'Dentro del puerto',
  INSIDE_MODULE: 'Operación en módulo',
  EXITING_PORT: 'Saliendo del puerto',
  RETURNING_FROM_PORT: 'Saliendo del puerto',
  LOADING_INFERRED: 'Saliendo del puerto',
  IN_TRANSIT: 'En tránsito hacia CDR',
  ARRIVED_DESTINATION: 'Llegó al CDR',
  UNLOADING_INFERRED: 'Descargue inferido',
  DELIVERED_INFERRED: 'Operación finalizada',
  GPS_LOST: 'Sin señal GPS',
  GPS_RESTORED: 'Señal GPS restaurada',
};

const RISK_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  MEDIO: 'Medio',
  ALTO: 'Alto',
  CRITICO: 'Crítico',
};

export function asSafeText(value: unknown, fallback = CONTROL_EMPTY_VALUE): string {
  if (value == null) return fallback;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback;
    return String(value);
  }
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

export function mapControlContainers(
  response: OperationalControlListResponse | null | undefined,
): ControlUnitCard[] {
  const rows = Array.isArray(response?.containers) ? response.containers : [];
  return rows.map(mapControlContainer).filter((row) => row.containerId.length > 0);
}

export function mapControlContainer(row: OperationalControlContainer | null | undefined): ControlUnitCard {
  const containerId = asSafeText(row?.container_id, '');
  const scheduledAt = typeof row?.scheduled_at === 'string' ? row.scheduled_at : null;
  const lastUpdateAt =
    (typeof row?.updated_at === 'string' && row.updated_at) ||
    (typeof row?.last_location_at === 'string' && row.last_location_at) ||
    null;

  return {
    containerId,
    origin: asSafeText(row?.declared_port_code),
    destination: asSafeText(row?.destination_code),
    operationalState: asSafeText(row?.operational_state, 'Sin estado'),
    scheduledAt,
    scheduledLabel: formatBogotaDateTime(scheduledAt) ?? 'Sin horario',
    plate: typeof row?.plate === 'string' && row.plate.trim() ? row.plate.trim() : null,
    driverName:
      typeof row?.driver_name === 'string' && row.driver_name.trim() ? row.driver_name.trim() : null,
    lastUpdateAt,
    lastUpdateLabel: formatBogotaDateTime(lastUpdateAt) ?? 'Sin actualización',
    riskLevel: typeof row?.risk_level === 'string' && row.risk_level.trim() ? row.risk_level.trim() : null,
  };
}

/**
 * Grupos de presentación v1 — no son estados nuevos ni reinterpretan el backend.
 * ESPERANDO GPS / ESPERANDO MOVIMIENTO solo aparecen en el filtro "Todos".
 */
export function deriveControlKpis(units: ControlUnitCard[]): ControlKpiCard[] {
  const counts = {
    programadas: 0,
    en_puerto: 0,
    en_transito: 0,
    entregadas: 0,
    con_novedad: 0,
  };

  for (const unit of units) {
    if (unit.operationalState === 'PROGRAMADO') counts.programadas += 1;
    if (unit.operationalState === 'EN PUERTO') counts.en_puerto += 1;
    if (unit.operationalState === 'EN RUTA') counts.en_transito += 1;
    if (unit.operationalState === 'FINALIZADO') counts.entregadas += 1;
    if (unit.operationalState === 'ALERTA') counts.con_novedad += 1;
  }

  return [
    { id: 'programadas', label: 'Programadas', value: counts.programadas },
    { id: 'en_puerto', label: 'En puerto', value: counts.en_puerto },
    { id: 'en_transito', label: 'En tránsito', value: counts.en_transito },
    { id: 'entregadas', label: 'Entregadas', value: counts.entregadas },
    { id: 'con_novedad', label: 'Con novedad', value: counts.con_novedad },
  ];
}

export function matchesControlFilter(unit: ControlUnitCard, filter: ControlListFilter): boolean {
  if (filter === 'todos') return true;
  if (filter === 'programados') return unit.operationalState === 'PROGRAMADO';
  if (filter === 'en_puerto') return unit.operationalState === 'EN PUERTO';
  if (filter === 'en_transito') return unit.operationalState === 'EN RUTA';
  if (filter === 'finalizados') return unit.operationalState === 'FINALIZADO';
  if (filter === 'con_novedad') return unit.operationalState === 'ALERTA';
  return true;
}

export function matchesControlSearch(unit: ControlUnitCard, query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return true;
  const container = unit.containerId.toUpperCase();
  const plate = (unit.plate ?? '').toUpperCase();
  return container.includes(q) || plate.includes(q);
}

export function filterControlUnits(
  units: ControlUnitCard[],
  filter: ControlListFilter,
  query: string,
): ControlUnitCard[] {
  return units.filter((unit) => matchesControlFilter(unit, filter) && matchesControlSearch(unit, query));
}

export function formatRiskLabel(level: string | null | undefined): string {
  if (!level || typeof level !== 'string') return CONTROL_EMPTY_VALUE;
  return RISK_LABELS[level.trim().toUpperCase()] ?? asSafeText(level);
}

export type ControlEtaView = {
  available: boolean;
  expired: boolean;
  label: string;
  atLabel: string | null;
  sourceLabel: string | null;
};

export function mapEtaForDisplay(eta: DigitalTwinEta | null | undefined): ControlEtaView {
  const label = typeof eta?.label === 'string' ? eta.label.trim() : '';
  const etaAt = typeof eta?.eta_at === 'string' ? eta.eta_at : null;
  const sourceLabel =
    typeof eta?.source_label === 'string' && eta.source_label.trim() ? eta.source_label.trim() : null;
  const expired = Boolean(eta?.is_expired);

  if (!eta || (!label && !etaAt)) {
    return {
      available: false,
      expired: false,
      label: 'ETA no disponible',
      atLabel: null,
      sourceLabel: null,
    };
  }

  if (!etaAt && /no disponible/i.test(label)) {
    return {
      available: false,
      expired: false,
      label: 'ETA no disponible',
      atLabel: null,
      sourceLabel,
    };
  }

  return {
    available: true,
    expired,
    label: expired ? (label || 'ETA vencido') : (label || 'ETA'),
    atLabel: formatBogotaDateTime(etaAt),
    sourceLabel,
  };
}

export type ControlRiskView = {
  level: string;
  levelLabel: string;
  score: number | null;
  reasons: string[];
};

export function mapRiskForDisplay(risk: DigitalTwinRisk | null | undefined): ControlRiskView {
  const level = typeof risk?.level === 'string' && risk.level.trim() ? risk.level.trim() : 'NORMAL';
  const score = typeof risk?.score === 'number' && Number.isFinite(risk.score) ? risk.score : null;
  const reasons = Array.isArray(risk?.reasons)
    ? risk.reasons.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    : [];
  return {
    level,
    levelLabel: formatRiskLabel(level),
    score,
    reasons,
  };
}

export type ControlTimelineItem = {
  label: string;
  atIso: string | null;
  atLabel: string;
  current?: boolean;
};

export function mapTwinTimeline(
  twin: OperationalDigitalTwinDetail | null | undefined,
): ControlTimelineItem[] {
  const items: ControlTimelineItem[] = [];
  const scheduledAt = twin?.declared_truth?.scheduled_at;
  if (typeof scheduledAt === 'string' && scheduledAt.trim()) {
    items.push({
      label: 'Programado',
      atIso: scheduledAt,
      atLabel: formatBogotaDateTime(scheduledAt) ?? CONTROL_EMPTY_VALUE,
    });
  }

  const events = Array.isArray(twin?.timeline) ? twin.timeline : [];
  for (const event of events) {
    const mapped = mapTimelineEvent(event);
    if (mapped) items.push(mapped);
  }

  const currentLabel =
    typeof twin?.current_phase_label === 'string' && twin.current_phase_label.trim()
      ? twin.current_phase_label.trim()
      : null;
  if (currentLabel && !items.some((item) => item.label === currentLabel)) {
    items.push({
      label: currentLabel,
      atIso: null,
      atLabel: 'Estado actual',
      current: true,
    });
  } else if (items.length > 0) {
    items[items.length - 1] = { ...items[items.length - 1], current: true };
  }

  return items;
}

function mapTimelineEvent(event: DigitalTwinTimelineEvent | null | undefined): ControlTimelineItem | null {
  if (!event) return null;
  const eventType = typeof event.event_type === 'string' ? event.event_type.trim() : '';
  const detectedAt = typeof event.detected_at === 'string' ? event.detected_at : null;
  const labelFromType = eventType ? TWIN_EVENT_LABELS[eventType] : null;
  const label = labelFromType || asSafeText(event.label, eventType ? eventType.replace(/_/g, ' ') : '');
  if (!label && !detectedAt) return null;
  return {
    label: label || 'Evento',
    atIso: detectedAt,
    atLabel: formatBogotaDateTime(detectedAt) ?? formatBogotaTime(detectedAt) ?? CONTROL_EMPTY_VALUE,
  };
}

export function mapProgressPercent(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function mapLocationLabel(
  name: unknown,
  lastLocationAt: string | null | undefined,
): { name: string; updatedLabel: string | null } {
  return {
    name: asSafeText(name, 'Ubicación no disponible'),
    updatedLabel: formatBogotaDateTime(lastLocationAt),
  };
}
