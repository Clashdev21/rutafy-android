import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, Platform } from 'react-native';

import { BACKGROUND_LOCATION_TASK_NAME } from '@/services/backgroundLocationTask';
import { OPERATOR_TRACKING_TASK_NAME } from '@/services/operatorTrackingTask';
import { recordTrackingDiagnostic } from '@/services/trackingDiagnostics';
import { trackingSessionStorage } from '@/storage/trackingSessionStorage';

const TIME_INTERVAL_MS = 20000;
const DISTANCE_INTERVAL_M = 10;

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

    const accepted = await showOperatorBackgroundRationaleAlert();
    if (!accepted) return false;

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') return true;

    const bgReq = await Location.requestBackgroundPermissionsAsync();
    return bgReq.status === 'granted';
  } catch (error) {
    if (__DEV__) {
      console.warn('[operator-bg-start]', { permissionError: error });
    }
    return false;
  }
}

async function isMessengerBackgroundTrackingStarted(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  } catch {
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
  const stored = await trackingSessionStorage.getActive();
  if (!stored?.sessionId?.trim()) {
    if (__DEV__) {
      console.log('[operator-bg-start]', { skipped: true, reason: 'no_active_session' });
    }
    return false;
  }

  if (await isMessengerBackgroundTrackingStarted()) {
    if (__DEV__) {
      console.warn('[operator-bg-start]', { skipped: true, reason: 'messenger_bg_active' });
    }
    return false;
  }

  if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
    console.warn('[operator-bg-start]', { skipped: true, reason: 'task_not_defined' });
    return false;
  }

  const hasPermission = await requestOperatorBackgroundLocationPermission();
  if (!hasPermission) {
    if (__DEV__) {
      console.warn('[operator-bg-start]', { skipped: true, reason: 'permission_denied' });
    }
    return false;
  }

  try {
    const alreadyStarted = await isOperatorTrackingStartedAsync();
    if (alreadyStarted) {
      if (__DEV__) {
        console.log('[operator-bg-start]', { started: true, alreadyStarted: true });
      }
      return true;
    }

    await Location.startLocationUpdatesAsync(OPERATOR_TRACKING_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: TIME_INTERVAL_MS,
      distanceInterval: DISTANCE_INTERVAL_M,
      deferredUpdatesInterval: TIME_INTERVAL_MS,
      deferredUpdatesDistance: DISTANCE_INTERVAL_M,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Captura logística activa',
        notificationBody: 'Rutafy está registrando ubicación operativa.',
      },
    });

    const started = await isOperatorTrackingStartedAsync();
    if (__DEV__) {
      console.log('[operator-bg-start]', { started, task: OPERATOR_TRACKING_TASK_NAME });
    }
    if (started) {
      recordTrackingDiagnostic(
        'bg-task-start',
        {
          fgServiceStarted: true,
          taskManagerStarted: true,
          task: OPERATOR_TRACKING_TASK_NAME,
        },
        stored.sessionId,
      );
    }
    return started;
  } catch (error) {
    recordTrackingDiagnostic(
      'bg-task-error',
      { error: String(error), task: OPERATOR_TRACKING_TASK_NAME },
      stored.sessionId,
    );
    console.warn('[operator-bg-start]', { error });
    return false;
  }
}

export async function stopOperatorTrackingAsync(): Promise<void> {
  if (!TaskManager.isTaskDefined(OPERATOR_TRACKING_TASK_NAME)) {
    if (__DEV__) {
      console.log('[operator-bg-stop]', { skipped: true, reason: 'task_not_defined' });
    }
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
    return;
  }

  try {
    await Location.stopLocationUpdatesAsync(OPERATOR_TRACKING_TASK_NAME);
    const stored = await trackingSessionStorage.getActive();
    recordTrackingDiagnostic(
      'bg-task-stop',
      { fgServiceStarted: false, taskManagerStarted: false },
      stored?.sessionId,
    );
    if (__DEV__) {
      console.log('[operator-bg-stop]', { stopped: true });
    }
  } catch (error) {
    if (isTaskNotFoundError(error)) {
      if (__DEV__) {
        console.warn('[operator-bg-stop]', { skipped: true, reason: 'task_not_found' });
      }
      return;
    }
    console.warn('[operator-bg-stop]', { error });
  }
}

export async function ensureOperatorBackgroundTracking(): Promise<boolean> {
  const stored = await trackingSessionStorage.getActive();
  if (!stored?.sessionId?.trim()) {
    return false;
  }
  if (await isOperatorTrackingStartedAsync()) {
    return true;
  }
  const restored = await startOperatorTrackingAsync();
  if (restored) {
    recordTrackingDiagnostic(
      'bg-task-restored',
      { fgServiceStarted: true, taskManagerStarted: true },
      stored.sessionId,
    );
  }
  return restored;
}
