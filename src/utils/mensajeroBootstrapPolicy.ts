import axios from 'axios';

import type {
  OperationalBootstrapResponse,
  StoredMensajeroBootstrap,
} from '@/types/operationalBootstrap';
import { decideMensajeroStopFlow } from './mensajeroStopFlow.ts';
import {
  isConfirmedAuthInvalidError,
  isTransientNetworkError,
  isTransientServerError,
} from './networkErrors.ts';

export type BootstrapFetchErrorClass =
  | 'auth'
  | 'not_found'
  | 'transient'
  | 'offline'
  | 'unknown';

export function classifyBootstrapFetchError(error: unknown): BootstrapFetchErrorClass {
  if (isConfirmedAuthInvalidError(error)) return 'auth';
  if (axios.isAxiosError(error) && error.response?.status === 404) return 'not_found';
  if (isTransientNetworkError(error)) return 'offline';
  if (isTransientServerError(error)) return 'transient';
  if (error instanceof Error && error.message === 'invalid_operational_bootstrap') {
    return 'unknown';
  }
  return 'unknown';
}

export type MensajeroBootstrapDecision =
  | { type: 'preserve_offline' }
  | { type: 'auth_error' }
  | { type: 'degrade'; reason: 'JOURNEYS_UNAVAILABLE' | 'endpoint_missing' | 'parse_failed' }
  | { type: 'noop' }
  | { type: 'stop'; sessionId: string | null }
  | { type: 'start'; journeyId: string; vehicleLabel: string }
  | { type: 'consent_required'; journeyId: string }
  | { type: 'capture_pending'; journeyId: string }
  | { type: 'hydrate'; sessionId: string; journeyId: string | null }
  | { type: 'conflict' }
  | { type: 'pending_assignment' };

export const BOOTSTRAP_CONFLICT_NOTICE =
  'Tu operación requiere validación antes de iniciar el seguimiento.';

export const BOOTSTRAP_PENDING_ASSIGNMENT_NOTICE =
  'Tu unidad aún no está habilitada para seguimiento.';

export const BOOTSTRAP_CONSENT_REQUIRED_NOTICE =
  'Hay una operación que requiere seguimiento. Acepta el consentimiento en Captura logística para iniciar.';

export const BOOTSTRAP_CAPTURE_PENDING_NOTICE =
  'El seguimiento de tu operación se activará al finalizar el servicio en curso.';

export function bootstrapNoticeForDecision(
  decision: MensajeroBootstrapDecision,
): string | null {
  switch (decision.type) {
    case 'conflict':
      return BOOTSTRAP_CONFLICT_NOTICE;
    case 'pending_assignment':
      return BOOTSTRAP_PENDING_ASSIGNMENT_NOTICE;
    case 'consent_required':
      return BOOTSTRAP_CONSENT_REQUIRED_NOTICE;
    case 'capture_pending':
      return BOOTSTRAP_CAPTURE_PENDING_NOTICE;
    default:
      return null;
  }
}

export function nextBootstrapSnapshot(
  previous: StoredMensajeroBootstrap | null,
  bootstrap: OperationalBootstrapResponse | null,
  nowIso: string,
  decision: MensajeroBootstrapDecision,
): StoredMensajeroBootstrap {
  const prev = previous ?? {
    journeyId: null,
    trackingSessionId: null,
    lastBootstrapAction: null,
    lastBootstrapAt: null,
  };

  if (
    decision.type === 'preserve_offline' ||
    decision.type === 'auth_error' ||
    decision.type === 'degrade'
  ) {
    return prev;
  }

  if (!bootstrap) return prev;

  const journeyId =
    decision.type === 'stop'
      ? null
      : bootstrap.journey?.journey_id?.trim() || prev.journeyId;

  let trackingSessionId = prev.trackingSessionId;
  if (decision.type === 'stop') {
    trackingSessionId = null;
  } else if (decision.type === 'hydrate') {
    trackingSessionId = decision.sessionId;
  } else if (bootstrap.tracking.tracking_session_id) {
    trackingSessionId = bootstrap.tracking.tracking_session_id;
  }

  return {
    journeyId,
    trackingSessionId,
    lastBootstrapAction: bootstrap.action,
    lastBootstrapAt: nowIso,
  };
}

export function decideMensajeroBootstrapApply(input: {
  fetchError: BootstrapFetchErrorClass | null;
  bootstrap: OperationalBootstrapResponse | null;
  localSessionId: string | null;
  captureActive: boolean;
  consentAccepted: boolean;
  canStartOperatorGps: boolean;
  startBusy: boolean;
}): MensajeroBootstrapDecision {
  if (input.fetchError === 'offline' || input.fetchError === 'transient') {
    return { type: 'preserve_offline' };
  }
  if (input.fetchError === 'auth') {
    return { type: 'auth_error' };
  }
  if (input.fetchError === 'not_found') {
    return { type: 'degrade', reason: 'endpoint_missing' };
  }
  if (input.fetchError === 'unknown' || !input.bootstrap) {
    return { type: 'degrade', reason: 'parse_failed' };
  }

  const bootstrap = input.bootstrap;

  if (bootstrap.reason === 'JOURNEYS_UNAVAILABLE') {
    return { type: 'degrade', reason: 'JOURNEYS_UNAVAILABLE' };
  }

  const stop = decideMensajeroStopFlow({
    bootstrap,
    localSessionId: input.localSessionId,
  });
  if (stop.type === 'stop') {
    return { type: 'stop', sessionId: stop.sessionId };
  }

  if (bootstrap.action === 'CONFLICT') {
    return { type: 'conflict' };
  }

  if (bootstrap.action === 'PENDING_ASSIGNMENT') {
    return { type: 'pending_assignment' };
  }

  if (bootstrap.action === 'CAPTURE_ACTIVE') {
    const sessionId =
      bootstrap.tracking.tracking_session_id?.trim() || input.localSessionId;
    if (!sessionId) {
      return { type: 'noop' };
    }
    return {
      type: 'hydrate',
      sessionId,
      journeyId: bootstrap.journey?.journey_id ?? null,
    };
  }

  if (bootstrap.action === 'CAPTURE_REQUIRED') {
    const journeyId = bootstrap.journey?.journey_id?.trim() ?? '';
    if (!journeyId) {
      return { type: 'noop' };
    }
    if (input.localSessionId) {
      return {
        type: 'hydrate',
        sessionId: input.localSessionId,
        journeyId,
      };
    }
    if (!input.consentAccepted) {
      return { type: 'consent_required', journeyId };
    }
    if (input.startBusy) {
      return { type: 'noop' };
    }
    if (!input.canStartOperatorGps) {
      return { type: 'capture_pending', journeyId };
    }
    const plate =
      bootstrap.operational_unit?.plate?.trim() ||
      bootstrap.operational_unit?.plate_normalized?.trim() ||
      'Unidad operativa';
    return { type: 'start', journeyId, vehicleLabel: plate };
  }

  // NONE + capture_should_stop false: no start, no wipe recovery.
  return { type: 'noop' };
}
