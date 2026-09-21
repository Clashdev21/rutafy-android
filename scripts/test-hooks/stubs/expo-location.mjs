/** Stub de expo-location: el estado nativo se controla desde los tests. */
const state = { started: new Set() };

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export const ActivityType = { Other: 1, AutomotiveNavigation: 2, Fitness: 3 };

export async function hasStartedLocationUpdatesAsync(taskName) {
  return state.started.has(taskName);
}

export async function startLocationUpdatesAsync(taskName) {
  state.started.add(taskName);
}

export async function stopLocationUpdatesAsync(taskName) {
  state.started.delete(taskName);
}

export async function watchPositionAsync() {
  return { remove: () => {} };
}

export async function getCurrentPositionAsync() {
  return { coords: { latitude: 0, longitude: 0, accuracy: 5, speed: 0, heading: 0 }, timestamp: Date.now() };
}

export async function getForegroundPermissionsAsync() {
  return { status: 'granted' };
}

export async function requestForegroundPermissionsAsync() {
  return { status: 'granted' };
}

export async function getBackgroundPermissionsAsync() {
  return { status: 'granted' };
}

export async function requestBackgroundPermissionsAsync() {
  return { status: 'granted' };
}

export function __setTaskStarted(taskName, started) {
  if (started) state.started.add(taskName);
  else state.started.delete(taskName);
}

export function __reset() {
  state.started.clear();
}
