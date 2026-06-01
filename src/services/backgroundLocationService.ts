import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';

import { BACKGROUND_LOCATION_TASK_NAME } from '@/services/backgroundLocationTask';

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

export async function startBackgroundLocationForActiveService(): Promise<void> {
  const hasPermission = await requestBackgroundLocationPermissionWithRationale();
  if (!hasPermission) return;

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  if (started) {
    console.log('[bg-location-start]', { alreadyStarted: true });
    return;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30000,
    distanceInterval: 25,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Rutafy está siguiendo el servicio',
      notificationBody: 'Tu ubicación se comparte mientras el servicio está activo.',
    },
  });

  console.log('[bg-location-start]', { started: true });
}

export async function stopBackgroundLocation(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  if (!started) {
    console.log('[bg-location-stop]', { started: false });
    return;
  }

  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  console.log('[bg-location-stop]', { started: true });
}

export async function syncBackgroundTracking(enabled: boolean): Promise<void> {
  if (enabled) {
    await startBackgroundLocationForActiveService();
    return;
  }
  await stopBackgroundLocation();
}
