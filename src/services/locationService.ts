import * as Location from 'expo-location';

export type ForegroundGpsPermissionState = 'granted' | 'denied' | 'undetermined';

export type GpsPosition = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  timestamp: number;
};

export async function requestForegroundGpsPermission(): Promise<ForegroundGpsPermissionState> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status === 'granted') return 'granted';
  if (permission.status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getCurrentGpsPosition(): Promise<GpsPosition> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
  });

  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    timestamp: position.timestamp,
  };
}

export function hasValidLatLng(position: GpsPosition | null): position is GpsPosition {
  if (!position) return false;
  return Number.isFinite(position.lat) && Number.isFinite(position.lng);
}
