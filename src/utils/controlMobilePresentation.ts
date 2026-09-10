export type ControlPresentationField =
  | 'containerId'
  | 'clientName'
  | 'origin'
  | 'destination'
  | 'operationalState'
  | 'currentPhaseLabel'
  | 'progress'
  | 'eta'
  | 'etaSourceLabel'
  | 'lastUpdate'
  | 'timeline'
  | 'riskLevel'
  | 'riskReasons'
  | 'driverName'
  | 'plate'
  | 'scheduledAt'
  | 'riskScore'
  | 'operationalScore'
  | 'programCode'
  | 'currentPhaseCode'
  | 'etaConfidence'
  | 'etaSource'
  | 'gpsStatus'
  | 'matchScore'
  | 'declarationId'
  | 'monitoringId'
  | 'messengerId'
  | 'nodeCode'
  | 'technicalAlerts';

const PRESENTATION_HIDDEN_FIELDS: ReadonlySet<ControlPresentationField> = new Set([
  'riskScore',
  'operationalScore',
  'programCode',
  'currentPhaseCode',
  'etaConfidence',
  'etaSource',
  'gpsStatus',
  'matchScore',
  'declarationId',
  'monitoringId',
  'messengerId',
  'nodeCode',
  'technicalAlerts',
]);

export function isPresentationHiddenField(
  field: ControlPresentationField,
  presentationMode: boolean,
): boolean {
  if (!presentationMode) return false;
  return PRESENTATION_HIDDEN_FIELDS.has(field);
}

export function shouldShowControlField(
  field: ControlPresentationField,
  presentationMode: boolean,
): boolean {
  return !isPresentationHiddenField(field, presentationMode);
}
