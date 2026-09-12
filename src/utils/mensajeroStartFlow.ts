import type { StartTrackingSessionParams } from '@/services/trackingSessionService';

const DEFAULT_START_METADATA: Record<string, unknown> = { source: 'android_mvp' };

/**
 * Preserva metadata 3B y fusiona journey_id sin reemplazar keys existentes
 * salvo journey_id (autoridad del bootstrap).
 */
export function mergeJourneyIdIntoStartMetadata(
  existing: Record<string, unknown> | null | undefined,
  journeyId: string | null | undefined,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : { ...DEFAULT_START_METADATA };

  if (!Object.prototype.hasOwnProperty.call(base, 'source')) {
    base.source = DEFAULT_START_METADATA.source;
  }

  const id = typeof journeyId === 'string' ? journeyId.trim() : '';
  if (id) {
    base.journey_id = id;
  }

  return base;
}

export function buildTrackingStartParams(input: {
  vehicleLabel: string;
  consentAccepted: boolean;
  purpose?: StartTrackingSessionParams['purpose'];
  notes?: string;
  existingMetadata?: Record<string, unknown> | null;
  journeyId?: string | null;
}): StartTrackingSessionParams | { error: 'consent_required' | 'invalid_vehicle_label' } {
  if (!input.consentAccepted) {
    return { error: 'consent_required' };
  }
  const vehicle_label = input.vehicleLabel.trim();
  if (!vehicle_label) {
    return { error: 'invalid_vehicle_label' };
  }
  return {
    purpose: input.purpose ?? 'operacion_interna',
    vehicle_label,
    consent_accepted: true,
    notes: input.notes?.trim() || undefined,
    metadata: mergeJourneyIdIntoStartMetadata(input.existingMetadata, input.journeyId),
  };
}

export type StartSingleFlightResult<T> =
  | { status: 'ran'; value: T }
  | { status: 'skipped' };

export function createStartSingleFlight() {
  let inFlight = false;

  return {
    isBusy(): boolean {
      return inFlight;
    },
    async run<T>(fn: () => Promise<T>): Promise<StartSingleFlightResult<T>> {
      if (inFlight) {
        return { status: 'skipped' };
      }
      inFlight = true;
      try {
        const value = await fn();
        return { status: 'ran', value };
      } finally {
        inFlight = false;
      }
    },
    reset(): void {
      inFlight = false;
    },
  };
}

export const mensajeroStartSingleFlight = createStartSingleFlight();
