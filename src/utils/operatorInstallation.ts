import { getOrCreateInstallationId } from '@/storage/pushTokenStorage';

export const RUTAFY_INSTALLATION_ID_HEADER = 'X-Rutafy-Installation-Id';

export { getOrCreateInstallationId };

export function shouldAttachInstallationId(url: string): boolean {
  const path = url.toLowerCase();
  if (path.includes('/v1/auth/')) return false;
  return path.includes('tracking-sessions');
}

export function installationIdHeaders(installationId: string): Record<string, string> {
  const trimmed = installationId.trim();
  if (!trimmed) return {};
  return { [RUTAFY_INSTALLATION_ID_HEADER]: trimmed };
}

export function buildOperatorTrackingRequestHeaders(input: {
  accessToken: string;
  installationId: string;
  traceId?: string;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${input.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...installationIdHeaders(input.installationId),
    ...(input.traceId ? { 'x-trace-id': input.traceId } : {}),
  };
}
