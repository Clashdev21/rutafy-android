import type { Service } from '@/types/service';

export function reorderOffersForIntent(
  services: Service[],
  offerIdByServiceId: Record<string, string>,
  offerId: string,
  serviceId: string,
): { services: Service[]; offerIdByServiceId: Record<string, string>; matched: boolean } {
  if (services.length === 0) {
    return { services, offerIdByServiceId, matched: false };
  }

  let idx = -1;
  if (offerId) {
    idx = services.findIndex((s) => offerIdByServiceId[s.service_id] === offerId);
  }
  if (idx < 0 && serviceId) {
    idx = services.findIndex((s) => s.service_id === serviceId);
  }

  if (idx < 0) {
    return { services, offerIdByServiceId, matched: false };
  }
  if (idx === 0) {
    return { services, offerIdByServiceId, matched: true };
  }

  const reordered = [...services];
  const [match] = reordered.splice(idx, 1);
  reordered.unshift(match);
  return { services: reordered, offerIdByServiceId, matched: true };
}
