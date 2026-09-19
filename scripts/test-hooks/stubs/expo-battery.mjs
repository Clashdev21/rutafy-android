/** Stub de expo-battery. */
export async function getBatteryLevelAsync() {
  return 1;
}

export async function getPowerStateAsync() {
  return { batteryLevel: 1, batteryState: 2, lowPowerMode: false };
}

export const BatteryState = { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 };
