/**
 * Network Resilience N1 — timeout + AbortController del POST background.
 *
 * Importa los módulos productivos reales. expo/fetch es el único stub de red.
 * El timeout de producción es 20s; aquí se acorta para no esperar wall-clock.
 *
 * Ejecutar: npm run test:operator-n1
 */

import './test-hooks/install-axios-test-adapter.mjs';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  fetch as expoFetch,
  __expoFetchHangUntilAbort,
  __expoFetchJson,
  __getExpoFetchCalls,
  __getExpoFetchInFlight,
  __resetExpoFetch,
  __setExpoFetchHandler,
} from 'expo/fetch';

import { tokenStorage } from '@/auth/tokenStorage';
import { getTrackingDiagnosticEvents } from '@/services/trackingDiagnostics';
import {
  OPERATOR_BATCH_HTTP_TIMEOUT_MS,
  OperatorBatchHttpTimeoutError,
  __resetOperatorBatchRuntimeForTests,
  __setOperatorBatchHttpTimeoutMsForTests,
  beginOperatorSessionFinalization,
  drainOperatorPendingForSessionEnd,
  enqueueAndFlushBackgroundPoints,
  endOperatorSessionFinalization,
  isOperatorBatchInFlight,
} from '@/services/operatorTrackingTask';
import { operatorTrackingPendingQueue } from '@/storage/operatorTrackingPendingQueue';
import { __resetOperatorPendingQueueMutationChainForTests } from '@/storage/operatorTrackingPendingQueue';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import { FINALIZATION_DRAIN_TIMEOUT_MS } from '@/utils/operatorTrackingFinalization';
import type { TrackingPointInput } from '@/types/tracking';

const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEST_HTTP_TIMEOUT_MS = 40;

function point(seq: number, at = `2026-09-20T12:00:${String(seq).padStart(2, '0')}.000Z`): TrackingPointInput {
  return {
    lat: 4.65 + seq * 0.0001,
    lng: -74.05 + seq * 0.0001,
    captured_at: at,
    app_state: 'background',
    metadata: { source: 'android_background' },
  };
}

async function seedAuth(): Promise<void> {
  await tokenStorage.setTokens({
    access_token: 'access-old',
    refresh_token: 'refresh-old',
    expires_in: 3600,
  });
}

async function seedSession(): Promise<void> {
  await trackingSessionStorage.setActive({
    sessionId: SESSION,
    ownerUserId: 'user-1',
    actorId: 'user-1',
    actorType: 'mensajero',
    purpose: 'operacion_interna',
    vehicleLabel: 'Unidad',
    startedAt: '2026-09-20T12:00:00.000Z',
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 200): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('waitFor timeout');
}

async function waitForEvents(type: string, min = 1, timeoutMs = 400): Promise<Awaited<ReturnType<typeof getTrackingDiagnosticEvents>>> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await getTrackingDiagnosticEvents(200);
    if (events.filter((event) => event.type === type).length >= min) {
      return events;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return getTrackingDiagnosticEvents(200);
}

describe('N1 timeout + abort de batch background', () => {
  beforeEach(async () => {
    (AsyncStorage as { __reset?: () => void }).__reset?.();
    (SecureStore as { __reset?: () => void }).__reset?.();
    __resetExpoFetch();
    __resetOperatorPendingQueueMutationChainForTests();
    __resetOperatorBatchRuntimeForTests();
    __setOperatorBatchHttpTimeoutMsForTests(TEST_HTTP_TIMEOUT_MS);
    await seedAuth();
    await seedSession();
  });

  afterEach(() => {
    __setOperatorBatchHttpTimeoutMsForTests(null);
    __resetOperatorBatchRuntimeForTests();
    endOperatorSessionFinalization();
  });

  it('constante de producción es 20s y distinta del drain', () => {
    assert.equal(OPERATOR_BATCH_HTTP_TIMEOUT_MS, 20_000);
    assert.notEqual(OPERATOR_BATCH_HTTP_TIMEOUT_MS, FINALIZATION_DRAIN_TIMEOUT_MS);
    assert.ok(OPERATOR_BATCH_HTTP_TIMEOUT_MS < FINALIZATION_DRAIN_TIMEOUT_MS);
  });

  it('1 hang: AbortController aborta, reencola y libera in-flight', async () => {
    __setExpoFetchHandler(__expoFetchHangUntilAbort);

    const flush = enqueueAndFlushBackgroundPoints(SESSION, [point(1), point(2)]);
    await waitFor(() => isOperatorBatchInFlight() && __getExpoFetchCalls().length === 1);

    const signal = __getExpoFetchCalls()[0]?.signal as AbortSignal | null;
    assert.ok(signal, 'el POST debe llevar AbortSignal');
    assert.equal(__getExpoFetchInFlight().maxInFlight, 1);

    const result = await flush;
    assert.equal(result.stoppedForError, true);
    assert.equal(result.sessionNotActive, false);
    assert.equal(isOperatorBatchInFlight(), false);
    assert.equal(signal.aborted, true);

    const pending = await operatorTrackingPendingQueue.get(SESSION);
    assert.deepEqual(
      pending.map((item) => item.captured_at),
      [point(1).captured_at, point(2).captured_at],
    );
    assert.equal(__getExpoFetchCalls().length, 1);
    assert.equal(__getExpoFetchInFlight().inFlight, 0);

    const events = await waitForEvents('batch-timeout');
    const timeoutEvent = events.find((event) => event.type === 'batch-timeout');
    assert.ok(timeoutEvent);
    assert.equal(timeoutEvent?.detail?.reason, 'http_timeout');
    assert.equal(timeoutEvent?.detail?.timeoutMs, TEST_HTTP_TIMEOUT_MS);
    assert.equal(typeof timeoutEvent?.detail?.apiLatencyMs, 'number');
    assert.ok(!JSON.stringify(timeoutEvent?.detail ?? {}).includes('Bearer'));
    assert.ok(!JSON.stringify(timeoutEvent?.detail ?? {}).includes('access-old'));
  });

  it('2 callback durante in-flight: encola sin segundo POST', async () => {
    __setExpoFetchHandler(__expoFetchHangUntilAbort);

    const first = enqueueAndFlushBackgroundPoints(SESSION, [point(1)]);
    await waitFor(() => isOperatorBatchInFlight());

    const second = await enqueueAndFlushBackgroundPoints(SESSION, [point(2)]);
    assert.equal(second.stoppedForError, false);
    assert.equal(isOperatorBatchInFlight(), true);
    assert.equal(__getExpoFetchCalls().length, 1);
    assert.equal(__getExpoFetchInFlight().maxInFlight, 1);

    await first;
    assert.equal(isOperatorBatchInFlight(), false);

    const pending = await operatorTrackingPendingQueue.get(SESSION);
    assert.deepEqual(
      pending.map((item) => item.captured_at),
      [point(1).captured_at, point(2).captured_at],
    );
  });

  it('3 recovery: timeout y el flush siguiente entrega 200 en orden', async () => {
    let batchPosts = 0;
    __setExpoFetchHandler((url, init) => {
      if (!String(url).includes('/points/batch')) {
        return __expoFetchJson({ ok: true }, 200)();
      }
      batchPosts += 1;
      if (batchPosts === 1) {
        return __expoFetchHangUntilAbort(url, init);
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { points?: TrackingPointInput[] };
      return __expoFetchJson({ accepted: body.points?.length ?? 0 }, 200)();
    });

    const first = await enqueueAndFlushBackgroundPoints(SESSION, [point(1), point(2)]);
    assert.equal(first.stoppedForError, true);
    assert.equal(await operatorTrackingPendingQueue.depth(SESSION), 2);

    const later = point(3);
    const second = await enqueueAndFlushBackgroundPoints(SESSION, [later]);
    assert.equal(second.stoppedForError, false);
    assert.equal(isOperatorBatchInFlight(), false);
    assert.equal(await operatorTrackingPendingQueue.depth(SESSION), 0);

    const bodies = __getExpoFetchCalls()
      .filter((call) => String(call.url).includes('/points/batch'))
      .map((call) => JSON.parse(String(call.body ?? '{}')) as { points: TrackingPointInput[] });
    assert.equal(bodies.length, 2);
    assert.deepEqual(
      bodies[0]?.points.map((item) => item.captured_at),
      [point(1).captured_at, point(2).captured_at],
    );
    assert.deepEqual(
      bodies[1]?.points.map((item) => item.captured_at),
      [point(1).captured_at, point(2).captured_at, later.captured_at],
    );
  });

  it('4 finalization: HTTP timeout no descarta pending ni cierra sesión', async () => {
    __setExpoFetchHandler(__expoFetchHangUntilAbort);

    const flush = enqueueAndFlushBackgroundPoints(SESSION, [point(1)]);
    await waitFor(() => isOperatorBatchInFlight());
    beginOperatorSessionFinalization();

    const drain = await drainOperatorPendingForSessionEnd(SESSION, 120);
    await flush;

    assert.ok(drain.status === 'network_error' || drain.status === 'timeout');
    assert.ok(drain.pendingRemaining >= 1);
    assert.equal(await operatorTrackingPendingQueue.depth(SESSION), 1);
    assert.equal(isOperatorBatchInFlight(), false);

    const stored = await trackingSessionStorage.getActive();
    assert.equal(stored?.sessionId, SESSION);

    const events = await waitForEvents('batch-timeout');
    assert.ok(events.some((event) => event.type === 'batch-timeout'));
    assert.equal(events.some((event) => event.type === 'tracking-storage-cleared'), false);
  });

  it('5 HTTP 401: refresh + retry, cada request con signal acotado', async () => {
    let batchPosts = 0;
    __setExpoFetchHandler((url, init) => {
      if (!String(url).includes('/points/batch')) {
        return __expoFetchJson({ ok: true }, 200)();
      }
      batchPosts += 1;
      if (batchPosts === 1) {
        assert.ok(init?.signal instanceof AbortSignal);
        assert.equal(init.signal.aborted, false);
        return __expoFetchJson({ error: 'unauthorized' }, 401)();
      }
      const auth = String(init?.headers?.Authorization ?? '');
      assert.equal(auth, 'Bearer refreshed-access-token');
      assert.ok(init?.signal instanceof AbortSignal);
      return __expoFetchJson({ accepted: 1 }, 200)();
    });

    const result = await enqueueAndFlushBackgroundPoints(SESSION, [point(1)]);
    assert.equal(result.stoppedForError, false);
    assert.equal(await operatorTrackingPendingQueue.depth(SESSION), 0);
    assert.equal(isOperatorBatchInFlight(), false);
    assert.equal(batchPosts, 2);

    const events = await waitForEvents('batch-401');
    assert.ok(events.some((event) => event.type === 'batch-401'));
    assert.ok(events.some((event) => event.type === 'batch-success'));
  });

  it('6 network error inmediato: requeue y libera in-flight', async () => {
    __setExpoFetchHandler(async () => {
      throw new TypeError('Network request failed: UnknownHostException');
    });

    const result = await enqueueAndFlushBackgroundPoints(SESSION, [point(1)]);
    assert.equal(result.stoppedForError, true);
    assert.equal(isOperatorBatchInFlight(), false);
    assert.equal(await operatorTrackingPendingQueue.depth(SESSION), 1);
    assert.equal(__getExpoFetchCalls().length, 1);

    const events = await waitForEvents('batch-error');
    assert.ok(events.some((event) => event.type === 'batch-error'));
    assert.equal(events.some((event) => event.type === 'batch-timeout'), false);
  });

  it('7 HTTP 200: no requeue, timer limpiado, flujo normal', async () => {
    __setExpoFetchHandler(__expoFetchJson({ accepted: 1 }, 200));

    const result = await enqueueAndFlushBackgroundPoints(SESSION, [point(1)]);
    assert.equal(result.stoppedForError, false);
    assert.equal(isOperatorBatchInFlight(), false);
    assert.equal(await operatorTrackingPendingQueue.depth(SESSION), 0);

    const signal = __getExpoFetchCalls()[0]?.signal as AbortSignal | null;
    assert.ok(signal);
    await new Promise((resolve) => setTimeout(resolve, TEST_HTTP_TIMEOUT_MS + 30));
    assert.equal(signal.aborted, false);
    assert.equal(__getExpoFetchCalls().length, 1);

    const events = await waitForEvents('batch-success');
    assert.ok(events.some((event) => event.type === 'batch-success'));
    assert.equal(events.some((event) => event.type === 'batch-timeout'), false);
  });

  it('OperatorBatchHttpTimeoutError se clasifica como timeout recuperable', () => {
    const error = new OperatorBatchHttpTimeoutError(OPERATOR_BATCH_HTTP_TIMEOUT_MS);
    assert.equal(error.reason, 'http_timeout');
    assert.match(error.message, /timeout/);
    assert.ok(typeof expoFetch === 'function');
  });
});
