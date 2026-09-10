/** Colombia no aplica DST: America/Bogota = UTC−5 todo el año. */
export const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
export const BOGOTA_TIME_ZONE = 'America/Bogota';

export type BogotaYmd = {
  year: number;
  month: number;
  day: number;
};

export type BogotaDayRangeUtc = {
  from: string;
  to: string;
  ymd: BogotaYmd;
};

/**
 * Fecha calendario en Bogotá a partir de un instante UTC.
 * No usa setHours() del dispositivo.
 */
export function getBogotaCalendarYmd(now: Date = new Date()): BogotaYmd {
  const shifted = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Ventana UTC del día calendario Bogotá:
 * 00:00:00.000 −05:00 → YYYY-MM-DDT05:00:00.000Z
 * 23:59:59.999 −05:00 → (día siguiente)T04:59:59.999Z
 */
export function getBogotaDayRangeUtc(now: Date = new Date()): BogotaDayRangeUtc {
  const ymd = getBogotaCalendarYmd(now);
  const from = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 5, 0, 0, 0));
  const to = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + 1, 4, 59, 59, 999));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ymd,
  };
}

function capitalizeEs(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase('es-CO') + value.slice(1);
}

export function formatBogotaDateLong(now: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  return capitalizeEs(formatted);
}

export function formatBogotaDateTime(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatBogotaTime(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
