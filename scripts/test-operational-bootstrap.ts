import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import axios from 'axios';

import { parseOperationalBootstrapResponse } from '../src/utils/operationalBootstrapParse.ts';
import {
  buildTrackingStartParams,
  createStartSingleFlight,
  mergeJourneyIdIntoStartMetadata,
} from '../src/utils/mensajeroStartFlow.ts';
import {
  decideMensajeroStopFlow,
  resolveStopExecutionResult,
} from '../src/utils/mensajeroStopFlow.ts';
import {
  BOOTSTRAP_CAPTURE_PENDING_NOTICE,
  BOOTSTRAP_CONFLICT_NOTICE,
  BOOTSTRAP_CONSENT_REQUIRED_NOTICE,
  BOOTSTRAP_PENDING_ASSIGNMENT_NOTICE,
  bootstrapNoticeForDecision,
  classifyBootstrapFetchError,
  decideMensajeroBootstrapApply,
  nextBootstrapSnapshot,
} from '../src/utils/mensajeroBootstrapPolicy.ts';
import {
  createBootstrapSingleFlight,
  runOperationalBootstrapCycle,
  type BootstrapCycleDeps,
} from '../src/utils/mensajeroBootstrapCoordinator.ts';
import {
  isActiveSessionExistsError,
  getExistingSessionIdFromStartConflict,
} from '../src/utils/trackingSessionErrors.ts';
import { deriveMensajeroOperationalUiState } from '../src/utils/mensajeroOperationalState.ts';
import {
  isConsentAcceptedFor,
  normalizeStoredBootstrap,
  serializeStoredBootstrap,
} from '../src/utils/mensajeroBootstrapOwnership.ts';
import { isStoredTrackingSessionOwnedByUser } from '../src/utils/trackingSessionIdentity.ts';

function httpError(status: number, data: Record<string, unknown> = {}, code?: string) {
  const err = new axios.AxiosError('request failed', code);
  err.response = {
    status,
    data,
    statusText: 'Error',
    headers: {},
    config: {} as never,
  };
  return err;
}

function sampleBootstrap(overrides: Record<string, unknown> = {}) {
  return {
    action: 'NONE',
    reason: 'NO_ACTIVE_JOURNEY',
    operational_unit: {
      messenger_id: 'm-1',
      plate: 'ABC123',
      plate_normalized: 'ABC123',
      vehicle_type: 'camion',
    },
    journey: null,
    tracking: { active: false, tracking_session_id: null },
    capture_should_stop: false,
    capabilities: {
      can_start_capture: false,
      start_path: 'POST /v1/tracking-sessions/start',
    },
    ...overrides,
  };
}

function captureRequired() {
  return sampleBootstrap({
    action: 'CAPTURE_REQUIRED',
    reason: 'ACTIVE_JOURNEY_FOUND',
    journey: {
      journey_id: 'J-1',
      container_id: 'C-1',
      corridor_code: 'CARIBE',
      current_state: 'IN_TRANSIT',
      current_leg: 1,
      telemetry_mode: 'EMAIL_ONLY',
    },
    capabilities: {
      can_start_capture: true,
      start_path: 'POST /v1/tracking-sessions/start',
    },
  });
}

function makeDeps(overrides: Partial<BootstrapCycleDeps> = {}): BootstrapCycleDeps & {
  calls: {
    start: number;
    hydrate: string[];
    stop: Array<string | null>;
    persist: number;
    fetch: number;
  };
} {
  const calls = {
    start: 0,
    hydrate: [] as string[],
    stop: [] as Array<string | null>,
    persist: 0,
    fetch: 0,
  };
  const persisted = {
    current: {
      journeyId: null as string | null,
      trackingSessionId: null as string | null,
      lastBootstrapAction: null as null,
      lastBootstrapAt: null as string | null,
    },
  };

  const deps: BootstrapCycleDeps & { calls: typeof calls } = {
    calls,
    fetchBootstrap: async () => {
      calls.fetch += 1;
      return sampleBootstrap();
    },
    getLocalSessionId: async () => null,
    isCaptureActive: async () => false,
    hasConsent: async () => true,
    canStartOperatorGps: async () => true,
    isStartBusy: () => false,
    getPersisted: async () => persisted.current,
    persist: async (snapshot) => {
      calls.persist += 1;
      persisted.current = snapshot as typeof persisted.current;
    },
    startWithJourney: async ({ journeyId }) => {
      calls.start += 1;
      return { status: 'started', sessionId: `sess-from-${journeyId}` };
    },
    hydrateSession: async (sessionId) => {
      calls.hydrate.push(sessionId);
    },
    stopCapture: async (sessionId) => {
      calls.stop.push(sessionId);
      return sessionId ? 'stopped' : 'already_stopped';
    },
    nowIso: () => '2026-09-11T14:00:00.000Z',
    ...overrides,
  };
  return deps;
}

describe('A — parse bootstrap response', () => {
  it('parsea el contrato 3C.3 incluyendo journey y tracking', () => {
    const parsed = parseOperationalBootstrapResponse({
      trace_id: 't-1',
      ...captureRequired(),
    });
    assert.equal(parsed?.action, 'CAPTURE_REQUIRED');
    assert.equal(parsed?.reason, 'ACTIVE_JOURNEY_FOUND');
    assert.equal(parsed?.journey?.journey_id, 'J-1');
    assert.equal(parsed?.journey?.telemetry_mode, 'EMAIL_ONLY');
    assert.equal(parsed?.tracking.active, false);
    assert.equal(parsed?.capabilities.start_path, 'POST /v1/tracking-sessions/start');
    assert.equal(parsed?.capture_should_stop, false);
  });

  it('rechaza action/reason desconocidos', () => {
    assert.equal(parseOperationalBootstrapResponse({ action: 'FOO', reason: 'NO_PLATE' }), null);
    assert.equal(parseOperationalBootstrapResponse(null), null);
  });
});

describe('B — NONE', () => {
  it('no inicia tracking ni borra recovery', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => {
        deps.calls.fetch += 1;
        return sampleBootstrap();
      },
      getPersisted: async () => ({
        journeyId: 'old-j',
        trackingSessionId: 'old-s',
        lastBootstrapAction: 'CAPTURE_ACTIVE',
        lastBootstrapAt: '2026-09-11T08:00:00.000Z',
      }),
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'noop');
    assert.equal(deps.calls.start, 0);
    assert.equal(deps.calls.stop.length, 0);
    assert.equal(result.snapshot.journeyId, 'old-j');
    assert.equal(result.snapshot.trackingSessionId, 'old-s');
    assert.equal(result.snapshot.lastBootstrapAction, 'NONE');
  });
});

describe('C — CAPTURE_REQUIRED', () => {
  it('inicia captura con journey_id cuando hay consentimiento', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => captureRequired(),
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'start');
    if (result.decision.type === 'start') {
      assert.equal(result.decision.journeyId, 'J-1');
    }
    assert.equal(deps.calls.start, 1);
    assert.equal(result.snapshot.journeyId, 'J-1');
    assert.equal(result.snapshot.trackingSessionId, 'sess-from-J-1');
  });
});

describe('D — CAPTURE_ACTIVE', () => {
  it('hidrata la sesión existente y no crea otra', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () =>
        sampleBootstrap({
          action: 'CAPTURE_ACTIVE',
          reason: 'CAPTURE_ALREADY_ACTIVE',
          journey: { journey_id: 'J-1', telemetry_mode: 'HYBRID' },
          tracking: { active: true, tracking_session_id: 'sess-9' },
        }),
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'hydrate');
    assert.deepEqual(deps.calls.hydrate, ['sess-9']);
    assert.equal(deps.calls.start, 0);
  });
});

describe('E — CONFLICT', () => {
  it('no inicia tracking y expone aviso seguro', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () =>
        sampleBootstrap({
          action: 'CONFLICT',
          reason: 'MULTIPLE_ACTIVE_JOURNEYS',
          conflict_journey_ids: ['J-a', 'J-b'],
        }),
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'conflict');
    assert.equal(result.notice, BOOTSTRAP_CONFLICT_NOTICE);
    assert.equal(result.notice?.includes('J-a'), false);
    assert.equal(deps.calls.start, 0);
  });
});

describe('F — PENDING_ASSIGNMENT', () => {
  it('no es fatal y no inicia tracking', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () =>
        sampleBootstrap({
          action: 'PENDING_ASSIGNMENT',
          reason: 'NO_PLATE',
          operational_unit: { messenger_id: 'm-1', plate: null },
        }),
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'pending_assignment');
    assert.equal(result.notice, BOOTSTRAP_PENDING_ASSIGNMENT_NOTICE);
    assert.equal(deps.calls.start, 0);
  });
});

describe('G — JOURNEYS_UNAVAILABLE', () => {
  it('degrada sin start ni stop', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () =>
        sampleBootstrap({
          action: 'NONE',
          reason: 'JOURNEYS_UNAVAILABLE',
        }),
      isCaptureActive: async () => true,
      getLocalSessionId: async () => 'sess-live',
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'degrade');
    assert.equal(deps.calls.start, 0);
    assert.equal(deps.calls.stop.length, 0);
  });
});

describe('H — journey_id en start metadata', () => {
  it('incluye journey_id en metadata del POST start', () => {
    const params = buildTrackingStartParams({
      vehicleLabel: 'ABC123',
      consentAccepted: true,
      existingMetadata: { source: 'android_mvp' },
      journeyId: 'J-1',
    });
    assert.equal('error' in params, false);
    if (!('error' in params)) {
      assert.equal(params.consent_accepted, true);
      assert.equal(params.metadata?.journey_id, 'J-1');
      assert.equal(params.metadata?.source, 'android_mvp');
    }
  });
});

describe('I — metadata previa preservada', () => {
  it('fusiona journey_id sin borrar keys 3B', () => {
    const merged = mergeJourneyIdIntoStartMetadata(
      { source: 'android_mvp', lane: 'terminal', notes_flag: true },
      'J-99',
    );
    assert.equal(merged.source, 'android_mvp');
    assert.equal(merged.lane, 'terminal');
    assert.equal(merged.notes_flag, true);
    assert.equal(merged.journey_id, 'J-99');
  });
});

describe('J — consentimiento requerido', () => {
  it('CAPTURE_REQUIRED sin consentimiento no crea sesión', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => captureRequired(),
      hasConsent: async () => false,
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'consent_required');
    assert.equal(result.notice, BOOTSTRAP_CONSENT_REQUIRED_NOTICE);
    assert.equal(deps.calls.start, 0);
    const gated = buildTrackingStartParams({
      vehicleLabel: 'ABC123',
      consentAccepted: false,
      journeyId: 'J-1',
    });
    assert.deepEqual(gated, { error: 'consent_required' });
  });
});

describe('K — bootstrap repetido no duplica start', () => {
  it('single-flight de start ignora el segundo intento', async () => {
    const lock = createStartSingleFlight();
    let starts = 0;
    const first = lock.run(async () => {
      starts += 1;
      return 'one';
    });
    const second = await lock.run(async () => {
      starts += 1;
      return 'two';
    });
    await first;
    assert.equal(second.status, 'skipped');
    assert.equal(starts, 1);
  });

  it('si el start ya está busy, el ciclo no dispara otro start', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => captureRequired(),
      isStartBusy: () => true,
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'noop');
    assert.equal(deps.calls.start, 0);
  });
});

describe('L — 409 active_session_exists recovery', () => {
  it('no es fatal: hidrata sesión existente y pide rebootstrap', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => captureRequired(),
      startWithJourney: async () => {
        deps.calls.start += 1;
        return { status: 'recovered_existing', sessionId: 'sess-existing' };
      },
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(deps.calls.start, 1);
    assert.deepEqual(deps.calls.hydrate, ['sess-existing']);
    assert.equal(result.shouldRebootstrap, true);
    const err = httpError(409, {
      error: 'active_session_exists',
      existing_session_id: 'sess-existing',
    });
    assert.equal(isActiveSessionExistsError(err), true);
    assert.equal(getExistingSessionIdFromStartConflict(err), 'sess-existing');
  });
});

describe('M — completed → stopFlow', () => {
  it('JOURNEY_COMPLETED dispara stop con el session id', async () => {
    const payload = sampleBootstrap({
      action: 'NONE',
      reason: 'JOURNEY_COMPLETED',
      capture_should_stop: true,
      tracking: { active: true, tracking_session_id: 'sess-done' },
    });
    const stop = decideMensajeroStopFlow({
      bootstrap: parseOperationalBootstrapResponse(payload)!,
      localSessionId: 'sess-done',
    });
    assert.equal(stop.type, 'stop');
    const deps = makeDeps({
      fetchBootstrap: async () => payload,
      getLocalSessionId: async () => 'sess-done',
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'stop');
    assert.deepEqual(deps.calls.stop, ['sess-done']);
    assert.equal(result.stopResult, 'stopped');
  });
});

describe('N — completed stop idempotente', () => {
  it('si ya estaba detenido no es error', async () => {
    const payload = sampleBootstrap({
      action: 'NONE',
      reason: 'JOURNEY_COMPLETED',
      capture_should_stop: true,
      tracking: { active: false, tracking_session_id: null },
    });
    const deps = makeDeps({
      fetchBootstrap: async () => payload,
      getLocalSessionId: async () => null,
      stopCapture: async (sessionId) => {
        deps.calls.stop.push(sessionId);
        return 'already_stopped';
      },
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.stopResult, 'already_stopped');
    assert.equal(resolveStopExecutionResult({
      sessionId: null,
      remoteEnded: false,
      networkFailed: false,
      alreadyInactive: false,
    }), 'already_stopped');
  });
});

describe('O — offline no detiene captura', () => {
  it('fallo de red no asume NONE ni llama stop', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => {
        throw new axios.AxiosError('Network Error', 'ERR_NETWORK');
      },
      isCaptureActive: async () => true,
      getLocalSessionId: async () => 'sess-live',
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'preserve_offline');
    assert.equal(result.needsRetryOnReconnect, true);
    assert.equal(deps.calls.stop.length, 0);
    assert.equal(deps.calls.start, 0);
  });
});

describe('P — reconnect vuelve a bootstrap', () => {
  it('tras offline, un ciclo force vuelve a consultar', async () => {
    const flight = createBootstrapSingleFlight(2_500);
    const deps = makeDeps({
      fetchBootstrap: async () => {
        deps.calls.fetch += 1;
        if (deps.calls.fetch === 1) {
          throw new axios.AxiosError('Network Error', 'ERR_NETWORK');
        }
        return captureRequired();
      },
    });
    const first = await flight.run({ now: 1_000 }, () => runOperationalBootstrapCycle(deps));
    assert.equal(first.needsRetryOnReconnect, true);
    const second = await flight.run({ force: true, now: 1_200 }, () =>
      runOperationalBootstrapCycle(deps),
    );
    assert.equal(deps.calls.fetch, 2);
    assert.equal(second.decision.type, 'start');
  });
});

describe('Q — foreground vuelve a bootstrap', () => {
  it('debounce reutiliza el ciclo; after debounce consulta de nuevo', async () => {
    const flight = createBootstrapSingleFlight(2_500);
    const deps = makeDeps();
    await flight.run({ now: 10_000 }, () => runOperationalBootstrapCycle(deps));
    await flight.run({ now: 11_000 }, () => runOperationalBootstrapCycle(deps));
    assert.equal(deps.calls.fetch, 1);
    await flight.run({ now: 13_000 }, () => runOperationalBootstrapCycle(deps));
    assert.equal(deps.calls.fetch, 2);
  });

  it('focus y AppState simultáneos comparten un solo fetch', async () => {
    const flight = createBootstrapSingleFlight(2_500);
    const deps = makeDeps({
      fetchBootstrap: async () => {
        deps.calls.fetch += 1;
        await new Promise((r) => setTimeout(r, 20));
        return sampleBootstrap();
      },
    });
    const a = flight.run({ now: 20_000 }, () => runOperationalBootstrapCycle(deps));
    const b = flight.run({ now: 20_000 }, () => runOperationalBootstrapCycle(deps));
    await Promise.all([a, b]);
    assert.equal(deps.calls.fetch, 1);
  });
});

describe('R — dispatch aparece después del login', () => {
  it('NONE al login y CAPTURE_REQUIRED después sin relogin', async () => {
    let n = 0;
    const deps = makeDeps({
      fetchBootstrap: async () => {
        n += 1;
        return n === 1 ? sampleBootstrap() : captureRequired();
      },
    });
    const login = await runOperationalBootstrapCycle(deps);
    assert.equal(login.decision.type, 'noop');
    assert.equal(deps.calls.start, 0);
    const later = await runOperationalBootstrapCycle(deps);
    assert.equal(later.decision.type, 'start');
    assert.equal(deps.calls.start, 1);
  });
});

describe('S — app restart + CAPTURE_ACTIVE', () => {
  it('hidrata la misma sesión y no crea una segunda', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () =>
        sampleBootstrap({
          action: 'CAPTURE_ACTIVE',
          reason: 'CAPTURE_ALREADY_ACTIVE',
          journey: { journey_id: 'J-1' },
          tracking: { active: true, tracking_session_id: 'sess-same' },
        }),
      getLocalSessionId: async () => null,
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'hydrate');
    assert.deepEqual(deps.calls.hydrate, ['sess-same']);
    assert.equal(deps.calls.start, 0);
  });
});

describe('T — auth error', () => {
  it('401/403 no destruyen captura activa', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => {
        throw httpError(401, { error: 'unauthorized' });
      },
      isCaptureActive: async () => true,
      getLocalSessionId: async () => 'sess-live',
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'auth_error');
    assert.equal(classifyBootstrapFetchError(httpError(403)), 'auth');
    assert.equal(deps.calls.stop.length, 0);
  });
});

describe('U — timeout/5xx no destruye sesión', () => {
  it('timeout y 503 preservan tracking activo', async () => {
    const timeoutDeps = makeDeps({
      fetchBootstrap: async () => {
        throw new axios.AxiosError('timeout', 'ECONNABORTED');
      },
      isCaptureActive: async () => true,
      getLocalSessionId: async () => 'sess-live',
    });
    const timeoutResult = await runOperationalBootstrapCycle(timeoutDeps);
    assert.equal(timeoutResult.decision.type, 'preserve_offline');
    assert.equal(timeoutDeps.calls.stop.length, 0);

    const serverDeps = makeDeps({
      fetchBootstrap: async () => {
        throw httpError(503, { error: 'bootstrap_failed' });
      },
      isCaptureActive: async () => true,
      getLocalSessionId: async () => 'sess-live',
    });
    const serverResult = await runOperationalBootstrapCycle(serverDeps);
    assert.equal(serverResult.decision.type, 'preserve_offline');
    assert.equal(serverDeps.calls.stop.length, 0);
    assert.equal(classifyBootstrapFetchError(httpError(404)), 'not_found');
  });
});

describe('V — regresión 3B operational UI', () => {
  it('bootstrap no cambia ASSIGNED/IN_SERVICE derivados del servicio', () => {
    assert.equal(
      deriveMensajeroOperationalUiState({
        activeServiceStatus: 'CLAIMED',
        isOnline: false,
        hasFirstOffer: false,
      }),
      'ASSIGNED',
    );
    assert.equal(
      deriveMensajeroOperationalUiState({
        activeServiceStatus: 'STARTED',
        isOnline: false,
        hasFirstOffer: false,
      }),
      'IN_SERVICE',
    );
    assert.equal(
      deriveMensajeroOperationalUiState({
        activeServiceStatus: null,
        isOnline: true,
        hasFirstOffer: false,
      }),
      'AVAILABLE',
    );
    const conflictNotice = bootstrapNoticeForDecision({ type: 'conflict' });
    assert.equal(conflictNotice, BOOTSTRAP_CONFLICT_NOTICE);
  });
});

describe('N — 404 degradación de rollout', () => {
  it('endpoint ausente degrada sin start ni stop y no pisa el snapshot', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => {
        throw httpError(404, { error: 'not_found' });
      },
      isCaptureActive: async () => true,
      getLocalSessionId: async () => 'sess-live',
      getPersisted: async () => ({
        journeyId: 'J-keep',
        trackingSessionId: 'sess-live',
        lastBootstrapAction: 'CAPTURE_ACTIVE',
        lastBootstrapAt: '2026-09-11T08:00:00.000Z',
      }),
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'degrade');
    if (result.decision.type === 'degrade') {
      assert.equal(result.decision.reason, 'endpoint_missing');
    }
    assert.equal(deps.calls.stop.length, 0);
    assert.equal(deps.calls.start, 0);
    assert.equal(result.snapshot.journeyId, 'J-keep');
    assert.equal(result.snapshot.trackingSessionId, 'sess-live');
  });

  it('respuesta malformada no provoca auto-start', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => ({ action: 'CAPTURE_REQUIRED' }),
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'degrade');
    assert.equal(deps.calls.start, 0);
    assert.equal(deps.calls.stop.length, 0);
  });

  it('campos desconocidos no rompen el parse', () => {
    const parsed = parseOperationalBootstrapResponse({
      ...captureRequired(),
      future_field: { nested: true },
      conflict_journey_ids: ['J-x'],
    });
    assert.equal(parsed?.action, 'CAPTURE_REQUIRED');
    assert.equal(parsed?.journey?.journey_id, 'J-1');
  });
});

describe('O/P — 401 y 403 van al auth lifecycle', () => {
  it('401 y 403 clasifican como auth y no tocan la captura', async () => {
    for (const status of [401, 403]) {
      const deps = makeDeps({
        fetchBootstrap: async () => {
          throw httpError(status, { error: 'unauthorized' });
        },
        isCaptureActive: async () => true,
        getLocalSessionId: async () => 'sess-live',
      });
      const result = await runOperationalBootstrapCycle(deps);
      assert.equal(result.decision.type, 'auth_error');
      assert.equal(result.needsRetryOnReconnect, false);
      assert.equal(deps.calls.stop.length, 0);
      assert.equal(deps.calls.start, 0);
    }
  });
});

describe('W — ASSIGNED + CAPTURE_REQUIRED', () => {
  it('con heartbeat GPS dueño del task nativo no crea sesión: capture_pending', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => captureRequired(),
      // ASSIGNED ⇒ bg heartbeat activo ⇒ guard 3B niega el task de captura.
      canStartOperatorGps: async () => false,
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'capture_pending');
    assert.equal(deps.calls.start, 0);
    assert.equal(deps.calls.stop.length, 0);
    // El journey_id sí se retiene para arrancar cuando el conflicto se libere.
    assert.equal(result.snapshot.journeyId, 'J-1');
    assert.equal(result.notice, BOOTSTRAP_CAPTURE_PENDING_NOTICE);
    assert.equal(result.notice?.includes('J-1'), false);
  });

  it('ASSIGNED se deriva del servicio, no del bootstrap', () => {
    assert.equal(
      deriveMensajeroOperationalUiState({
        activeServiceStatus: 'CLAIMED',
        isOnline: false,
        hasFirstOffer: false,
      }),
      'ASSIGNED',
    );
  });
});

describe('X — IN_SERVICE + CAPTURE_REQUIRED', () => {
  it('mismo comportamiento seguro que ASSIGNED', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () => captureRequired(),
      canStartOperatorGps: async () => false,
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'capture_pending');
    assert.equal(deps.calls.start, 0);
    assert.equal(
      deriveMensajeroOperationalUiState({
        activeServiceStatus: 'STARTED',
        isOnline: false,
        hasFirstOffer: false,
      }),
      'IN_SERVICE',
    );
  });

  it('al liberarse el task (servicio cerrado) el siguiente ciclo sí arranca', async () => {
    let gpsFree = false;
    const deps = makeDeps({
      fetchBootstrap: async () => captureRequired(),
      canStartOperatorGps: async () => gpsFree,
    });
    const blocked = await runOperationalBootstrapCycle(deps);
    assert.equal(blocked.decision.type, 'capture_pending');
    assert.equal(deps.calls.start, 0);

    gpsFree = true;
    const freed = await runOperationalBootstrapCycle(deps);
    assert.equal(freed.decision.type, 'start');
    assert.equal(deps.calls.start, 1);
    assert.equal(freed.snapshot.journeyId, 'J-1');
  });
});

describe('Y — conflicto de task nativo', () => {
  it('CAPTURE_ACTIVE hidrata incluso si el GPS de servicio está ocupado', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () =>
        sampleBootstrap({
          action: 'CAPTURE_ACTIVE',
          reason: 'CAPTURE_ALREADY_ACTIVE',
          journey: { journey_id: 'J-1' },
          tracking: { active: true, tracking_session_id: 'sess-live' },
        }),
      canStartOperatorGps: async () => false,
      getLocalSessionId: async () => 'sess-live',
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'hydrate');
    assert.deepEqual(deps.calls.hydrate, ['sess-live']);
    assert.equal(deps.calls.start, 0);
  });

  it('JOURNEY_COMPLETED detiene la captura aunque el GPS de servicio esté ocupado', async () => {
    const deps = makeDeps({
      fetchBootstrap: async () =>
        sampleBootstrap({
          action: 'NONE',
          reason: 'JOURNEY_COMPLETED',
          capture_should_stop: true,
          tracking: { active: true, tracking_session_id: 'sess-done' },
        }),
      canStartOperatorGps: async () => false,
      getLocalSessionId: async () => 'sess-done',
    });
    const result = await runOperationalBootstrapCycle(deps);
    assert.equal(result.decision.type, 'stop');
    assert.deepEqual(deps.calls.stop, ['sess-done']);
  });
});

describe('Z — user switch / aislamiento de consentimiento', () => {
  it('el consentimiento de un mensajero no lo hereda otro', () => {
    const raw = { userId: 'user-A', acceptedAt: '2026-09-11T08:00:00.000Z' };
    assert.equal(isConsentAcceptedFor(raw, 'user-A'), true);
    assert.equal(isConsentAcceptedFor(raw, 'user-B'), false);
    assert.equal(isConsentAcceptedFor(raw, null), false);
    assert.equal(isConsentAcceptedFor(raw, '  '), false);
  });

  it('storage corrupto o incompleto es fail-safe', () => {
    assert.equal(isConsentAcceptedFor(null, 'user-A'), false);
    assert.equal(isConsentAcceptedFor('garbage', 'user-A'), false);
    assert.equal(isConsentAcceptedFor([], 'user-A'), false);
    assert.equal(isConsentAcceptedFor({ userId: 'user-A' }, 'user-A'), false);
    assert.equal(isConsentAcceptedFor({ userId: 'user-A', acceptedAt: '' }, 'user-A'), false);
  });

  it('el snapshot de bootstrap tampoco cruza usuarios', () => {
    const stored = serializeStoredBootstrap('user-A', {
      journeyId: 'J-A',
      trackingSessionId: 'sess-A',
      lastBootstrapAction: 'CAPTURE_ACTIVE',
      lastBootstrapAt: '2026-09-11T08:00:00.000Z',
    });
    assert.equal(normalizeStoredBootstrap(stored, 'user-A')?.journeyId, 'J-A');
    assert.equal(normalizeStoredBootstrap(stored, 'user-B'), null);
    assert.equal(normalizeStoredBootstrap(stored, null), null);
    // Snapshot legacy sin dueño no se hidrata.
    assert.equal(normalizeStoredBootstrap({ journeyId: 'J-A' }, 'user-A'), null);
    assert.equal(normalizeStoredBootstrap('garbage', 'user-A'), null);
  });

  it('un journey ajeno nunca llega al metadata del start', () => {
    const foreign = normalizeStoredBootstrap(
      serializeStoredBootstrap('user-A', {
        journeyId: 'J-A',
        trackingSessionId: null,
        lastBootstrapAction: 'CAPTURE_REQUIRED',
        lastBootstrapAt: null,
      }),
      'user-B',
    );
    const params = buildTrackingStartParams({
      vehicleLabel: 'XYZ789',
      consentAccepted: true,
      journeyId: foreign?.journeyId ?? null,
    });
    assert.equal('error' in params, false);
    if (!('error' in params)) {
      assert.equal(params.metadata?.journey_id, undefined);
      assert.equal(params.metadata?.source, 'android_mvp');
    }
  });
});

describe('V — ownership de tracking session', () => {
  const userA = {
    user_id: 'user-A',
    actor_id: 'actor-A',
    actor_type: 'messenger',
  } as never;
  const userB = {
    user_id: 'user-B',
    actor_id: 'actor-B',
    actor_type: 'messenger',
  } as never;
  const sessionOfA = {
    sessionId: 'sess-A',
    ownerUserId: 'user-A',
    actorId: 'actor-A',
    actorType: 'messenger',
    purpose: 'operacion_interna',
    vehicleLabel: 'ABC123',
    startedAt: '2026-09-11T08:00:00.000Z',
  } as never;

  it('la sesión de A no se hidrata como B', () => {
    assert.equal(isStoredTrackingSessionOwnedByUser(sessionOfA, userA), true);
    assert.equal(isStoredTrackingSessionOwnedByUser(sessionOfA, userB), false);
    assert.equal(isStoredTrackingSessionOwnedByUser(sessionOfA, null), false);
  });

  it('sesión legacy sin ownership no se reclama', () => {
    const legacy = { ...(sessionOfA as object), ownerUserId: '', actorId: '' } as never;
    assert.equal(isStoredTrackingSessionOwnedByUser(legacy, userA), false);
  });
});

describe('snapshot persistido', () => {
  it('guarda solo referencias de recovery', () => {
    const snapshot = nextBootstrapSnapshot(
      null,
      parseOperationalBootstrapResponse(captureRequired()),
      '2026-09-11T14:00:00.000Z',
      { type: 'start', journeyId: 'J-1', vehicleLabel: 'ABC123' },
    );
    assert.deepEqual(Object.keys(snapshot).sort(), [
      'journeyId',
      'lastBootstrapAction',
      'lastBootstrapAt',
      'trackingSessionId',
    ]);
    assert.equal(snapshot.journeyId, 'J-1');
    assert.equal(JSON.stringify(snapshot).includes('@'), false);
  });
});
