/** Coordenada UI-safe para mapa operacional (MAP 1A). */
export type MapCoordinate = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
};

export type OperationalMapMode =
  | 'offline'
  | 'available'
  | 'offer'
  | 'assigned'
  | 'in_service';

export function isValidMapCoordinate(
  value: MapCoordinate | null | undefined,
): value is MapCoordinate {
  if (!value) return false;
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}
