import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { TRACKING_SESSION_ENDPOINTS } from '@/api/endpoints';
import { tokenStorage } from '@/auth/tokenStorage';
import {
  getOrCreateDeviceId,
  getOrCreateInstallationId,
  clearStoredExpoPushToken,
} from '@/storage/pushTokenStorage';
import {
  RUTAFY_INSTALLATION_ID_HEADER,
  buildOperatorTrackingRequestHeaders,
  shouldAttachInstallationId,
} from '@/utils/operatorInstallation';
import {
  decideCaptureResumeFollowUp,
  decideOperatorBatchCatchAction,
  isTrackingSessionNotActiveError,
  isWriterConflictError,
  isWriterUnclaimedError,
  mapResumeHttpErrorToHydrateOutcome,
} from '@/utils/trackingSessionErrors';
import { createStartSingleFlight } from '@/utils/mensajeroStartFlow';
import { decideMensajeroBootstrapApply } from '@/utils/mensajeroBootstrapPolicy';
import { parseOperationalBootstrapResponse } from '@/utils/operationalBootstrapParse';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function httpError(status: number, data: Record<string, unknown> = {}) {
  const err = new axios.AxiosError('request failed');
  err.response = {
    status,
    data,
    statusText: 'Error',
    headers: {},
    config: {} as never,
  };
  return err;
}

describe('A — installation id reusa rutafy_device_id', () => {
  beforeEach(async () => {
    (SecureStore as { __reset?: () => void }).__reset?.();
  });

  it('getOrCreateInstallationId es el mismo UUID persistido que device_id', async () => {
    const device = await getOrCreateDeviceId();
    const installation = await getOrCreateInstallationId();
    assert.equal(installation, device);
    assert.match(installation, UUID_RE);
    const stored = await SecureStore.getItemAsync('rutafy_device_id');
    assert.equal(stored, installation);
  });

  it('restart (nueva lectura) conserva el UUID', async () => {
    const first = await getOrCreateInstallationId();
    const second = await getOrCreateInstallationId();
    assert.equal(second, first);
  });

  it('logout no borra el installation id', async () => {
    const id = await getOrCreateInstallationId();
    await tokenStorage.setAccessToken('access-token');
    await tokenStorage.setRefreshToken('refresh-token');
    await tokenStorage.clearAll();
    await clearStoredExpoPushToken();
    const after = await getOrCreateInstallationId();
    assert.equal(after, id);
    assert.equal(await tokenStorage.getAccessToken(), null);
  });
});

describe('B/C/D — header X-Rutafy-Installation-Id', () => {
  it('start, resume y points/batch se marcan para el header', () => {
    assert.equal(shouldAttachInstallationId(TRACKING_SESSION_ENDPOINTS.start), true);
    assert.equal(shouldAttachInstallationId(TRACKING_SESSION_ENDPOINTS.resume('TS100')), true);
    assert.equal(
      shouldAttachInstallationId(TRACKING_SESSION_ENDPOINTS.pointsBatch('TS100')),
      true,
    );
  });

  it('login y heartbeat no reciben el header', () => {
    assert.equal(shouldAttachInstallationId('/v1/auth/login'), false);
    assert.equal(shouldAttachInstallationId('/v1/mensajero/heartbeat'), false);
    assert.equal(shouldAttachInstallationId('/v1/mensajero/operational-bootstrap'), false);
  });

  it('FG axios y BG expo/fetch construyen el mismo header con el mismo UUID', async () => {
    (SecureStore as { __reset?: () => void }).__reset?.();
    const id = await getOrCreateInstallationId();
    const bg = buildOperatorTrackingRequestHeaders({
      accessToken: 'jwt',
      installationId: id,
      traceId: 'operator-bg-batch',
    });
    assert.equal(bg[RUTAFY_INSTALLATION_ID_HEADER], id);
    assert.equal(bg.Authorization, 'Bearer jwt');
  });

  it('el interceptor axios adjunta el header en /start y points/batch', async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    const { apiClient } = await import('@/api/client');
    (SecureStore as { __reset?: () => void }).__reset?.();
    const id = await getOrCreateInstallationId();
    const captured: string[] = [];
    const previous = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      const headers = config.headers as { get?: (name: string) => string } | Record<string, string>;
      const value =
        typeof headers?.get === 'function'
          ? headers.get(RUTAFY_INSTALLATION_ID_HEADER)
          : (headers as Record<string, string>)[RUTAFY_INSTALLATION_ID_HEADER];
      captured.push(`${config.method ?? 'get'} ${config.url ?? ''} ${value ?? ''}`);
      return {
        data: {
          id: 'TS100',
          purpose: 'operacion_interna',
          vehicle_label: 'Unidad',
          status: 'active',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    try {
      await apiClient.post(TRACKING_SESSION_ENDPOINTS.start, {
        purpose: 'operacion_interna',
        vehicle_label: 'Unidad',
        consent_accepted: true,
      });
      await apiClient.post(TRACKING_SESSION_ENDPOINTS.pointsBatch('TS100'), { points: [] });
      await apiClient.post(TRACKING_SESSION_ENDPOINTS.resume('TS100'), {});
      assert.equal(captured.length, 3);
      for (const row of captured) {
        assert.equal(row.includes(id), true);
      }
    } finally {
      apiClient.defaults.adapter = previous;
    }
  });
});

function bootstrapDecision(raw: Record<string, unknown>) {
  const bootstrap = parseOperationalBootstrapResponse({
    operational_unit: {
      messenger_id: 'm-1',
      plate: 'ABC123',
      plate_normalized: 'ABC123',
      vehicle_type: 'camion',
    },
    capture_should_stop: false,
    capabilities: {
      can_start_capture: true,
      start_path: 'POST /v1/tracking-sessions/start',
    },
    ...raw,
  });
  return decideMensajeroBootstrapApply({
    fetchError: null,
    bootstrap,
    localSessionId: null,
    captureActive: false,
    consentAccepted: true,
    canStartOperatorGps: true,
    startBusy: false,
  });
}

describe('E/F — CAPTURE_ACTIVE resume vs CAPTURE_REQUIRED start', () => {
  it('resume OK habilita GPS; conflict no', () => {
    assert.equal(
      decideCaptureResumeFollowUp({ resumeOutcome: 'ok', hasMatchingLocalSession: false }),
      'enable_gps',
    );
    assert.equal(
      decideCaptureResumeFollowUp({
        resumeOutcome: 'writer_conflict',
        hasMatchingLocalSession: true,
      }),
      'cleanup',
    );
  });

  it('CAPTURE_REQUIRED decide start y no hydrate', () => {
    const decision = bootstrapDecision({
      action: 'CAPTURE_REQUIRED',
      reason: 'ACTIVE_JOURNEY_FOUND',
      journey: { journey_id: 'J-1', telemetry_mode: 'HYBRID' },
      tracking: { active: false, tracking_session_id: null },
    });
    assert.equal(decision.type, 'start');
  });

  it('CAPTURE_ACTIVE decide hydrate y no start', () => {
    const decision = bootstrapDecision({
      action: 'CAPTURE_ACTIVE',
      reason: 'CAPTURE_ALREADY_ACTIVE',
      journey: { journey_id: 'J-1', telemetry_mode: 'HYBRID' },
      tracking: { active: true, tracking_session_id: 'TS100' },
    });
    assert.equal(decision.type, 'hydrate');
    if (decision.type === 'hydrate') {
      assert.equal(decision.sessionId, 'TS100');
    }
  });

  it('teléfono nuevo sin sesión local no arranca GPS si resume es transitorio', () => {
    assert.equal(
      decideCaptureResumeFollowUp({
        resumeOutcome: 'transient',
        hasMatchingLocalSession: false,
      }),
      'abort',
    );
  });
});

describe('M1.1 — resume 409 session_not_active no arranca GPS', () => {
  const backendInactive = () =>
    httpError(409, { error: 'session_not_active', current_status: 'ended' });

  it('reconoce el JSON real del backend y no lo mezcla con writer_conflict', () => {
    const error = backendInactive();
    assert.equal(isTrackingSessionNotActiveError(error), true);
    assert.equal(isWriterConflictError(error), false);
    assert.equal(isWriterUnclaimedError(error), false);
    assert.equal(mapResumeHttpErrorToHydrateOutcome(error), 'inactive');
  });

  it('sesión local obsoleta: cleanup local, sin GPS y sin segundo resume', () => {
    const outcome = mapResumeHttpErrorToHydrateOutcome(backendInactive());
    assert.equal(outcome, 'inactive');
    const followUp = decideCaptureResumeFollowUp({
      resumeOutcome: outcome,
      hasMatchingLocalSession: true,
    });
    assert.equal(followUp, 'cleanup');
    assert.notEqual(followUp, 'enable_gps');
    assert.notEqual(followUp, 'preserve_offline');
  });

  it('sin sesión local: abort, sin start ni GPS', () => {
    const followUp = decideCaptureResumeFollowUp({
      resumeOutcome: 'inactive',
      hasMatchingLocalSession: false,
    });
    assert.equal(followUp, 'abort');
    assert.notEqual(followUp, 'enable_gps');
  });

  it('resume 200 sigue habilitando GPS solo tras éxito', () => {
    assert.equal(mapResumeHttpErrorToHydrateOutcome(backendInactive()), 'inactive');
    assert.equal(
      decideCaptureResumeFollowUp({ resumeOutcome: 'ok', hasMatchingLocalSession: true }),
      'enable_gps',
    );
  });

  it('writer_conflict y writer_unclaimed no cambian por este fix', () => {
    assert.equal(
      mapResumeHttpErrorToHydrateOutcome(httpError(409, { error: 'writer_conflict' })),
      'writer_conflict',
    );
    assert.equal(
      mapResumeHttpErrorToHydrateOutcome(httpError(409, { error: 'writer_unclaimed' })),
      null,
    );
    const unclaimed = decideOperatorBatchCatchAction(
      httpError(409, { error: 'writer_unclaimed' }),
    );
    assert.equal(unclaimed.type, 'resume_writer');
    assert.equal(unclaimed.requeue, false);
  });
});

describe('G/H/J — writer_conflict no reencola', () => {
  it('FG axios 409 writer_conflict es terminal y no retry', () => {
    const error = httpError(409, { error: 'writer_conflict' });
    assert.equal(isWriterConflictError(error), true);
    assert.equal(isTrackingSessionNotActiveError(error), false);
    const action = decideOperatorBatchCatchAction(error);
    assert.equal(action.type, 'cleanup');
    assert.equal(action.requeue, false);
    if (action.type === 'cleanup') {
      assert.equal(action.reason, 'writer_conflict');
    }
  });

  it('BG Error(writer_conflict) tampoco reencola', () => {
    const action = decideOperatorBatchCatchAction(new Error('writer_conflict'));
    assert.equal(action.requeue, false);
    assert.equal(action.type, 'cleanup');
  });

  it('session_not_active sigue siendo cleanup distinto', () => {
    const action = decideOperatorBatchCatchAction(
      httpError(409, { error: 'session_not_active' }),
    );
    assert.equal(action.type, 'cleanup');
    if (action.type === 'cleanup') {
      assert.equal(action.reason, 'session_not_active');
    }
  });

  it('errores de red siguen reencolando', () => {
    const action = decideOperatorBatchCatchAction(new Error('network timeout'));
    assert.equal(action.type, 'retry');
    assert.equal(action.requeue, true);
  });
});

describe('I — writer_unclaimed reconcilia sin retry ciego', () => {
  it('no reencola y pide resume', () => {
    const error = httpError(409, { code: 'writer_unclaimed' });
    assert.equal(isWriterUnclaimedError(error), true);
    const action = decideOperatorBatchCatchAction(error);
    assert.equal(action.type, 'resume_writer');
    assert.equal(action.requeue, false);
  });

  it('single-flight de resume evita tormentas concurrentes', async () => {
    const flight = createStartSingleFlight();
    let started = 0;
    let released!: () => void;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    const first = flight.run(async () => {
      started += 1;
      await gate;
      return 'ok';
    });
    const second = await flight.run(async () => {
      started += 1;
      return 'nope';
    });
    assert.equal(second.status, 'skipped');
    released();
    const firstResult = await first;
    assert.equal(firstResult.status, 'ran');
    assert.equal(started, 1);
  });
});
