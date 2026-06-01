const FRESH_MS = 30000;
const STALE_MS = 90000;

function parseIsoMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(String(iso));
  return Number.isFinite(ms) ? ms : null;
}

function ageMs(iso?: string | null, now = Date.now()): number | null {
  const ts = parseIsoMs(iso);
  if (ts == null) return null;
  return Math.max(0, now - ts);
}

export function isFresh(iso?: string | null, now = Date.now()): boolean {
  const age = ageMs(iso, now);
  if (age == null) return false;
  return age < FRESH_MS;
}

export function isStale(iso?: string | null, now = Date.now()): boolean {
  const age = ageMs(iso, now);
  if (age == null) return true;
  return age > STALE_MS;
}

export function minutesAgo(iso?: string | null, now = Date.now()): string | null {
  const age = ageMs(iso, now);
  if (age == null) return null;
  if (age < 60000) return 'hace 1 min';
  return `hace ${Math.floor(age / 60000)} min`;
}
