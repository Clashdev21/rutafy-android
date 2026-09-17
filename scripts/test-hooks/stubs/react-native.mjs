/** Stub de react-native: solo lo que el grafo de tracking toca. */
export const Platform = { OS: 'android', select: (spec) => spec.android ?? spec.default };

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
};

export const Alert = { alert: () => {} };

export const NativeModules = {};

export default { Platform, AppState, Alert, NativeModules };
