import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  PushDiagnosticEvent,
  PushDiagnosticEventType,
  PushDiagnosticState,
  PushTokenErrorSnapshot,
} from '@/types/pushDiagnostics';
import { EMPTY_PUSH_DIAGNOSTIC_STATE } from '@/types/pushDiagnostics';
import { suggestPushTokenFix } from '@/utils/serializePushError';

const EVENTS_KEY = 'rutafy_push_diag_events';
const STATE_KEY = 'rutafy_push_diag_state';

const MAX_EVENTS = 50;
export const PUSH_REGISTER_MIN_INTERVAL_MS = 5 * 60 * 1000;

let persistChain: Promise<void> = Promise.resolve();

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeDetail(detail?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (
      lower.includes('accesstoken') ||
      lower.includes('access_token') ||
      lower.includes('refresh_token') ||
      lower === 'token' ||
      lower === 'jwt'
    ) {
      continue;
    }
    if (lower === 'expopushtoken' || lower === 'expo_push_token') {
      continue;
    }
    next[key] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function enqueuePersist(task: () => Promise<void>): void {
  persistChain = persistChain.then(task).catch(() => undefined);
}

export function tokenPrefix(token: string | null | undefined): string | null {
  if (!token?.trim()) return null;
  const trimmed = token.trim();
  return trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed;
}

export function isValidExpoPushTokenFormat(token: string | null | undefined): boolean {
  if (!token?.trim()) return false;
  const t = token.trim();
  if (t.includes('FAKE_TOKEN')) return false;
  return /^Expo(?:nent)?PushToken\[[^\]]+\]$/.test(t);
}

function pickStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildTokenErrorSnapshot(
  detail: Record<string, unknown> | undefined,
  timestamp: string,
): PushTokenErrorSnapshot {
  const message = pickStr(detail?.message) ?? pickStr(detail?.errorMessage) ?? pickStr(detail?.reason);
  const suggestion = suggestPushTokenFix(detail);
  return {
    timestamp,
    message,
    name: pickStr(detail?.name),
    code: pickStr(detail?.code),
    stackPreview: pickStr(detail?.stackPreview) ?? pickStr(detail?.stack),
    cause: pickStr(detail?.cause),
    projectId: pickStr(detail?.projectId),
    hasProjectId: detail?.hasProjectId === true,
    appOwnership: pickStr(detail?.appOwnership),
    executionEnvironment: pickStr(detail?.executionEnvironment),
    deviceBrand: pickStr(detail?.deviceBrand),
    deviceModel: pickStr(detail?.deviceModel),
    osVersion: pickStr(detail?.osVersion),
    isDevice: typeof detail?.isDevice === 'boolean' ? detail.isDevice : null,
    platform: pickStr(detail?.platform),
    suggestion,
  };
}

export function recordPushDiagnostic(
  type: PushDiagnosticEventType,
  detail?: Record<string, unknown>,
): void {
  const event: PushDiagnosticEvent = {
    timestamp: nowIso(),
    type,
    detail: sanitizeDetail(detail),
  };

  enqueuePersist(async () => {
    const events = await readJson<PushDiagnosticEvent[]>(EVENTS_KEY, []);
    events.push(event);
    while (events.length > MAX_EVENTS) {
      events.shift();
    }
    await writeJson(EVENTS_KEY, events);

    const state = await readJson<PushDiagnosticState>(STATE_KEY, EMPTY_PUSH_DIAGNOSTIC_STATE);
    const next: PushDiagnosticState = {
      ...EMPTY_PUSH_DIAGNOSTIC_STATE,
      ...state,
      lastTokenError: state.lastTokenError ?? null,
    };

    if (type === 'push-permission-granted') {
      next.lastPermissionStatus = 'granted';
    } else if (type === 'push-permission-denied') {
      next.lastPermissionStatus = 'denied';
    } else if (type === 'push-permission-undetermined') {
      next.lastPermissionStatus = 'undetermined';
    }

    if (type === 'push-project-id-resolved') {
      next.lastProjectIdOk = true;
    } else if (type === 'push-project-id-missing') {
      next.lastProjectIdOk = false;
    }

    if (type === 'push-token-success' && typeof detail?.tokenPrefix === 'string') {
      next.lastTokenPrefix = detail.tokenPrefix;
      next.lastTokenError = null;
    }

    if (type === 'push-token-error' || type === 'push-token-invalid-format') {
      next.lastTokenError = buildTokenErrorSnapshot(detail, event.timestamp);
      next.lastPushRegisterError = next.lastTokenError.message ?? type;
    }

    if (type === 'push-register-start') {
      next.lastPushRegisterAttemptAt = event.timestamp;
      if (typeof detail?.actorId === 'string') next.lastActorId = detail.actorId;
      if (typeof detail?.actorType === 'string') next.lastActorType = detail.actorType;
    }

    if (type === 'push-register-success') {
      next.lastPushRegisterSuccessAt = event.timestamp;
      next.lastPushRegisterError = null;
      if (typeof detail?.httpStatus === 'number') next.lastHttpStatus = detail.httpStatus;
    }

    if (
      type === 'push-register-error' ||
      type === 'push-register-401' ||
      type === 'push-register-403' ||
      type === 'push-register-500'
    ) {
      next.lastPushRegisterError =
        typeof detail?.errorMessage === 'string' ? detail.errorMessage : type;
      if (typeof detail?.httpStatus === 'number') next.lastHttpStatus = detail.httpStatus;
    }

    await writeJson(STATE_KEY, next);
  });
}

export async function getPushDiagnosticEvents(
  limit = MAX_EVENTS,
): Promise<PushDiagnosticEvent[]> {
  const events = await readJson<PushDiagnosticEvent[]>(EVENTS_KEY, []);
  return events.slice(-limit);
}

export async function getPushDiagnosticState(): Promise<PushDiagnosticState> {
  const state = await readJson(STATE_KEY, EMPTY_PUSH_DIAGNOSTIC_STATE);
  return {
    ...EMPTY_PUSH_DIAGNOSTIC_STATE,
    ...state,
    lastTokenError: state.lastTokenError ?? null,
  };
}

export async function buildPushDiagnosticExport(): Promise<{
  exportedAt: string;
  state: PushDiagnosticState;
  events: PushDiagnosticEvent[];
}> {
  const [state, events] = await Promise.all([
    getPushDiagnosticState(),
    getPushDiagnosticEvents(MAX_EVENTS),
  ]);
  return {
    exportedAt: nowIso(),
    state,
    events,
  };
}

export async function canAttemptPushRegister(
  source: string,
  nowMs = Date.now(),
): Promise<boolean> {
  if (source === 'manual_debug') return true;

  const state = await getPushDiagnosticState();
  if (!state.lastPushRegisterAttemptAt) return true;

  const last = new Date(state.lastPushRegisterAttemptAt).getTime();
  if (!Number.isFinite(last)) return true;

  return nowMs - last >= PUSH_REGISTER_MIN_INTERVAL_MS;
}
