export type DispatchOfferIntent = {
  offerId: string;
  serviceId: string;
  expiresAt: string | null;
  receivedAt: number;
};

let pendingIntent: DispatchOfferIntent | null = null;

type PushIntentListener = () => void;
const listeners = new Set<PushIntentListener>();

function notifyPushIntentListeners(): void {
  listeners.forEach((listener) => listener());
}

export function subscribePushIntentListener(listener: PushIntentListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function logIntent(tag: string, detail?: Record<string, unknown>): void {
  if (__DEV__) {
    if (detail && Object.keys(detail).length > 0) {
      console.log(tag, detail);
    } else {
      console.log(tag);
    }
  }
}

export function setPendingDispatchOfferIntent(input: {
  offerId?: string;
  serviceId?: string;
  expiresAt?: string | null;
}): void {
  const offerId = typeof input.offerId === 'string' ? input.offerId.trim() : '';
  const serviceId = typeof input.serviceId === 'string' ? input.serviceId.trim() : '';
  if (!offerId && !serviceId) {
    return;
  }

  pendingIntent = {
    offerId,
    serviceId,
    expiresAt:
      typeof input.expiresAt === 'string' && input.expiresAt.trim()
        ? input.expiresAt.trim()
        : null,
    receivedAt: Date.now(),
  };

  logIntent('[push-intent-set]', {
    hasOfferId: Boolean(offerId),
    hasServiceId: Boolean(serviceId),
    hasExpiresAt: Boolean(pendingIntent.expiresAt),
  });

  notifyPushIntentListeners();
}

export function peekPendingDispatchOfferIntent(): DispatchOfferIntent | null {
  return pendingIntent;
}

export function consumePendingDispatchOfferIntent(): DispatchOfferIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  if (intent) {
    logIntent('[push-intent-consume]', {
      hasOfferId: Boolean(intent.offerId),
      hasServiceId: Boolean(intent.serviceId),
    });
  }
  return intent;
}

export function clearPendingDispatchOfferIntent(): void {
  if (pendingIntent) {
    logIntent('[push-intent-clear]');
  }
  pendingIntent = null;
}

export function isDispatchOfferIntentExpired(intent: DispatchOfferIntent): boolean {
  if (!intent.expiresAt) return false;
  const expiresMs = Date.parse(intent.expiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return Date.now() >= expiresMs;
}
