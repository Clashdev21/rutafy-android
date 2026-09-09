import { isValidMapCoordinate, type MapCoordinate } from '../types/map';

export type MapRegionLike = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const URBAN_LAT_DELTA = 0.012;
const URBAN_LNG_DELTA = 0.012;

/** Fallback urbano genérico (Bogotá) si no hay GPS ni coords de servicio. */
export const FALLBACK_OPERATIONAL_MAP_REGION: MapRegionLike = {
  latitude: 4.711,
  longitude: -74.0721,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export function regionAround(coord: MapCoordinate): MapRegionLike {
  return {
    latitude: coord.latitude,
    longitude: coord.longitude,
    latitudeDelta: URBAN_LAT_DELTA,
    longitudeDelta: URBAN_LNG_DELTA,
  };
}

/** Región inicial segura para MapView Android (nunca undefined). */
export function resolveOperationalMapRegion(input: {
  messenger?: MapCoordinate | null;
  origin?: MapCoordinate | null;
  destination?: MapCoordinate | null;
}): MapRegionLike {
  if (isValidMapCoordinate(input.messenger)) return regionAround(input.messenger);
  if (isValidMapCoordinate(input.origin)) return regionAround(input.origin);
  if (isValidMapCoordinate(input.destination)) return regionAround(input.destination);
  return FALLBACK_OPERATIONAL_MAP_REGION;
}
