import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { TASK_NAME } from '@/services/backgroundLocationTask';

let lastSyncedEnabled: boolean | null = null;
let isSyncing = false;

function isTaskNotFoundError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? '');
  return (
    message.includes('TaskNotFound') ||
    message.includes('not found for app ID') ||
    message.includes('not found')
  );
}

async function showBackgroundRationaleAlert(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Ubicación en segundo plano',
      'Rutafy necesita ubicación en segundo plano solo durante servicios activos para que el transportista pueda ver el avance.',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuar', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function requestBackgroundLocationPermissionWithRationale(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      const fgReq = await Location.requestForegroundPermissionsAsync();
      console.log('[bg-location-permission]', { stage: 'foreground', status: fgReq.status });
      if (fgReq.status !== 'granted') return false;
    }

    if (Platform.OS !== 'android') return true;

    const accepted = await showBackgroundRationaleAlert();
    if (!accepted) {
      console.log('[bg-location-permission]', { stage: 'rationale', accepted: false });
      return false;
    }

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      console.log('[bg-location-permission]', { stage: 'background', status: bg.status });
      return true;
    }

    const bgReq = await Location.requestBackgroundPermissionsAsync();
    console.log('[bg-location-permission]', { stage: 'background', status: bgReq.status });
    return bgReq.status === 'granted';
  } catch (error) {
    console.warn('[bg-location-permission]', { error });
    return false;
  }
}

export async function startBackgroundLocationForActiveService(): Promise<boolean> {
  console.log('[bg-start-call]', {
    task: TASK_NAME,
  });
  const isDefined = TaskManager.isTaskDefined(TASK_NAME);
  if (!isDefined) {
    console.warn('[bg-location-start-error]', { reason: 'task_not_defined', task: TASK_NAME });
    return false;
  }

  const hasPermission = await requestBackgroundLocationPermissionWithRationale();
  if (!hasPermission) return false;

  try {
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(
      () => false,
    );
    if (alreadyStarted) {
      console.log('[bg-location-start]', { started: true, alreadyStarted: true });
      return true;
    }

    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,
      distanceInterval: 25,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Rutafy está siguiendo el servicio',
        notificationBody: 'Tu ubicación se comparte mientras el servicio está activo.',
      },
    });

    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    console.log('[bg-location-start]', { started, task: TASK_NAME });
    return started;
  } catch (error) {
    console.warn('[bg-location-start-error]', error);
    return false;
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  const isDefined = TaskManager.isTaskDefined(TASK_NAME);
  let started = false;

  try {
    started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  } catch (error) {
    console.warn('[bg-location-stop-check]', { isDefined, started: false, checkError: error });
    return;
  }

  console.log('[bg-location-stop-check]', { isDefined, started });

  if (!isDefined) {
    console.warn('[bg-location-stop]', { skipped: true, reason: 'task_not_defined' });
    return;
  }

  if (!started) {
    console.log('[bg-location-stop]', { skipped: true, reason: 'not_started' });
    return;
  }

  try {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
    console.log('[bg-location-stop]', { stopped: true });
  } catch (error) {
    if (isTaskNotFoundError(error)) {
      console.warn('[bg-location-stop]', { skipped: true, reason: 'task_not_found', error });
      return;
    }
    console.warn('[bg-location-stop-error]', error);
  }
}

export async function syncBackgroundTracking(enabled: boolean): Promise<void> {
  console.log('[bg-sync-call]', {
    enabled,
    lastSyncedEnabled,
    isSyncing,
  });
  if (lastSyncedEnabled === enabled) return;
  if (isSyncing) return;

  isSyncing = true;
  try {
    lastSyncedEnabled = enabled;
    if (enabled) {
      const ok = await startBackgroundLocationForActiveService();
      if (!ok) {
        lastSyncedEnabled = null;
      }
      return;
    }
    await stopBackgroundLocation();
  } finally {
    isSyncing = false;
  }
}
