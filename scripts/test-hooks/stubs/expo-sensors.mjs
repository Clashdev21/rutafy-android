/** Stub de expo-sensors: bindings nativos, sin I/O de negocio. */

function createSensor() {
  return {
    isAvailableAsync: async () => false,
    addListener: () => ({ remove: () => {} }),
    removeAllListeners: () => {},
    setUpdateInterval: () => {},
  };
}

export const Accelerometer = createSensor();
export const Barometer = createSensor();
export const DeviceMotion = createSensor();
export const Gyroscope = createSensor();
export const Magnetometer = createSensor();
