import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  extractValidClosePinDigits,
  shouldClearPersistedTransportistaClosePin,
} from '@/utils/transportistaClosePin';

/** Misma clave que portex-rutafy web (`localStorage`). */
export const TRANSPORTISTA_CLOSE_PINS_STORAGE_KEY = 'rutafy.transportista.closePins.v1';

const isWeb = Platform.OS === 'web';

async function readRaw(): Promise<string | null> {
  if (isWeb) {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(TRANSPORTISTA_CLOSE_PINS_STORAGE_KEY);
    return raw?.trim() ? raw : null;
  }
  const raw = await SecureStore.getItemAsync(TRANSPORTISTA_CLOSE_PINS_STORAGE_KEY);
  return raw?.trim() ? raw : null;
}

async function writeRaw(value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TRANSPORTISTA_CLOSE_PINS_STORAGE_KEY, value);
    }
    return;
  }
  await SecureStore.setItemAsync(TRANSPORTISTA_CLOSE_PINS_STORAGE_KEY, value);
}

async function deleteRaw(): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TRANSPORTISTA_CLOSE_PINS_STORAGE_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(TRANSPORTISTA_CLOSE_PINS_STORAGE_KEY);
}

export async function readPersistedTransportistaClosePins(): Promise<Record<string, string>> {
  try {
    const raw = await readRaw();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return {};
}

export async function writePersistedTransportistaClosePins(
  map: Record<string, string>,
): Promise<void> {
  const keys = Object.keys(map);
  if (keys.length === 0) {
    await deleteRaw();
    return;
  }
  await writeRaw(JSON.stringify(map));
}

export async function removePersistedTransportistaClosePin(serviceId: string): Promise<void> {
  const id = String(serviceId).trim();
  if (!id || id === 'sin-id') return;
  const map = await readPersistedTransportistaClosePins();
  if (!(id in map)) return;
  delete map[id];
  await writePersistedTransportistaClosePins(map);
}

export async function persistTransportistaClosePinIfValid(
  serviceId: string,
  pin: unknown,
): Promise<void> {
  const id = String(serviceId).trim();
  if (!id || id === 'sin-id') return;
  const valid = extractValidClosePinDigits(pin);
  if (!valid) return;
  const map = await readPersistedTransportistaClosePins();
  map[id] = valid;
  await writePersistedTransportistaClosePins(map);
}

export async function readPersistedTransportistaClosePinForService(
  serviceId: string,
): Promise<string | null> {
  const id = String(serviceId).trim();
  if (!id || id === 'sin-id') return null;
  const map = await readPersistedTransportistaClosePins();
  return extractValidClosePinDigits(map[id]);
}

/** API (si viene) + persistencia local; limpia en estados terminales. */
export async function resolveTransportistaClosePin(
  serviceId: string,
  status: string,
  fromApi?: unknown,
): Promise<string | null> {
  const id = String(serviceId).trim();
  if (!id || id === 'sin-id') return null;

  if (shouldClearPersistedTransportistaClosePin(status)) {
    await removePersistedTransportistaClosePin(id);
    return extractValidClosePinDigits(fromApi);
  }

  const fromApiValid = extractValidClosePinDigits(fromApi);
  if (fromApiValid) return fromApiValid;
  return readPersistedTransportistaClosePinForService(id);
}
