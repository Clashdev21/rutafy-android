import type { Service } from '@/types/service';

/** Forma flexible devuelta por GET /v1/messengers/:id/offers/active */
export type DispatchOfferLike = {
  offer_id?: string;
  id?: string;
  service_id?: string;
  serviceId?: string;
  service?: Partial<Service> & Record<string, unknown>;
  status?: string;
  service_type?: string;
  requester_company_id?: string;
  mensajero_id?: string | null;
  origin?: unknown;
  destination?: unknown;
  expires_at?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type ActiveOffersResponse =
  | DispatchOfferLike[]
  | { offers?: DispatchOfferLike[]; data?: DispatchOfferLike[] | { offers?: DispatchOfferLike[] } }
  | { offer?: DispatchOfferLike };

export type AcceptOfferPayload = {
  messenger_id: string;
};
