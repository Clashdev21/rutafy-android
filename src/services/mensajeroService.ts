import { apiClient } from '@/api/client';
import { MESSENGER_ENDPOINTS, OFFER_ENDPOINTS, SERVICE_ENDPOINTS } from '@/api/endpoints';
import type { ActiveOffersResponse } from '@/types/offer';
import type { MyServicesResponse, Service } from '@/types/service';
import { extractOffersArray } from '@/utils/extractOffers';
import { mapOfferToService, normalizeServicesList } from '@/utils/normalizeService';

export type MappedOffersResult = {
  offers: ReturnType<typeof extractOffersArray>;
  services: Service[];
  offerIdByServiceId: Record<string, string>;
};

export async function fetchMyServices(actorId: string): Promise<Service[]> {
  const { data } = await apiClient.get<MyServicesResponse>(SERVICE_ENDPOINTS.my, {
    params: {
      actor_role: 'mensajero',
      actor_id: actorId,
    },
  });

  if (data?.error) {
    throw new Error(data.error);
  }

  return normalizeServicesList({ services: data.services ?? [] });
}

export async function fetchActiveOffers(messengerId: string): Promise<MappedOffersResult> {
  const { data } = await apiClient.get<ActiveOffersResponse>(
    MESSENGER_ENDPOINTS.activeOffers(messengerId),
  );

  const offers = extractOffersArray(data);
  const services: Service[] = [];
  const offerIdByServiceId: Record<string, string> = {};

  for (const offer of offers) {
    const mapped = mapOfferToService(offer);
    if (!mapped) continue;
    services.push(mapped);
    const offerId = String(offer.offer_id ?? offer.id ?? '').trim();
    if (offerId) offerIdByServiceId[mapped.service_id] = offerId;
  }

  return { offers, services, offerIdByServiceId };
}

export async function acceptOffer(offerId: string, messengerId: string) {
  const { data } = await apiClient.post(
    OFFER_ENDPOINTS.accept(offerId),
    { messenger_id: messengerId },
  );
  return data;
}

export async function patchAvailability(
  messengerId: string,
  availability_status: 'AVAILABLE' | 'OFFLINE',
) {
  const { data } = await apiClient.patch(
    MESSENGER_ENDPOINTS.availability(messengerId),
    { availability_status },
  );
  return data;
}

export type MessengerHeartbeatPayload = {
  lat?: number;
  lng?: number;
  availability_status?: 'AVAILABLE' | 'OFFLINE';
  battery_level?: number | null;
};

export async function postHeartbeat(payload: MessengerHeartbeatPayload) {
  const { data } = await apiClient.post(
    MESSENGER_ENDPOINTS.heartbeat,
    payload,
  );
  return data;
}

export type StartServicePayload = {
  actor_role: 'mensajero';
  actor_id: string;
};

export async function startService(serviceId: string, actorId: string) {
  const payload: StartServicePayload = {
    actor_role: 'mensajero',
    actor_id: actorId,
  };

  const { data } = await apiClient.post(SERVICE_ENDPOINTS.start(serviceId), payload);

  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: string }).error;
    if (err) throw new Error(err);
  }

  return data;
}

export type CloseServicePayload = {
  actor_role: 'mensajero';
  actor_id: string;
  messenger_id: string;
  close_pin: string;
};

export async function closeService(serviceId: string, payload: CloseServicePayload) {
  const { data } = await apiClient.post(
    SERVICE_ENDPOINTS.close(serviceId),
    payload,
  );

  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: string }).error;
    if (err) throw new Error(err);
  }

  return data;
}
