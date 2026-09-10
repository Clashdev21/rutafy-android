export const OPERATIONAL_CONTROL_STATES = [
  'PROGRAMADO',
  'ESPERANDO GPS',
  'ESPERANDO MOVIMIENTO',
  'EN PUERTO',
  'EN RUTA',
  'FINALIZADO',
  'ALERTA',
] as const;

export type OperationalControlState = (typeof OPERATIONAL_CONTROL_STATES)[number];

export const OPERATIONAL_CONTROL_RISK_LEVELS = ['NORMAL', 'MEDIO', 'ALTO', 'CRITICO'] as const;
export type OperationalControlRiskLevel = (typeof OPERATIONAL_CONTROL_RISK_LEVELS)[number];

export type OperationalControlAlert = {
  severity?: string | null;
  code?: string | null;
  message?: string | null;
};

/** Fila real de GET /v1/admin/operational-control (enrichContainerRow). */
export type OperationalControlContainer = {
  container_id?: string | null;
  client_name?: string | null;
  program_code?: string | null;
  driver_name?: string | null;
  phone?: string | null;
  plate?: string | null;
  vehicle_type?: string | null;
  declared_port_code?: string | null;
  confirmed_port_code?: string | null;
  destination_code?: string | null;
  status_raw?: string | null;
  monitoring_status?: string | null;
  operational_state?: string | null;
  operational_phase?: string | null;
  driver_assignment_state?: string | null;
  match_status?: string | null;
  match_score?: number | null;
  gps_status?: string | null;
  risk_level?: string | null;
  schedule_status?: string | null;
  availability_status?: string | null;
  scheduled_at?: string | null;
  activated_at?: string | null;
  current_lat?: number | null;
  current_lng?: number | null;
  last_location_at?: string | null;
  updated_at?: string | null;
  has_history?: boolean | null;
  history_count?: number | null;
  monitoring_id?: string | null;
  declaration_id?: string | null;
  alerts?: OperationalControlAlert[] | null;
};

export type OperationalControlSummary = {
  scheduled?: number | null;
  pending_gps?: number | null;
  waiting_movement?: number | null;
  active?: number | null;
  completed?: number | null;
  manual_review?: number | null;
  containers_total?: number | null;
  drivers_online?: number | null;
  drivers_offline?: number | null;
  average_match_score?: number | null;
  critical_alerts?: number | null;
  warning_alerts?: number | null;
  auto_match_percentage?: number | null;
  manual_review_percentage?: number | null;
  no_match_percentage?: number | null;
  kpis?: Record<string, number | null> | null;
};

export type OperationalControlListResponse = {
  trace_id?: string | null;
  view?: string | null;
  summary?: OperationalControlSummary | null;
  containers?: OperationalControlContainer[] | null;
};

export type ControlListFilter =
  | 'todos'
  | 'programados'
  | 'en_puerto'
  | 'en_transito'
  | 'finalizados'
  | 'con_novedad';

export type ControlKpiId =
  | 'programadas'
  | 'en_puerto'
  | 'en_transito'
  | 'entregadas'
  | 'con_novedad';

export type ControlKpiCard = {
  id: ControlKpiId;
  label: string;
  value: number;
};

export type ControlUnitCard = {
  containerId: string;
  origin: string;
  destination: string;
  operationalState: string;
  scheduledAt: string | null;
  scheduledLabel: string;
  plate: string | null;
  driverName: string | null;
  lastUpdateAt: string | null;
  lastUpdateLabel: string;
  riskLevel: string | null;
};
