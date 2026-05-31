import type { DispatchOfferLike } from '@/types/offer';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Misma lógica que portex-rutafy useMessengerOperationalState.extractOffersArray */
export function extractOffersArray(payload: unknown): DispatchOfferLike[] {
  if (Array.isArray(payload)) return payload as DispatchOfferLike[];
  if (isObject(payload) && Array.isArray(payload.offers)) {
    return payload.offers as DispatchOfferLike[];
  }
  if (
    isObject(payload) &&
    isObject(payload.data) &&
    Array.isArray((payload.data as Record<string, unknown>).offers)
  ) {
    return (payload.data as { offers: DispatchOfferLike[] }).offers;
  }
  if (isObject(payload) && Array.isArray(payload.data)) {
    return payload.data as DispatchOfferLike[];
  }
  if (isObject(payload) && payload.offer != null && typeof payload.offer === 'object') {
    return [payload.offer as DispatchOfferLike];
  }
  return [];
}
