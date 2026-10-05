/**
 * Parada de captura cuando la auth confirmada desaparece.
 *
 * Ejecutar: npm run test:auth-loss
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { __getExpoFetchCalls, __resetExpoFetch } from 'expo/fetch';

import { setAuthenticatedIdentity } from '@/auth/authenticatedIdentity';
import {
  getLastRequestedBackgroundTrackingEnabled,
  resetBackgroundTrackingSyncForTests,
  syncBackgroundTracking,
} from '@/services/backgroundLocationService';
import { enqueueAndFlushBackgroundPoints } from '@/services/operatorTrackingTask';
import {
  isOperatorTrackingStartedAsync,
  resetOperatorTrackingStartForTests,
  startOperatorTrackingAsync,
} from '@/services/operatorTrackingService';
import { operatorTrackingPendingQueue } from '@/storage/operatorTrackingPendingQueue';
import { __resetOperatorPendingQueueMutationChainForTests } from '@/storage/operatorTrackingPendingQueue';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import type { AuthUser } from '@/types/auth';
import type { TrackingPointInput } from '@/types/tracking';
import {
  allowNewOperatorObservationsAfterAuthorizedStart,
  currentIdentityMayUploadOperatorSession,
  refreshStatusRequiresLocationShutdown,
  registerForegroundCaptureStopper,
  resetAuthLossCaptureGateForTests,
} from '@/utils/authLossCaptureGate';
import {
  resetAuthLossLocationShutdownForTests,
  stopLocationCaptureForAuthLoss,
} from '@/utils/authLossLocationShutdown';
import {
  releaseJourneyLocationAndRestoreMessenger,
  resetLocationOwnershipHandoffForTests,
} from '@/utils/locationOwnershipHandoff';
import {
  getJourneyCaptureOwnsLocation,
  resetLocationOwnershipStateForTests,
} from '@/utils/locationOwnershipState';
import { preserveForeignTrackingSession } from '@/utils/trackingSessionOwnership';

const MESSENGER_TASK = 'rutafy-background-location';
const OPERATOR_TASK = 'rutafy-operator-tracking';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const FIX_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CAPTURED_AT = '2026-10-02T19:37:21.297Z';

const locationStub = Location as typeof Location & {
  __setTaskStarted(taskName: string, started: boolean): void;
  __getStartCount(taskName: string): number;
  __reset(): void;
};

function user(userId: string, actorId: string): AuthUser {
  return {
    id: userId,
    user_id: userId,
    name: null,
    email: null,
    phone: null,
    role: 'MENSAJERO',
    appRole: 'MENSAJERO',
    actor_id: actorId,
    actor_type: 'messenger',
  };
}

const userA = user('user-a', 'actor-a');
const userB = user('user-b', 'actor-b');

function pendingPoint(capturedAt = CAPTURED_AT, fixId = FIX_ID): TrackingPointInput {
  return {
    lat: 4.65,
    lng: -74.08,
    captured_at: capturedAt,
    accuracy_m: 6.1,
    speed_mps: 2.4,
    app_state: 'background',
    fix_id: fixId,
  };
}

function defineTasks(): void {
  if (!TaskManager.isTaskDefined(MESSENGER_TASK)) {
    TaskManager.defineTask(MESSENGER_TASK, async () => undefined);
  }
  if (!TaskManager.isTaskDefined(OPERATOR_TASK)) {
    TaskManager.defineTask(OPERATOR_TASK, async () => undefined);
  }
}

async function seedSession(): Promise<void> {
  await trackingSessionStorage.setActive({
    sessionId: SESSION_ID,
    ownerUserId: userA.user_id,
    actorId: 'actor-a',
    actorType: 'messenger',
    purpose: 'operacion_interna',
    vehicleLabel: 'ABC123',
    startedAt: '2026-10-02T19:00:00.000Z',
  });
}

async function resetAll(): Promise<void> {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  (SecureStore as { __reset?: () => void }).__reset?.();
  (AsyncStorage as { __reset?: () => void }).__reset?.();
  locationStub.__reset();
  __resetExpoFetch();
  __resetOperatorPendingQueueMutationChainForTests();
  resetLocationOwnershipStateForTests();
  resetLocationOwnershipHandoffForTests();
  resetBackgroundTrackingSyncForTests();
  resetOperatorTrackingStartForTests();
  resetAuthLossCaptureGateForTests();
  resetAuthLossLocationShutdownForTests();
  setAuthenticatedIdentity(userA);
  defineTasks();
  await trackingSessionStorage.clearActive();
}

async function captureActiveWithQueue(): Promise<TrackingPointInput[]> {
  await seedSession();
  await syncBackgroundTracking(true);
  assert.equal(await startOperatorTrackingAsync(), true);
  assert.equal(getJourneyCaptureOwnsLocation(), true);
  await operatorTrackingPendingQueue.enqueue(SESSION_ID, [pendingPoint()]);
  return operatorTrackingPendingQueue.get(SESSION_ID);
}

describe('auth-loss location shutdown', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('A. logout con Operator activo detiene captura y no restaura Messenger', async () => {
    const queued = await captureActiveWithQueue();
    let foregroundStopped = 0;
    registerForegroundCaptureStopper(() => {
      foregroundStopped += 1;
    });

    await stopLocationCaptureForAuthLoss();

    assert.equal(foregroundStopped, 1);
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
    assert.equal(getLastRequestedBackgroundTrackingEnabled(), false);
    assert.equal(await releaseJourneyLocationAndRestoreMessenger(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.deepEqual(await operatorTrackingPendingQueue.get(SESSION_ID), queued);
    const stored = await trackingSessionStorage.getActive();
    assert.equal(stored?.sessionId, SESSION_ID);
    assert.equal(stored?.ownerUserId, userA.user_id);
  });

  it('B. la cola pendiente conserva fix_id y captured_at', async () => {
    const queued = await captureActiveWithQueue();
    await stopLocationCaptureForAuthLoss();
    const after = await operatorTrackingPendingQueue.get(SESSION_ID);
    assert.equal(after.length, 1);
    assert.equal(after[0]?.fix_id, FIX_ID);
    assert.equal(after[0]?.captured_at, CAPTURED_AT);
    assert.deepEqual(after, queued);
  });

  it('C. el mismo usuario puede reanudar sin duplicar la tarea ni borrar la cola', async () => {
    const queued = await captureActiveWithQueue();
    await stopLocationCaptureForAuthLoss();
    setAuthenticatedIdentity(userA);

    const startsBefore = locationStub.__getStartCount(OPERATOR_TASK);
    assert.equal(await startOperatorTrackingAsync(), true);
    assert.equal(locationStub.__getStartCount(OPERATOR_TASK), startsBefore + 1);
    assert.equal(await startOperatorTrackingAsync(), true);
    assert.equal(locationStub.__getStartCount(OPERATOR_TASK), startsBefore + 1);
    assert.equal(await isOperatorTrackingStartedAsync(), true);
    assert.deepEqual(await operatorTrackingPendingQueue.get(SESSION_ID), queued);
    assert.equal((await trackingSessionStorage.getActive())?.ownerUserId, userA.user_id);
  });

  it('D. otro usuario no adopta, no sube y no borra la cola', async () => {
    const queued = await captureActiveWithQueue();
    await stopLocationCaptureForAuthLoss();
    setAuthenticatedIdentity(userB);
    __resetExpoFetch();

    assert.equal(await startOperatorTrackingAsync(), false);
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
    await preserveForeignTrackingSession();

    assert.deepEqual(await operatorTrackingPendingQueue.get(SESSION_ID), queued);
    assert.equal((await trackingSessionStorage.getActive())?.ownerUserId, userA.user_id);
    assert.equal(await currentIdentityMayUploadOperatorSession(SESSION_ID), false);

    allowNewOperatorObservationsAfterAuthorizedStart();
    assert.equal(await currentIdentityMayUploadOperatorSession(SESSION_ID), false);
    await enqueueAndFlushBackgroundPoints(SESSION_ID, [
      pendingPoint('2026-10-02T19:40:00.000Z', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ]);
    assert.equal(__getExpoFetchCalls().length, 0);
    assert.deepEqual(await operatorTrackingPendingQueue.get(SESSION_ID), queued);
    assert.equal((await trackingSessionStorage.getActive())?.sessionId, SESSION_ID);
  });

  it('E/F. refresh válido o transitorio no es shutdown; auth inválida sí', () => {
    assert.equal(refreshStatusRequiresLocationShutdown('success'), false);
    assert.equal(refreshStatusRequiresLocationShutdown('network_error'), false);
    assert.equal(refreshStatusRequiresLocationShutdown('auth_invalid'), true);

    const refreshSource = readFileSync(
      fileURLToPath(new URL('../src/auth/accessTokenManager.ts', import.meta.url)),
      'utf8',
    );
    assert.equal(refreshSource.includes('stopLocationCaptureForAuthLoss'), false);

    const client = readFileSync(
      fileURLToPath(new URL('../src/api/client.ts', import.meta.url)),
      'utf8',
    );
    const networkBranch = client.slice(
      client.indexOf("refreshOutcome.status === 'network_error'"),
      client.indexOf("refreshOutcome.status === 'auth_invalid'"),
    );
    assert.equal(networkBranch.includes('stopLocationCaptureForAuthLoss'), false);
    assert.equal(networkBranch.includes('clearAuthAndNotify'), false);
  });

  it('G. auth inválida confirmada usa la misma parada que el logout manual', async () => {
    const auth = readFileSync(
      fileURLToPath(new URL('../src/auth/AuthProvider.tsx', import.meta.url)),
      'utf8',
    );
    const logoutFn = auth.slice(auth.indexOf('const logout = useCallback'));
    const stopAt = logoutFn.indexOf('await stopLocationCaptureForAuthLoss()');
    const clearAt = logoutFn.indexOf('await authService.logout()');
    assert.ok(stopAt >= 0 && clearAt > stopAt);

    const clearLocal = auth.slice(
      auth.indexOf('const clearLocalSession = useCallback'),
      auth.indexOf('const refreshSession = useCallback'),
    );
    assert.ok(
      clearLocal.indexOf('await stopLocationCaptureForAuthLoss()') <
        clearLocal.indexOf('await tokenStorage.clearAll()'),
    );

    const task = readFileSync(
      fileURLToPath(new URL('../src/services/operatorTrackingTask.ts', import.meta.url)),
      'utf8',
    );
    assert.ok(task.includes('refreshStatusRequiresLocationShutdown(refreshOutcome.status)'));
    assert.ok(task.includes('await stopLocationCaptureForAuthLoss()'));

    await captureActiveWithQueue();
    await stopLocationCaptureForAuthLoss();
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal((await operatorTrackingPendingQueue.get(SESSION_ID)).length, 1);
    assert.equal((await trackingSessionStorage.getActive())?.sessionId, SESSION_ID);
  });

  it('H. un segundo shutdown no restaura Messenger ni borra la cola', async () => {
    const queued = await captureActiveWithQueue();
    await stopLocationCaptureForAuthLoss();
    await stopLocationCaptureForAuthLoss();
    assert.equal(await Location.hasStartedLocationUpdatesAsync(MESSENGER_TASK), false);
    assert.equal(getJourneyCaptureOwnsLocation(), false);
    assert.deepEqual(await operatorTrackingPendingQueue.get(SESSION_ID), queued);
    assert.equal((await trackingSessionStorage.getActive())?.sessionId, SESSION_ID);
  });

  it('I. sin auth la tarea no queda autorizada a capturar puntos nuevos', async () => {
    const queued = await captureActiveWithQueue();
    await stopLocationCaptureForAuthLoss();
    locationStub.__setTaskStarted(OPERATOR_TASK, true);
    __resetExpoFetch();

    await enqueueAndFlushBackgroundPoints(SESSION_ID, [
      pendingPoint('2026-10-02T19:41:00.000Z', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ]);
    assert.equal(__getExpoFetchCalls().length, 0);
    assert.deepEqual(await operatorTrackingPendingQueue.get(SESSION_ID), queued);

    await stopLocationCaptureForAuthLoss();
    assert.equal(await isOperatorTrackingStartedAsync(), false);
    assert.deepEqual(await operatorTrackingPendingQueue.get(SESSION_ID), queued);
  });

  it('el hook no borra la cola en owner_mismatch', () => {
    const hook = readFileSync(
      fileURLToPath(new URL('../src/hooks/useOperatorTrackingSession.ts', import.meta.url)),
      'utf8',
    );
    assert.equal(hook.includes("clearActiveTrackingSession('owner_mismatch')"), false);
    assert.ok(hook.includes('preserveForeignTrackingSession()'));
  });
});
