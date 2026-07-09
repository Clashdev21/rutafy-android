export type SerializedPushError = {
  name?: string;
  message?: string;
  code?: string;
  stack?: string;
  cause?: string;
  raw?: string;
};

function safeStringify(value: unknown): string | undefined {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, current) => {
      if (typeof current === 'object' && current !== null) {
        if (seen.has(current)) return '[Circular]';
        seen.add(current);
      }
      if (typeof current === 'bigint') return String(current);
      if (typeof current === 'function') return `[Function ${current.name || 'anonymous'}]`;
      return current;
    });
  } catch {
    return undefined;
  }
}

function serializeCause(cause: unknown): string | undefined {
  if (cause == null) return undefined;
  if (typeof cause === 'string') return cause.slice(0, 500);
  if (cause instanceof Error) {
    return [cause.name, cause.message].filter(Boolean).join(': ').slice(0, 500);
  }
  return safeStringify(cause)?.slice(0, 500);
}

/**
 * Serializa errores nativos de Expo/FCM para diagnóstico push.
 * No incluye tokens JWT ni Expo Push Tokens.
 */
export function serializePushError(error: unknown): SerializedPushError {
  if (error == null) {
    return { message: 'null_or_undefined_error', raw: String(error) };
  }

  if (typeof error === 'string') {
    return { message: error.slice(0, 1000), raw: error.slice(0, 1000) };
  }

  if (error instanceof Error) {
    const anyErr = error as Error & { code?: unknown; cause?: unknown };
    const code =
      typeof anyErr.code === 'string'
        ? anyErr.code
        : typeof anyErr.code === 'number'
          ? String(anyErr.code)
          : undefined;

    return {
      name: error.name || undefined,
      message: error.message ? error.message.slice(0, 1000) : undefined,
      code,
      stack: error.stack ? error.stack.slice(0, 1500) : undefined,
      cause: serializeCause(anyErr.cause),
      raw: safeStringify({
        name: error.name,
        message: error.message,
        code,
      })?.slice(0, 1000),
    };
  }

  if (typeof error === 'object') {
    const row = error as Record<string, unknown>;
    const message =
      typeof row.message === 'string'
        ? row.message
        : typeof row.error === 'string'
          ? row.error
          : undefined;
    const name = typeof row.name === 'string' ? row.name : undefined;
    const code =
      typeof row.code === 'string'
        ? row.code
        : typeof row.code === 'number'
          ? String(row.code)
          : undefined;

    return {
      name,
      message: message?.slice(0, 1000),
      code,
      stack: typeof row.stack === 'string' ? row.stack.slice(0, 1500) : undefined,
      cause: serializeCause(row.cause),
      raw: safeStringify(error)?.slice(0, 1000),
    };
  }

  return {
    message: String(error).slice(0, 1000),
    raw: String(error).slice(0, 1000),
  };
}

export function suggestPushTokenFix(detail: Record<string, unknown> | undefined): string {
  if (!detail) {
    return 'Error nativo sin detalle; revisar logcat y botón Compartir diagnóstico.';
  }

  const haystack = [
    detail.message,
    detail.name,
    detail.code,
    detail.cause,
    detail.raw,
    detail.reason,
  ]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();

  if (detail.isDevice === false) {
    return 'Expo Push Token requiere dispositivo físico (no emulador).';
  }

  if (
    haystack.includes('firebaseapp') ||
    haystack.includes('google-services') ||
    haystack.includes('default firebase app') ||
    haystack.includes('firebaseapp.initializeapp')
  ) {
    return 'Probable falta de configuración Firebase/FCM en build nativo (google-services / EAS credentials).';
  }

  if (
    haystack.includes('service_not_available') ||
    haystack.includes('fcm') ||
    haystack.includes('firebase') ||
    haystack.includes('google play services')
  ) {
    return 'Probable problema FCM o conectividad con Google Play Services.';
  }

  if (haystack.includes('projectid') || haystack.includes('project id') || haystack.includes('eas')) {
    return 'Revisar Expo projectId / eas config en el build instalado.';
  }

  if (haystack.includes('network') || haystack.includes('timeout') || haystack.includes('offline')) {
    return 'Problema de red al contactar Expo/FCM; reintentar con conectividad estable.';
  }

  if (!detail.message && !detail.code) {
    return 'Error nativo sin mensaje; revisar logcat (adb logcat | grep -i expo).';
  }

  return 'Revisar mensaje/code del error; causas comunes: FCM, google-services, projectId, Play Services.';
}
