import type { MapCoordinate } from '@/types/map';
import type { Service } from '@/types/service';

export function serviceOriginCoordinate(service: Service | null | undefined): MapCoordinate | null {
  if (!service) return null;
  const lat = service.origin_lat;
  const lng = service.origin_lng;
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

export function serviceDestinationCoordinate(
  service: Service | null | undefined,
): MapCoordinate | null {
  if (!service) return null;
  const lat = service.destination_lat;
  const lng = service.destination_lng;
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}
