/**
 * Capacidades reales de sensores del dispositivo.
 * Speed 2B.0 — detectar con isAvailableAsync(); no inferir por modelo.
 */

export type SensorCapabilities = {
  accelerometer: boolean;
  gyroscope: boolean;
  magnetometer: boolean;
  barometer: boolean;
  deviceMotion: boolean;
};

export const EMPTY_SENSOR_CAPABILITIES: SensorCapabilities = {
  accelerometer: false,
  gyroscope: false,
  magnetometer: false,
  barometer: false,
  deviceMotion: false,
};
