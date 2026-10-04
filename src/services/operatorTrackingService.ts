import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';

import { OPERATOR_TRACKING_TASK_NAME } from '@/services/operatorTrackingTask';
import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';
import { getAuthenticatedIdentity } from '@/auth/authenticatedIdentity';
import {
  allowNewOperatorObservationsAfterAuthorizedStart,
  isNewOperatorObservationBlocked,
} from '@/utils/authLossCaptureGate';
import { handoffMessengerBackgroundIfNeeded } from '@/utils/locationOwnershipHandoff';
import { logLocationOwnership } from '@/utils/locationOwnershipState';
import { isStoredTrackingSessionOwnedByUser } from '@/utils/trackingSessionIdentity';
import {
  setOperatorBackgroundOwnership,
  ensureOperatorBackgroundOwnership,
} from '@/utils/operatorIngestionOwnership';
import { notePipelineTaskEvent } from '@/utils/trackingPipelineObserver';

let startInFlight: Promise<boolean> | null = null;

const TIME_INTERVAL_MS = 20000;
const DISTANCE_INTERVAL_M = 10;

/** Opciones de la tarea background. La instrumentación no las altera. */
export const OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS = {
  accuracy: Location.Accuracy.High,
  timeInterval: TIME_INTERVAL_MS,
  distanceInterval: DISTANCE_INTERVAL_M,
  deferredUpdatesInterval: TIME_INTERVAL_MS,
  deferredUpdatesDistance: DISTANCE_INTERVAL_M,
  pausesUpdatesAutomatically: false,
} as const;

function isTaskNotFoundError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? '');
  return (
    message.includes('TaskNotFound') ||
    message.includes('not found for app ID') ||
    message.includes('not found')
  );
}

async function showOperatorBackgroundRationaleAlert(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Ubicación en segundo plano',
      'Rutafy registrará tu ruta operativa mientras la captura logística esté activa, incluso con la pantalla apagada.',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function requestOperatorBackgroundLocationPermission(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      const fgReq = await Location.requestForegroundPermissionsAsync();
      if (fgReq.status !== 'granted') return false;
    }

    if (Platform.OS !== 'android') return true;

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') return true;

    const accepted = await showOperatorBackgroundRationaleAlert();
    if (!accepted) return false;

    const bgReq = await Location.requestBackgroundPermissionsAsync();
    return bgReq.status === 'granted';
  } catch (error) {
    if (__DEV__) {
      console.warn('[operator-bg-start]', { permissionError: error });
    }
    return false;
  }
}

export async function inspectOperatorTrackingForegroundService(): Promise<boolean> {
  return isOperatorTrackingStartedAsync();
}

export async function isOperatorTrackingStartedAsync(): Promise<boolean> {
  if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
    return false;
  }
  try {
    return await Location.hasStartedLocationUpdatesAsync(OPERATOR_TRACKING_TASK_NAME);
  } catch {
    return false;
  }
}

export async function startOperatorTrackingAsync(): Promise<boolean> {
  if (startInFlight) return startInFlight;
  const run = startOperatorTrackingOnce();
  startInFlight = run;
  try {
    return await run;
  } finally {
    if (startInFlight === run) {
      startInFlight = null;
    }
  }
}

/**
 * Handoff explícito: detiene Messenger BG, hidrata/arranca Operator BG y
 * solo entonces considera la captura background establecida.
 */
export async function handoffMessengerBgToOperatorTracking(): Promise<boolean> {
  return startOperatorTrackingAsync();
}

async function startOperatorTrackingOnce(): Promise<boolean> {
  const stored = await trackingSessionStorage.getActive();
  if (!stored?.sessionId?.trim()) {
    if (__DEV__) {
      console.log('[operator-bg-start]', { skipped: true, reason: 'no_active_session' });
    }
    setOperatorBackgroundOwnership(false);
    return false;
  }

  if (isNewOperatorObservationBlocked()) {
    const identity = getAuthenticatedIdentity();
    if (!identity || !isStoredTrackingSessionOwnedByUser(stored, identity)) {
      if (__DEV__) {
        console.log('[operator-bg-start]', { skipped: true, reason: 'auth_loss_owner' });
      }
      setOperatorBackgroundOwnership(false);
      return false;
    }
  }

  const handedOff = await handoffMessengerBackgroundIfNeeded();
  if (!handedOff) {
    setOperatorBackgroundOwnership(false);
    return false;
  }

  if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
    console.warn('[operator-bg-start]', { skipped: true, reason: 'task_not_defined' });
    logLocationOwnership('LOCATION_HANDOFF', {
      phase: 'operator_start_failed',
      reason: 'task_not_defined',
    });
    setOperatorBackgroundOwnership(false);
    return false;
  }

  const hasPermission = await requestOperatorBackgroundLocationPermission();
  if (!hasPermission) {
    if (__DEV__) {
      console.warn('[operator-bg-start]', { skipped: true, reason: 'permission_denied' });
    }
    logLocationOwnership('LOCATION_HANDOFF', {
      phase: 'operator_start_failed',
      reason: 'permission_denied',
    });
    setOperatorBackgroundOwnership(false);
    return false;
  }

  try {
    const storedAfterHandoff = await trackingSessionStorage.getActive();
    if (storedAfterHandoff?.sessionId) {
      recordTrackingDiagnostic(
        'tracking-task-start-requested',
        { task: OPERATOR_TRACKING_TASK_NAME },
        storedAfterHandoff.sessionId,
      );
    }

    const alreadyStarted = await isOperatorTrackingStartedAsync();
    if (alreadyStarted) {
      if (__DEV__) {
        console.log('[operator-bg-start]', { started: true, alreadyStarted: true });
      }
      setOperatorBackgroundOwnership(true);
      allowNewOperatorObservationsAfterAuthorizedStart();
      logLocationOwnership('LOCATION_OWNER', { owner: 'operator' });
      return true;
    }

    await Location.startLocationUpdatesAsync(OPERATOR_TRACKING_TASK_NAME, {
      ...OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS,
      foregroundService: {
        notificationTitle: 'Captura logística activa',
        notificationBody: 'Rutafy está registrando ubicación operativa.',
      },
    });

    const registered = await isOperatorTrackingStartedAsync();
    if (__DEV__) {
      console.log('[operator-bg-start]', {
        started: registered,
        task: OPERATOR_TRACKING_TASK_NAME,
      });
    }
    if (!registered) {
      logLocationOwnership('LOCATION_HANDOFF', {
        phase: 'operator_start_failed',
        reason: 'not_registered',
      });
      setOperatorBackgroundOwnership(false);
      return false;
    }

    setOperatorBackgroundOwnership(true);
    allowNewOperatorObservationsAfterAuthorizedStart();
    notePipelineTaskEvent('bg-task-start');
    recordTrackingDiagnostic(
      'bg-task-start',
      {
        fgServiceStarted: true,
        taskManagerStarted: true,
        task: OPERATOR_TRACKING_TASK_NAME,
      },
      storedAfterHandoff?.sessionId,
    );
    logLocationOwnership('LOCATION_OWNER', { owner: 'operator' });
    return true;
  } catch (error) {
    const storedOnError = await trackingSessionStorage.getActive();
    recordTrackingDiagnostic(
      'bg-task-error',
      { error: String(error), task: OPERATOR_TRACKING_TASK_NAME },
      storedOnError?.sessionId,
    );
    console.warn('[operator-bg-start]', { error });
    logLocationOwnership('LOCATION_HANDOFF', {
      phase: 'operator_start_failed',
      reason: 'start_threw',
    });
    setOperatorBackgroundOwnership(false);
    return false;
  }
}

export async function stopOperatorTrackingAsync(): Promise<void> {
  if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
    if (__DEV__) {
      console.log('[operator-bg-stop]', { skipped: true, reason: 'task_not_defined' });
    }
    setOperatorBackgroundOwnership(false);
    return;
  }

  let started = false;
  try {
    started = await Location.hasStartedLocationUpdatesAsync(OPERATOR_TRACKING_TASK_NAME);
  } catch (error) {
    if (__DEV__) {
      console.warn('[operator-bg-stop]', { skipped: true, checkError: error });
    }
    return;
  }

  if (!started) {
    if (__DEV__) {
      console.log('[operator-bg-stop]', { skipped: true, reason: 'not_started' });
    }
    setOperatorBackgroundOwnership(false);
    return;
  }

  try {
    await Location.stopLocationUpdatesAsync(OPERATOR_TRACKING_TASK_NAME);
    setOperatorBackgroundOwnership(false);
    const stored = await trackingSessionStorage.getActive();
    if (stored?.sessionId) {
      recordTrackingDiagnostic(
        'tracking-task-stop-requested',
        { task: OPERATOR_TRACKING_TASK_NAME },
        stored.sessionId,
      );
    }
    recordTrackingDiagnostic(
      'bg-task-stop',
      { fgServiceStarted: false, taskManagerStarted: false },
      stored?.sessionId,
    );
    notePipelineTaskEvent('bg-task-stop');
    if (__DEV__) {
      console.log('[operator-bg-stop]', { stopped: true });
    }
  } catch (error) {
    if (isTaskNotFoundError(error)) {
      if (__DEV__) {
        console.warn('[operator-bg-stop]', { skipped: true, reason: 'task_not_found' });
      }
      setOperatorBackgroundOwnership(false);
      return;
    }
    console.warn('[operator-bg-stop]', { error });
  }
}

export async function ensureOperatorBackgroundTracking(): Promise<boolean> {
  const stored = await trackingSessionStorage.getActive();
  if (!stored?.sessionId?.trim()) {
    setOperatorBackgroundOwnership(false);
    return false;
  }
  const handedOff = await handoffMessengerBackgroundIfNeeded();
  if (!handedOff) {
    setOperatorBackgroundOwnership(false);
    return false;
  }
  if (await ensureOperatorBackgroundOwnership(true, OPERATOR_TRACKING_TASK_NAME)) {
    logLocationOwnership('LOCATION_OWNER', { owner: 'operator' });
    return true;
  }
  const restored = await startOperatorTrackingAsync();
  if (restored) {
    notePipelineTaskEvent('bg-task-restored');
    recordTrackingDiagnostic(
      'bg-task-restored',
      { fgServiceStarted: true, taskManagerStarted: true },
      stored.sessionId,
    );
  }
  return restored;
}

export function resetOperatorTrackingStartForTests(): void {
  startInFlight = null;
}
