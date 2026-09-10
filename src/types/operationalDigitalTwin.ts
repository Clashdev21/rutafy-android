export type DigitalTwinEta = {
  destination_code?: string | null;
  eta_at?: string | null;
  source?: string | null;
  source_label?: string | null;
  confidence?: number | null;
  label?: string | null;
  is_expired?: boolean | null;
  expired_by_minutes?: number | null;
};

export type DigitalTwinRisk = {
  level?: string | null;
  score?: number | null;
  reasons?: string[] | null;
};

export type DigitalTwinJourneyProgress = {
  percent?: number | null;
  stage?: string | null;
  completed_steps?: number | null;
  remaining_steps?: number | null;
  current_step?: string | null;
  current_step_label?: string | null;
  next_step?: string | null;
  next_step_label?: string | null;
  total_steps?: number | null;
};

export type DigitalTwinLocation = {
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  node_code?: string | null;
};

export type DigitalTwinDeclaredTruth = {
  declared_port_code?: string | null;
  scheduled_at?: string | null;
  destination_code?: string | null;
  status_raw?: string | null;
  driver_name?: string | null;
  plate?: string | null;
};

export type DigitalTwinDriver = {
  messenger_id?: string | null;
  name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  plate?: string | null;
  vehicle_type?: string | null;
  gps_status?: string | null;
  last_location_at?: string | null;
};

export type DigitalTwinTimelineEvent = {
  event_type?: string | null;
  detected_at?: string | null;
  node_code?: string | null;
  label?: string | null;
  time?: string | null;
};

export type DigitalTwinTimelineSummaryItem = {
  time?: string | null;
  label?: string | null;
};

export type DigitalTwinJourneyLiveStep = {
  step?: string | null;
  status?: string | null;
};

export type OperationalDigitalTwinDetail = {
  trace_id?: string | null;
  container_id?: string | null;
  program_code?: string | null;
  client_name?: string | null;
  current_phase?: string | null;
  current_phase_label?: string | null;
  technical_gps_status?: string | null;
  current_location?: DigitalTwinLocation | null;
  journey_progress?: DigitalTwinJourneyProgress | null;
  journey_live?: DigitalTwinJourneyLiveStep[] | null;
  eta?: DigitalTwinEta | null;
  risk?: DigitalTwinRisk | null;
  operational_score?: number | null;
  declared_truth?: DigitalTwinDeclaredTruth | null;
  driver?: DigitalTwinDriver | null;
  timeline?: DigitalTwinTimelineEvent[] | null;
  timeline_summary?: DigitalTwinTimelineSummaryItem[] | null;
  alerts?: Array<{ severity?: string | null; code?: string | null; message?: string | null }> | null;
};
