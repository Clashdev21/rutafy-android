import type { DispatchOfferLike } from '@/types/offer';
import type { Service, ServiceStatus } from '@/types/service';

function pickStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
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

function normalizeStatus(raw: unknown): ServiceStatus {
  const s = String(raw ?? 'REQUESTED').trim().toUpperCase();
  return s as ServiceStatus;
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
