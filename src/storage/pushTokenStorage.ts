import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const EXPO_PUSH_TOKEN_KEY = 'rutafy_expo_push_token';
const DEVICE_ID_KEY = 'rutafy_device_id';

const isWeb = Platform.OS === 'web';

function trimOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    if (typeof localStorage === 'undefined') return null;
    return trimOrNull(localStorage.getItem(key));
  }
  return trimOrNull(await SecureStore.getItemAsync(key));
}

async function setItem(key: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, trimmed);
    }
    return;
  }
  await SecureStore.setItemAsync(key, trimmed);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function randomDeviceId(): string {
  const hex = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-a${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`;
}

export async function getStoredExpoPushToken(): Promise<string | null> {
  return getItem(EXPO_PUSH_TOKEN_KEY);
}

export async function saveExpoPushToken(token: string): Promise<void> {
  await setItem(EXPO_PUSH_TOKEN_KEY, token);
}

export async function clearStoredExpoPushToken(): Promise<void> {
  await deleteItem(EXPO_PUSH_TOKEN_KEY);
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = randomDeviceId();
  await setItem(DEVICE_ID_KEY, created);
  return created;
}
