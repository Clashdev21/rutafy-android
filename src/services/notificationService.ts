import axios from 'axios';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiClient } from '@/api/client';
import { NOTIFICATION_ENDPOINTS } from '@/api/endpoints';
import { getValidAccessToken } from '@/auth/accessTokenManager';
import { tokenStorage } from '@/auth/tokenStorage';
import {
  isValidExpoPushTokenFormat,
  recordPushDiagnostic,
  tokenPrefix,
} from '@/services/pushDiagnostics';
import {
  clearStoredExpoPushToken,
  getOrCreateDeviceId,
  getStoredExpoPushToken,
  saveExpoPushToken,
} from '@/storage/pushTokenStorage';
import { serializePushError } from '@/utils/serializePushError';

export type PushEnvironment = 'development' | 'production';

export type RegisterDevicePayload = {
  expo_push_token: string;
  device_id: string;
  platform: 'android' | 'ios' | 'web';
  environment: PushEnvironment;
  app_version: string;
  build_number?: string | number | null;
  metadata?: {
    source: string;
    device_brand?: string | null;
    device_model?: string | null;
    android_version?: string | null;
    actor_id?: string | null;
    actor_type?: string | null;
    register_source?: string | null;
  };
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

export function resolvePushProjectId(): string | null {
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

function resolveBuildNumber(): string | number | null {
  const fromAndroid = Constants.expoConfig?.android?.versionCode;
  if (typeof fromAndroid === 'number' && Number.isFinite(fromAndroid)) {
    return fromAndroid;
  }
  const native = Constants.nativeBuildVersion;
  if (native != null && String(native).trim()) {
    return String(native).trim();
  }
  return null;
}

function resolvePlatform(): RegisterDevicePayload['platform'] {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'web';
}

function resolveEnvironment(): PushEnvironment {
  return __DEV__ ? 'development' : 'production';
}

function classifyRegisterHttpError(status: number | undefined): void {
  if (status === 401) {
    recordPushDiagnostic('push-register-401', { httpStatus: status });
  } else if (status === 403) {
    recordPushDiagnostic('push-register-403', { httpStatus: status });
  } else if (status != null && status >= 500) {
    recordPushDiagnostic('push-register-500', { httpStatus: status });
  } else {
    recordPushDiagnostic('push-register-error', { httpStatus: status ?? null });
  }
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

export async function getPushPermissionStatusAsync(): Promise<string> {
  if (!Device.isDevice) return 'not_physical_device';
  const current = await Notifications.getPermissionsAsync();
  return current.status;
}

export async function requestPushPermissionsAsync(): Promise<boolean> {
  recordPushDiagnostic('push-permission-start', { platform: Platform.OS });

  if (!Device.isDevice) {
    pushLog('[push-permission]', { granted: false, reason: 'not_physical_device' });
    recordPushDiagnostic('push-permission-error', { reason: 'not_physical_device' });
    return false;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      pushLog('[push-permission]', { granted: true, status: current.status });
      recordPushDiagnostic('push-permission-granted', { status: current.status });
      return true;
    }

    if (current.status === 'undetermined') {
      recordPushDiagnostic('push-permission-undetermined', {});
    }

    const requested = await Notifications.requestPermissionsAsync();
    const granted = requested.granted === true;
    pushLog('[push-permission]', { granted, status: requested.status });

    if (granted) {
      recordPushDiagnostic('push-permission-granted', { status: requested.status });
    } else {
      recordPushDiagnostic('push-permission-denied', { status: requested.status });
    }

    return granted;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    recordPushDiagnostic('push-permission-error', { errorMessage });
    pushLog('[push-permission]', { granted: false, error: errorMessage });
    return false;
  }
}

export async function getExpoPushTokenAsync(): Promise<string | null> {
  recordPushDiagnostic('push-token-start', { platform: Platform.OS });

  const projectId = resolvePushProjectId();
  const easProjectId =
    typeof Constants.expoConfig?.extra?.eas?.projectId === 'string'
      ? Constants.expoConfig.extra.eas.projectId
      : null;
  const constantsProjectId =
    typeof Constants.easConfig?.projectId === 'string' ? Constants.easConfig.projectId : null;

  const context = {
    projectId,
    hasProjectId: Boolean(projectId),
    appOwnership: Constants.appOwnership ?? null,
    executionEnvironment: Constants.executionEnvironment ?? null,
    expoConfigName: Constants.expoConfig?.name ?? null,
    easProjectId,
    constantsProjectId,
    deviceBrand: Device.brand ?? null,
    deviceManufacturer: Device.manufacturer ?? null,
    deviceModel: Device.modelName ?? null,
    osVersion: Device.osVersion ?? null,
    isDevice: Device.isDevice,
    platform: Platform.OS,
  };

  recordPushDiagnostic('push-token-context', context);

  if (!Device.isDevice) {
    pushLog('[push-token-error]', { reason: 'not_physical_device' });
    recordPushDiagnostic('push-token-error', {
      reason: 'not_physical_device',
      message: 'Expo Push Token requires a physical device',
      ...context,
    });
    return null;
  }

  if (!projectId) {
    pushLog('[push-token-error]', { reason: 'missing_project_id' });
    recordPushDiagnostic('push-project-id-missing', context);
    recordPushDiagnostic('push-token-error', {
      reason: 'missing_project_id',
      message: 'Missing Expo/EAS projectId',
      ...context,
    });
    return null;
  }

  recordPushDiagnostic('push-project-id-resolved', {
    projectId,
    projectIdPrefix: `${projectId.slice(0, 8)}…`,
  });

  try {
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult.data?.trim() || null;

    if (!token) {
      pushLog('[push-token-error]', { reason: 'empty_token' });
      recordPushDiagnostic('push-token-error', {
        reason: 'empty_token',
        message: 'getExpoPushTokenAsync returned empty token',
        ...context,
      });
      return null;
    }

    if (!isValidExpoPushTokenFormat(token)) {
      pushLog('[push-token-error]', { reason: 'invalid_format', prefix: tokenPrefix(token) });
      recordPushDiagnostic('push-token-invalid-format', {
        tokenPrefix: tokenPrefix(token),
        tokenLength: token.length,
        message: 'Invalid Expo push token format',
        ...context,
      });
      return null;
    }

    pushLog('[push-token]', { prefix: tokenPrefix(token) });
    recordPushDiagnostic('push-token-success', {
      tokenPrefix: tokenPrefix(token),
      tokenLength: token.length,
    });
    return token;
  } catch (error) {
    const serialized = serializePushError(error);
    const stackPreview = serialized.stack
      ? serialized.stack.split('\n').slice(0, 8).join('\n')
      : undefined;

    pushLog('[push-token-error]', {
      message: serialized.message,
      name: serialized.name,
      code: serialized.code,
    });

    recordPushDiagnostic('push-token-error', {
      ...serialized,
      stackPreview,
      ...context,
    });
    return null;
  }
}

async function buildRegisterPayload(
  expoPushToken: string,
  options: RegisterDeviceOptions,
): Promise<RegisterDevicePayload> {
  return {
    expo_push_token: expoPushToken,
    device_id: await getOrCreateDeviceId(),
    platform: resolvePlatform(),
    environment: resolveEnvironment(),
    app_version: resolveAppVersion(),
    build_number: resolveBuildNumber(),
    metadata: {
      source: 'rutafy_android',
      device_brand: Device.brand ?? null,
      device_model: Device.modelName ?? null,
      android_version: Device.osVersion ?? null,
      actor_id: options.actorId ?? null,
      actor_type: options.actorType ?? null,
      register_source: options.source ?? null,
    },
  };
}

async function postRegisterDevice(
  payload: RegisterDevicePayload,
): Promise<{ httpStatus: number }> {
  const response = await apiClient.post(NOTIFICATION_ENDPOINTS.registerDevice, payload);
  return { httpStatus: response.status };
}

async function registerWithOptional401Retry(
  payload: RegisterDevicePayload,
  source: string | null | undefined,
): Promise<void> {
  try {
    const result = await postRegisterDevice(payload);
    recordPushDiagnostic('push-register-success', {
      httpStatus: result.httpStatus,
      deviceId: payload.device_id,
      platform: payload.platform,
      environment: payload.environment,
      source: source ?? null,
    });
    pushLog('[push-register-success]', {
      device_id: payload.device_id,
      source: source ?? null,
      httpStatus: result.httpStatus,
    });
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (status === 401) {
      recordPushDiagnostic('push-register-401', { httpStatus: status, source: source ?? null });
      const refreshed = await getValidAccessToken({
        forceRefresh: true,
        source: 'push_register_401',
      });
      if (refreshed) {
        try {
          const retry = await postRegisterDevice(payload);
          recordPushDiagnostic('push-register-success', {
            httpStatus: retry.httpStatus,
            deviceId: payload.device_id,
            retriedAfter401: true,
            source: source ?? null,
          });
          pushLog('[push-register-success]', {
            device_id: payload.device_id,
            source: source ?? null,
            retriedAfter401: true,
          });
          return;
        } catch (retryError) {
          const retryStatus = axios.isAxiosError(retryError)
            ? retryError.response?.status
            : undefined;
          const retryMessage =
            retryError instanceof Error ? retryError.message : String(retryError);
          classifyRegisterHttpError(retryStatus);
          recordPushDiagnostic('push-register-error', {
            httpStatus: retryStatus ?? null,
            errorMessage: retryMessage,
            source: source ?? null,
          });
          pushLog('[push-register-error]', { message: retryMessage, source: source ?? null });
          return;
        }
      }
    }

    classifyRegisterHttpError(status);
    recordPushDiagnostic('push-register-error', {
      httpStatus: status ?? null,
      errorMessage,
      source: source ?? null,
    });
    pushLog('[push-register-error]', { message: errorMessage, source: source ?? null });
  }
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
      const accessToken = await getValidAccessToken({ source: 'push_register' });
      const refresh = await tokenStorage.getRefreshToken();
      if (!accessToken && !refresh) {
        recordPushDiagnostic('push-register-skip-no-session', {
          reason: 'no_session',
          source: source ?? null,
          hasAccessToken: false,
          actorId,
          actorType,
        });
        pushLog('[push-register-skip-no-session]', {
          reason: 'no_session',
          source: source ?? null,
        });
        return;
      }
      if (!accessToken) {
        recordPushDiagnostic('push-register-skip-no-session', {
          reason: 'no_valid_access_token',
          source: source ?? null,
          hasAccessToken: false,
          actorId,
          actorType,
        });
        pushLog('[push-register-skip-no-session]', {
          reason: 'no_valid_access_token',
          source: source ?? null,
        });
        return;
      }

      recordPushDiagnostic('push-register-start', {
        source: source ?? null,
        actorId,
        actorType,
        hasAccessToken: true,
        platform: resolvePlatform(),
        environment: resolveEnvironment(),
        appVersion: resolveAppVersion(),
      });
      pushLog('[push-register-start]', {
        source: source ?? null,
        actorId,
        actorType,
      });

      const granted = await requestPushPermissionsAsync();
      if (!granted) {
        return;
      }

      const expoPushToken = await getExpoPushTokenAsync();
      if (!expoPushToken) {
        return;
      }

      await saveExpoPushToken(expoPushToken);
      const payload = await buildRegisterPayload(expoPushToken, options);

      recordPushDiagnostic('push-register-payload', {
        tokenPrefix: tokenPrefix(expoPushToken),
        tokenLength: expoPushToken.length,
        deviceId: payload.device_id,
        platform: payload.platform,
        environment: payload.environment,
        appVersion: payload.app_version,
        buildNumber: payload.build_number ?? null,
        actorId,
        actorType,
        source: source ?? null,
      });

      await registerWithOptional401Retry(payload, source);
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

  const accessToken = await getValidAccessToken({ source: 'push_unregister' });
  if (!accessToken) {
    pushLog('[push-unregister-skip-no-session]', { reason: 'no_valid_access_token' });
    await clearStoredExpoPushToken();
    return;
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    recordPushDiagnostic('push-unregister-start', { deviceId });
    pushLog('[push-unregister-start]', { device_id: deviceId });

    await apiClient.post(NOTIFICATION_ENDPOINTS.unregisterDevice, {
      expo_push_token: expoPushToken,
      device_id: deviceId,
    });

    recordPushDiagnostic('push-unregister-success', { deviceId });
    pushLog('[push-unregister-ok]', { device_id: deviceId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    recordPushDiagnostic('push-unregister-error', { errorMessage });
    pushLog('[push-unregister-error]', { message: errorMessage });
  } finally {
    await clearStoredExpoPushToken();
  }
}

export function parsePushNotificationData(raw: unknown): PushNotificationData {
  if (!raw || typeof raw !== 'object') return {};
  return raw as PushNotificationData;
}
