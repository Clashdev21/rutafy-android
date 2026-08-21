/**
 * Probe de capacidades de sensores — Speed 2B.0.
 * Cache por sesión de proceso (proceso); no inferir por modelo.
 */

import {
  Accelerometer,
  Barometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
} from 'expo-sensors';

import type { SensorCapabilities } from '@/types/sensorCapabilities';
import { EMPTY_SENSOR_CAPABILITIES } from '@/types/sensorCapabilities';

let cachedCapabilities: SensorCapabilities | null = null;
let probeInFlight: Promise<SensorCapabilities> | null = null;

async function safeAvailable(
  probe: () => Promise<boolean>,
): Promise<boolean> {
  try {
    return Boolean(await probe());
  } catch {
    return false;
  }
}

export async function probeSensorCapabilities(
  force = false,
): Promise<SensorCapabilities> {
  if (!force && cachedCapabilities) {
    return cachedCapabilities;
  }
  if (!force && probeInFlight) {
    return probeInFlight;
  }

  probeInFlight = (async () => {
    const [accelerometer, gyroscope, magnetometer, barometer, deviceMotion] =
      await Promise.all([
        safeAvailable(() => Accelerometer.isAvailableAsync()),
        safeAvailable(() => Gyroscope.isAvailableAsync()),
        safeAvailable(() => Magnetometer.isAvailableAsync()),
        safeAvailable(() => Barometer.isAvailableAsync()),
        safeAvailable(() => DeviceMotion.isAvailableAsync()),
      ]);

    const caps: SensorCapabilities = {
      accelerometer,
      gyroscope,
      magnetometer,
      barometer,
      deviceMotion,
    };
    cachedCapabilities = caps;
    return caps;
  })();

  try {
    return await probeInFlight;
  } finally {
    probeInFlight = null;
  }
}

export function getCachedSensorCapabilities(): SensorCapabilities | null {
  return cachedCapabilities;
}

/** Solo tests / reset de proceso. */
export function clearSensorCapabilitiesCache(): void {
  cachedCapabilities = null;
  probeInFlight = null;
}

export function sensorCapabilitiesOrEmpty(): SensorCapabilities {
  return cachedCapabilities ?? EMPTY_SENSOR_CAPABILITIES;
}
