import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiClient } from '@/api/client';
import { NOTIFICATION_ENDPOINTS } from '@/api/endpoints';
import { tokenStorage } from '@/auth/tokenStorage';
import {
  clearStoredExpoPushToken,
  getOrCreateDeviceId,
  getStoredExpoPushToken,
  saveExpoPushToken,
} from '@/storage/pushTokenStorage';

export type PushEnvironment = 'development' | 'production';

export type RegisterDevicePayload = {
  expo_push_token: string;
  device_id: string;
  platform: 'android' | 'ios' | 'web';
  environment: PushEnvironment;
  app_version: string;
};

export type PushNotificationData = {
  type?: string;
  screen?: string;
  service_id?: string;
  offer_id?: string;
  expires_at?: string;
  [key: string]: unknown;
};

export type RegisterDeviceOptions = {
  source?: string;
  actorId?: string | null;
  actorType?: string | null;
};

let registerDeviceInFlight: Promise<void> | null = null;
let handlerConfigured = false;

function pushLog(tag: string, detail?: Record<string, unknown>): void {
  if (detail && Object.keys(detail).length > 0) {
    console.log(tag, detail);
  } else {
    console.log(tag);
  }
}

function resolveProjectId(): string | null {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim();
  }
  const fromEas = Constants.easConfig?.projectId;
  if (typeof fromEas === 'string' && fromEas.trim()) {
    return fromEas.trim();
  }
  return null;
}

function resolveAppVersion(): string {
  return Constants.expoConfig?.version?.trim() || '1.0.0';
}

function resolvePlatform(): RegisterDevicePayload['platform'] {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'web';
}

function resolveEnvironment(): PushEnvironment {
  return __DEV__ ? 'development' : 'production';
}

export function setupNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestPushPermissionsAsync(): Promise<boolean> {
  if (!Device.isDevice) {
    pushLog('[push-permission]', { granted: false, reason: 'not_physical_device' });
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    pushLog('[push-permission]', { granted: true, status: current.status });
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  const granted = requested.granted === true;
  pushLog('[push-permission]', { granted, status: requested.status });
  return granted;
}

export async function getExpoPushTokenAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    pushLog('[push-token-error]', { reason: 'not_physical_device' });
    return null;
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    pushLog('[push-token-error]', { reason: 'missing_project_id' });
    return null;
  }

  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data?.trim() || null;
    if (token) {
      pushLog('[push-token]', { prefix: `${token.slice(0, 24)}…` });
    } else {
      pushLog('[push-token-error]', { reason: 'empty_token' });
    }
    return token;
  } catch (error) {
    pushLog('[push-token-error]', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function buildRegisterPayload(
  expoPushToken: string,
): Promise<RegisterDevicePayload> {
  return {
    expo_push_token: expoPushToken,
    device_id: await getOrCreateDeviceId(),
    platform: resolvePlatform(),
    environment: resolveEnvironment(),
    app_version: resolveAppVersion(),
  };
}

export async function registerDevicePushTokenAsync(
  options: RegisterDeviceOptions = {},
): Promise<void> {
  if (registerDeviceInFlight) {
    return registerDeviceInFlight;
  }

  const { source, actorId = null, actorType = null } = options;

  registerDeviceInFlight = (async () => {
    try {
      const granted = await requestPushPermissionsAsync();
      if (!granted) {
        return;
      }

      const expoPushToken = await getExpoPushTokenAsync();
      if (!expoPushToken) {
        return;
      }

      const accessToken = await tokenStorage.getAccessToken();
      if (!accessToken) {
        pushLog('[push-register-skip-no-session]', {
          reason: 'no_token_at_post',
          source: source ?? null,
          hasAccessToken: false,
          hasUser: null,
          actorId,
          actorType,
        });
        return;
      }

      await saveExpoPushToken(expoPushToken);
      const payload = await buildRegisterPayload(expoPushToken);

      pushLog('[push-register-start]', {
        device_id: payload.device_id,
        platform: payload.platform,
        environment: payload.environment,
        source: source ?? null,
        hasAccessToken: true,
        actorId,
        actorType,
      });

      await apiClient.post(NOTIFICATION_ENDPOINTS.registerDevice, payload);

      pushLog('[push-register-success]', {
        device_id: payload.device_id,
        source: source ?? null,
      });
    } catch (error) {
      pushLog('[push-register-error]', {
        message: error instanceof Error ? error.message : String(error),
        source: source ?? null,
      });
    } finally {
      registerDeviceInFlight = null;
    }
  })();

  return registerDeviceInFlight;
}

export async function unregisterDevicePushTokenAsync(): Promise<void> {
  const expoPushToken = await getStoredExpoPushToken();
  if (!expoPushToken) {
    return;
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    pushLog('[push-unregister-start]', { device_id: deviceId });

    await apiClient.post(NOTIFICATION_ENDPOINTS.unregisterDevice, {
      expo_push_token: expoPushToken,
      device_id: deviceId,
    });

    pushLog('[push-unregister-ok]', { device_id: deviceId });
  } catch (error) {
    pushLog('[push-unregister-error]', {
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await clearStoredExpoPushToken();
  }
}

export function parsePushNotificationData(raw: unknown): PushNotificationData {
  if (!raw || typeof raw !== 'object') return {};
  return raw as PushNotificationData;
}
