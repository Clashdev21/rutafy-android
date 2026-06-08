import { isOperatorTrackingStartedAsync } from '@/services/operatorTrackingService';
import { operatorTrackingHealthStorage } from '@/storage/operatorTrackingHealthStorage';
import type { OperatorTrackingHealth } from '@/types/operatorTrackingHealth';

export function classifyOperatorBgBatchError(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();

  if (!message.trim()) return 'unknown_error';
  if (message.includes('sin token') || message.includes('401')) return '401';
  if (message.includes('network') || message.includes('failed to fetch')) return 'network_error';
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout';

  const httpMatch = message.match(/http\s*(\d{3})/i);
  if (httpMatch?.[1]) return httpMatch[1];

  return message.length > 80 ? `${message.slice(0, 80)}…` : message;
}

export async function inspectOperatorTrackingHealth(): Promise<OperatorTrackingHealth> {
  const [started, stored] = await Promise.all([
    isOperatorTrackingStartedAsync(),
    operatorTrackingHealthStorage.get(),
  ]);

  return {
    started,
    lastEventAt: stored.lastOperatorBgEventAt,
    lastBatchOkAt: stored.lastOperatorBgBatchOkAt,
    lastBatchErrorAt: stored.lastOperatorBgBatchErrorAt,
    lastError: stored.lastOperatorBgError,
  };
}

export async function logOperatorBgHealth(): Promise<OperatorTrackingHealth> {
  const health = await inspectOperatorTrackingHealth();
  console.log('[operator-bg-health]', {
    started: health.started,
    lastEventAt: health.lastEventAt ?? null,
    lastBatchOkAt: health.lastBatchOkAt ?? null,
    lastBatchErrorAt: health.lastBatchErrorAt ?? null,
    lastError: health.lastError ?? null,
  });
  return health;
}
