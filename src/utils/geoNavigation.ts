export function parseValidGeoCoordinate(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } | null {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  return { lat, lng };
}

export function hasValidGeoCoordinate(lat: unknown, lng: unknown): boolean {
  return parseValidGeoCoordinate(lat, lng) != null;
}

/** URI geo: estándar. No depende de un SDK de mapas. */
export function buildGeoNavigationUri(lat: number, lng: number, label?: string): string {
  const trimmed = label?.trim();
  const query = trimmed
    ? `${lat},${lng}(${encodeURIComponent(trimmed)})`
    : `${lat},${lng}`;
  return `geo:${lat},${lng}?q=${query}`;
}
