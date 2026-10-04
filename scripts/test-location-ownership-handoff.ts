/**
 * Handoff Messenger BG → Operator BG.
 *
 * Importa módulos productivos reales. Stubs nativos: scripts/test-hooks.
 * Ejecutar: npm run test:location-handoff
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { apiClient } from '@/api/client';
import {
  resetBackgroundTrackingSyncForTests,
  startBackgroundLocationForActiveService,
  syncBackgroundTracking,
} from '@/services/backgroundLocationService';
import {
  ensureOperatorBackgroundTracking,
  handoffMessengerBgToOperatorTracking,
  isOperatorTrackingStartedAsync,
  resetOperatorTrackingStartForTests,
  startOperatorTrackingAsync,
  stopOperatorTrackingAsync,
} from '@/services/operatorTrackingService';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import {
  resetLocationOwnershipHandoffForTests,
  releaseJourneyLocationAndRestoreMessenger,
} from '@/utils/locationOwnershipHandoff';
import {
  getJourneyCaptureOwnsLocation,
  resetLocationOwnershipStateForTests,
} from '@/utils/locationOwnershipState';
import { runMensajeroStopCapture } from '@/utils/mensajeroCaptureLifecycle';
import { resetOperatorBackgroundOwnership } from '@/utils/operatorIngestionOwnership';
import { cleanupLocalTrackingSession } from '@/utils/trackingSessionOwnership';

const MESSENGER_TASK = 'rutafy-background-location';
const OPERATOR_TASK = 'rutafy-operator-tracking';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const HOOK_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/hooks/useOperatorTrackingSession.ts', import.meta.url)),
  'utf8',
);

const locationStub = Location as typeof Location & {
  __setTaskStarted(taskName: string, started: boolean): void;
  __failNextStart(): void;
  __getStartCount(taskName: string): number;
  __reset(): void;
};

async function seedActiveSession(): Promise<void> {
  await trackingSessionStorage.setActive({
    sessionId: SESSION_ID,
    ownerUserId: 'user-1',
    actorId: 'actor-1',
    actorType: 'messenger',
    purpose: 'operacion_interna',
    vehicleLabel: 'ABC123',
    startedAt: '2026-10-01T12:00:00.000Z',
  });
}

function defineTasks(): void {
  if (!TaskManager.isTaskDefined(MESSENGER_TASK)) {
    TaskManager.defineTask(MESSENGER_TASK, async () => undefined);
  }
  if (!TaskManager.isTaskDefined(OPERATOR_TASK)) {
    TaskManager.defineTask(OPERATOR_TASK, async () => undefined);
  }
}

async function resetAll(): Promise<void> {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  (SecureStore as { __reset?: () => void }).__reset?.();
  locationStub.__reset();
  resetLocationOwnershipStateForTests();
  resetLocationOwnershipHandoffForTests();
  resetBackgroundTrackingSyncForTests();
  resetOperatorTrackingStartForTests();
  resetOperatorBackgroundOwnership();
  defineTasks();
  await trackingSessionStorage.clearActive();
}

describe('location ownership handoff', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('CASE A: Messenger inactivo + CAPTURE_REQUIRED → Operator BG arranca', async () => {
    await seedActiveSession();
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);

    const started = await startOperatorTrackingAsync();

    assert.equal(started, true);
    assert.equal(await isOperatorTrackingStartedAsync(), true);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(getJourneyCaptureOwnsLocation(), true);
  });

  it('CASE B: Messenger activo + CAPTURE_REQUIRED → Messenger para y Operator arranca', async () => {
    await seedActiveSession();
    const messengerStarted = await startBackgroundLocationForActiveService();
    assert.equal(messengerStarted, true);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), true);

    const started = await handoffMessengerBgToOperatorTracking();

    assert.equal(started, true);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(await isOperatorTrackingStartedAsync(), true);
    assert.equal(getJourneyCaptureOwnsLocation(), true);
  });

  it('CASE C: Operator start falla → no se fabrica captura background', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);
    locationStub.__failNextStart();

    const started = await startOperatorTrackingAsync();

    assert.equal(started, false);
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(getJourneyCaptureOwnsLocation(), true);

    await syncBackgroundTracking(true);
    assert.equal(
      await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK),
      false,
      'Messenger no debe volver si el handoff falló',
    );
  });

  it('CASE D: Operator posee Location → efecto Messenger no reinicia su BG', async () => {
    await seedActiveSession();
    assert.equal(await startOperatorTrackingAsync(), true);
    const operatorStarts = locationStub.__getStartCount(OPERATOR_TASK);

    await syncBackgroundTracking(true);
    await syncBackgroundTracking(true);

    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(await isOperatorTrackingStartedAsync(), true);
    assert.equal(locationStub.__getStartCount(MESSENGER_TASK), 0);
    assert.equal(locationStub.__getStartCount(OPERATOR_TASK), operatorStarts);
  });

  it('CASE E: Journey termina y Messenger sigue operacional → se restaura Messenger BG', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);
    await syncBackgroundTracking(true);
    assert.equal(await startOperatorTrackingAsync(), true);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);

    await stopOperatorTrackingAsync();
    const restored = await releaseJourneyLocationAndRestoreMessenger();

    assert.equal(restored, true);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), true);
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
  });

  it('CASE F: llamadas repetidas no duplican start ni crean loop start-stop', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);

    const first = await ensureOperatorBackgroundTracking();
    const second = await ensureOperatorBackgroundTracking();
    const third = await startOperatorTrackingAsync();
    await syncBackgroundTracking(true);
    await syncBackgroundTracking(true);

    assert.equal(first, true);
    assert.equal(second, true);
    assert.equal(third, true);
    assert.equal(locationStub.__getStartCount(OPERATOR_TASK), 1);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(await isOperatorTrackingStartedAsync(), true);
  });

  it('CASE G: transición foreground/background conserva ownership', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);
    assert.equal(await startOperatorTrackingAsync(), true);

    await syncBackgroundTracking(true);
    await ensureOperatorBackgroundTracking();
    await syncBackgroundTracking(true);

    assert.equal(await isOperatorTrackingStartedAsync(), true);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(getJourneyCaptureOwnsLocation(), true);
  });

  /**
   * Misma secuencia que finalizeCaptureLocally tras un cierre exitoso:
   * Operator detenido, sesión local limpiada, luego el coordinador.
   */
  async function closeSuccessfulUiCapture(): Promise<boolean> {
    await stopOperatorTrackingAsync();
    await cleanupLocalTrackingSession('capture_closed');
    return releaseJourneyLocationAndRestoreMessenger();
  }

  function ownershipEventsDuring<T>(run: () => Promise<T>): Promise<{ result: T; events: Array<Record<string, unknown>> }> {
    const events: Array<Record<string, unknown>> = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      if (args[0] === '[location-ownership]' && args[1] && typeof args[1] === 'object') {
        events.push(args[1] as Record<string, unknown>);
      }
      original(...args);
    };
    return run()
      .then((result) => ({ result, events }))
      .finally(() => {
        console.log = original;
      });
  }

  it('CASE UI-A: finalizar en AVAILABLE suelta ownership y no arranca Messenger BG', async () => {
    await syncBackgroundTracking(false);
    await seedActiveSession();
    assert.equal(await startOperatorTrackingAsync(), true);
    const messengerStarts = locationStub.__getStartCount(MESSENGER_TASK);

    const restored = await closeSuccessfulUiCapture();

    assert.equal(restored, false);
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(locationStub.__getStartCount(MESSENGER_TASK), messengerStarts);
  });

  it('CASE UI-B: finalizar en ASSIGNED restaura Messenger BG si ya estaba pedido', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);
    await syncBackgroundTracking(true);
    assert.equal(await startOperatorTrackingAsync(), true);

    const { result: restored, events } = await ownershipEventsDuring(() => closeSuccessfulUiCapture());

    assert.equal(restored, true);
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), true);
    assert.equal(
      events.some((event) => event.event === 'LOCATION_OWNER' && event.owner === 'messenger' && event.restored === true),
      true,
    );
  });

  it('CASE UI-C: finalizar en IN_SERVICE restaura Messenger BG igual que ASSIGNED', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);
    await syncBackgroundTracking(true);
    assert.equal(await startOperatorTrackingAsync(), true);

    const restored = await closeSuccessfulUiCapture();

    assert.equal(restored, true);
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), true);
  });

  it('CASE UI-D: drain fallido que reanuda Operator no suelta ownership ni arranca Messenger', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);
    await syncBackgroundTracking(true);
    assert.equal(await startOperatorTrackingAsync(), true);
    await stopOperatorTrackingAsync();

    const restarted = await startOperatorTrackingAsync();
    await syncBackgroundTracking(true);

    assert.equal(restarted, true);
    assert.equal(await isOperatorTrackingStartedAsync(), true);
    assert.equal(getJourneyCaptureOwnsLocation(), true);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
  });

  it('CASE UI-E: syncBackgroundTracking(true) posterior no queda bloqueado por ownership viejo', async () => {
    await syncBackgroundTracking(false);
    await seedActiveSession();
    assert.equal(await startOperatorTrackingAsync(), true);
    assert.equal(await closeSuccessfulUiCapture(), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);

    await syncBackgroundTracking(true);

    assert.equal(getJourneyCaptureOwnsLocation(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), true);
  });

  it('CASE UI-F: runMensajeroStopCapture libera una vez y un segundo release no restaura de nuevo', async () => {
    await seedActiveSession();
    assert.equal(await startBackgroundLocationForActiveService(), true);
    await syncBackgroundTracking(true);
    assert.equal(await startOperatorTrackingAsync(), true);
    const messengerStartsAfterHandoff = locationStub.__getStartCount(MESSENGER_TASK);

    const previousAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = (async (config: unknown) => ({
      data: { ok: true, session: { session_id: SESSION_ID, status: 'ended' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })) as typeof apiClient.defaults.adapter;

    try {
      const { result, events } = await ownershipEventsDuring(() => runMensajeroStopCapture(SESSION_ID));
      assert.equal(result, 'stopped');
      assert.equal(events.filter((event) => event.event === 'LOCATION_RELEASE').length, 1);
      assert.equal(
        events.filter((event) => event.event === 'LOCATION_OWNER' && event.owner === 'messenger' && event.restored === true).length,
        1,
      );
      assert.equal(locationStub.__getStartCount(MESSENGER_TASK), messengerStartsAfterHandoff + 1);
      assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), true);

      const second = await ownershipEventsDuring(() => runMensajeroStopCapture(SESSION_ID));
      assert.equal(second.events.filter((event) => event.event === 'LOCATION_RELEASE').length, 0);
      assert.equal(second.result === 'stopped' || second.result === 'already_stopped', true);
      assert.equal(locationStub.__getStartCount(MESSENGER_TASK), messengerStartsAfterHandoff + 1);
    } finally {
      apiClient.defaults.adapter = previousAdapter;
    }
  });

  it('el cierre de UI llama al coordinador solo después del cleanup, no en el fallo que reanuda Operator', () => {
    const finalizeStart = HOOK_SOURCE.indexOf('const finalizeCaptureLocally');
    const endStart = HOOK_SOURCE.indexOf('const endCapture');
    const cancelStart = HOOK_SOURCE.indexOf('const cancelCapture');
    const finalize = HOOK_SOURCE.slice(finalizeStart, endStart);
    const cleanupAt = finalize.lastIndexOf('cleanupLocalTrackingSession');
    const releaseAt = finalize.indexOf('releaseJourneyLocationAndRestoreMessenger');
    assert.ok(cleanupAt >= 0);
    assert.ok(releaseAt > cleanupAt);

    const endFn = HOOK_SOURCE.slice(endStart, cancelStart);
    const preserve = endFn.slice(
      endFn.indexOf('if (shouldPreservePendingOnEndFailure'),
      endFn.indexOf('// 4) Solo entonces cerrar en backend.'),
    );
    assert.equal(preserve.includes('releaseJourneyLocationAndRestoreMessenger'), false);
    assert.equal(preserve.includes('finalizeCaptureLocally'), false);

    const endCatch = endFn.slice(endFn.indexOf('} catch (e)'), endFn.indexOf('} finally'));
    assert.equal(endCatch.includes('releaseJourneyLocationAndRestoreMessenger'), false);
    assert.equal(endCatch.includes('finalizeCaptureLocally'), false);

    const cancelFn = HOOK_SOURCE.slice(cancelStart, HOOK_SOURCE.indexOf('return {', cancelStart));
    const cancelCatch = cancelFn.slice(cancelFn.indexOf('} catch (e)'), cancelFn.indexOf('} finally'));
    assert.equal(cancelCatch.includes('releaseJourneyLocationAndRestoreMessenger'), false);
    assert.equal(cancelCatch.includes('finalizeCaptureLocally'), false);
  });
});
