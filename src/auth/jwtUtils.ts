/** Buffer antes de expiración para refresh proactivo (60 s). */
export const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60_000;

export function decodeJwtExpMs(token: string): number | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    let base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);
    const atobFn = typeof globalThis.atob === 'function' ? globalThis.atob : null;
    if (!atobFn) return null;
    const json = JSON.parse(atobFn(base64)) as { exp?: unknown };
    if (typeof json.exp === 'number' && Number.isFinite(json.exp)) {
      return json.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveExpiresAtMs(input: {
  expires_at?: string | number | null;
  expiresAt?: string | number | null;
  expires_in?: number | null;
  access_token?: string | null;
}): number | null {
  const raw = input.expires_at ?? input.expiresAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) return asNum > 1e12 ? asNum : asNum * 1000;
  }
  if (typeof input.expires_in === 'number' && Number.isFinite(input.expires_in)) {
    return Date.now() + input.expires_in * 1000;
  }
  const access = input.access_token?.trim();
  if (access) {
    return decodeJwtExpMs(access);
  }
  return null;
}

export function isTokenExpiredOrNear(expiresAtMs: number | null, nowMs = Date.now()): boolean {
  if (expiresAtMs == null) return false;
  return nowMs >= expiresAtMs - ACCESS_TOKEN_EXPIRY_BUFFER_MS;
}
