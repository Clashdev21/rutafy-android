/** Stub de react-native: solo lo que el grafo de tracking toca. */
export const Platform = { OS: 'android', select: (spec) => spec.android ?? spec.default };

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
};

export const Alert = {
  alert(_title, _message, buttons) {
    const confirm = Array.isArray(buttons)
      ? buttons.find((button) => button?.style !== 'cancel' && typeof button?.onPress === 'function')
      : null;
    confirm?.onPress();
  },
};

export const NativeModules = {};

export default { Platform, AppState, Alert, NativeModules };
