import type { DispatchOfferLike } from '@/types/offer';
import type { Service, ServiceStatus } from '@/types/service';

function pickStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function pickNum(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatRouteEndpoint(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const label =
      pickStr(rec.label) ??
      pickStr(rec.name) ??
      pickStr(rec.address_text) ??
      pickStr(rec.address);
    const sub = pickStr(rec.sub_location);
    if (label && sub) return `${label} · ${sub}`;
    if (label) return label;
  }
  return fallback;
}

/** Extrae lat/lng de un endpoint si el backend los envía (flat o nested). No inventa. */
function extractEndpointCoords(
  endpoint: unknown,
  flatLat: unknown,
  flatLng: unknown,
): { lat: number | null; lng: number | null } {
  const fromFlatLat = pickNum(flatLat);
  const fromFlatLng = pickNum(flatLng);
  if (fromFlatLat != null && fromFlatLng != null) {
    return { lat: fromFlatLat, lng: fromFlatLng };
  }

  if (endpoint && typeof endpoint === 'object' && !Array.isArray(endpoint)) {
    const rec = endpoint as Record<string, unknown>;
    const lat =
      pickNum(rec.lat) ??
      pickNum(rec.latitude) ??
      pickNum(rec.map_lat) ??
      pickNum(rec.mapLat);
    const lng =
      pickNum(rec.lng) ??
      pickNum(rec.longitude) ??
      pickNum(rec.map_lng) ??
      pickNum(rec.mapLng);
    if (lat != null && lng != null) return { lat, lng };
  }

  return { lat: null, lng: null };
}

function normalizeStatus(raw: unknown): ServiceStatus {
  const s = String(raw ?? 'REQUESTED').trim().toUpperCase();
  return s as ServiceStatus;
}

function extractMessengerRaw(row: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = [row.assigned_messenger, row.messenger, row.mensajero];
  for (const value of candidates) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

export function normalizeServiceRow(raw: unknown): Service | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const service_id = pickStr(row.service_id) ?? pickStr(row.id);
  if (!service_id) return null;

  const status = normalizeStatus(row.status);
  const service_code =
    pickStr(row.service_code) ??
    pickStr(row.serviceCode) ??
    pickStr(row.code) ??
    `RTF-${service_id.slice(0, 6).toUpperCase()}`;

  const request_mode =
    String(row.request_mode ?? 'NOW').toUpperCase() === 'SCHEDULED' ? 'SCHEDULED' : 'NOW';

  const messenger = extractMessengerRaw(row);
  const messenger_lat =
    pickNum(messenger?.current_lat) ??
    pickNum(messenger?.currentLat) ??
    pickNum(messenger?.lat) ??
    pickNum(messenger?.map_lat) ??
    pickNum(messenger?.mapLat);
  const messenger_lng =
    pickNum(messenger?.current_lng) ??
    pickNum(messenger?.currentLng) ??
    pickNum(messenger?.lng) ??
    pickNum(messenger?.map_lng) ??
    pickNum(messenger?.mapLng);
  const messenger_location_updated_at =
    pickStr(messenger?.location_updated_at) ??
    pickStr(messenger?.locationUpdatedAt) ??
    pickStr(row.messenger_location_updated_at) ??
    pickStr(row.location_updated_at) ??
    pickStr(row.locationUpdatedAt);

  const originCoords = extractEndpointCoords(
    row.origin,
    row.origin_lat ?? row.originLat ?? row.pickup_lat ?? row.pickupLat,
    row.origin_lng ?? row.originLng ?? row.pickup_lng ?? row.pickupLng,
  );
  const destinationCoords = extractEndpointCoords(
    row.destination,
    row.destination_lat ?? row.destinationLat ?? row.delivery_lat ?? row.deliveryLat,
    row.destination_lng ?? row.destinationLng ?? row.delivery_lng ?? row.deliveryLng,
  );

  return {
    service_id,
    status,
    service_type: pickStr(row.service_type) ?? 'DOCS',
    requester_company_id: pickStr(row.requester_company_id) ?? '',
    mensajero_id: pickStr(row.mensajero_id),
    origin: formatRouteEndpoint(row.origin, 'Origen no definido'),
    destination: formatRouteEndpoint(row.destination, 'Destino no definido'),
    service_code,
    request_mode,
    scheduled_for: pickStr(row.scheduled_for),
    created_at: pickStr(row.created_at) ?? pickStr(row.createdAt) ?? undefined,
    updated_at: pickStr(row.updated_at) ?? pickStr(row.updatedAt) ?? undefined,
    expires_at: pickStr(row.expires_at),
    estimated_route_distance_km: pickNum(row.estimated_route_distance_km),
    estimated_route_duration_minutes: pickNum(row.estimated_route_duration_minutes),
    eta_pickup_at: pickStr(row.eta_pickup_at),
    eta_delivery_at: pickStr(row.eta_delivery_at),
    messenger_location_updated_at,
    messenger_lat,
    messenger_lng,
    origin_lat: originCoords.lat,
    origin_lng: originCoords.lng,
    destination_lat: destinationCoords.lat,
    destination_lng: destinationCoords.lng,
    meta: row.meta && typeof row.meta === 'object' ? (row.meta as Record<string, unknown>) : null,
  };
}

export function normalizeServicesList(raw: unknown): Service[] {
  if (!raw || typeof raw !== 'object') return [];
  const payload = raw as Record<string, unknown>;
  const rows = Array.isArray(payload.services)
    ? payload.services
    : Array.isArray(payload.data)
      ? payload.data
      : [];
  return rows.map(normalizeServiceRow).filter((s): s is Service => s !== null);
}

const OFFER_ORIGIN_KEYS = [
  'origin',
  'origin_node_name',
  'origin_label',
  'pickup_address',
  'from',
] as const;

const OFFER_DEST_KEYS = [
  'destination',
  'destination_node_name',
  'destination_label',
  'dropoff_address',
  'to',
] as const;

function pickFromObject(obj: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const v = pickStr(obj[key]);
    if (v) return v;
  }
  return null;
}

export function mapOfferToService(offer: DispatchOfferLike): Service | null {
  const nested =
    offer.service && typeof offer.service === 'object'
      ? (offer.service as Record<string, unknown>)
      : null;

  const service_id = pickStr(nested?.service_id) ?? pickStr(offer.service_id) ?? pickStr(offer.serviceId);
  if (!service_id) return null;

  const offerRec = offer as Record<string, unknown>;
  const originRaw = nested?.origin ?? offerRec.origin;
  const destRaw = nested?.destination ?? offerRec.destination;
  const meta =
    nested?.meta && typeof nested.meta === 'object'
      ? (nested.meta as Record<string, unknown>)
      : offer.meta && typeof offer.meta === 'object'
        ? offer.meta
        : null;

  const origin =
    formatRouteEndpoint(originRaw, '') ||
    pickFromObject(offerRec, OFFER_ORIGIN_KEYS) ||
    pickFromObject(meta, OFFER_ORIGIN_KEYS) ||
    'Origen no definido';

  const destination =
    formatRouteEndpoint(destRaw, '') ||
    pickFromObject(offerRec, OFFER_DEST_KEYS) ||
    pickFromObject(meta, OFFER_DEST_KEYS) ||
    'Destino no definido';

  const originCoords = extractEndpointCoords(
    originRaw,
    nested?.origin_lat ?? offerRec.origin_lat ?? meta?.origin_lat,
    nested?.origin_lng ?? offerRec.origin_lng ?? meta?.origin_lng,
  );
  const destinationCoords = extractEndpointCoords(
    destRaw,
    nested?.destination_lat ?? offerRec.destination_lat ?? meta?.destination_lat,
    nested?.destination_lng ?? offerRec.destination_lng ?? meta?.destination_lng,
  );

  return {
    service_id,
    status: normalizeStatus(nested?.status ?? offer.status ?? 'REQUESTED'),
    service_type: pickStr(nested?.service_type) ?? pickStr(offer.service_type) ?? 'DOCS',
    requester_company_id:
      pickStr(nested?.requester_company_id) ?? pickStr(offer.requester_company_id) ?? '',
    mensajero_id: pickStr(nested?.mensajero_id) ?? pickStr(offer.mensajero_id),
    origin,
    destination,
    service_code: `RTF-${service_id.slice(0, 6).toUpperCase()}`,
    request_mode: 'NOW',
    expires_at: pickStr(nested?.expires_at) ?? pickStr(offer.expires_at),
    estimated_route_distance_km: pickNum(nested?.estimated_route_distance_km),
    estimated_route_duration_minutes: pickNum(nested?.estimated_route_duration_minutes),
    origin_lat: originCoords.lat,
    origin_lng: originCoords.lng,
    destination_lat: destinationCoords.lat,
    destination_lng: destinationCoords.lng,
    meta,
  };
}

export function buildOfferIdMap(
  offers: DispatchOfferLike[],
  mapped: Service[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    const service = mapped[i];
    if (!service) continue;
    const offerId = pickStr(offer.offer_id) ?? pickStr(offer.id);
    if (offerId) map[service.service_id] = offerId;
  }
  return map;
}
