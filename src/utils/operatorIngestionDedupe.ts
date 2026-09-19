/**
 * Fase A — deduplicación EXACTA acotada.
 *
 * Clave lógica: sessionId|captured_at|lat|lng
 *
 * La normalización de coordenadas es canónica y exacta: se usa la
 * representación decimal round-trip del double (String(value)). No hay ventana
 * de tolerancia ni redondeo, por lo que dos lecturas distintas nunca colapsan.
 * Esto NO es dedupe aproximado.
 */

/** Capacidad dentro del rango aprobado 512–1024. */
export const OPERATOR_DEDUPE_CAPACITY = 768;

function normalizeCoord(value: number): string {
  // String() de un double es round-trip exacto en JS: no pierde información.
  return Number.isFinite(value) ? String(value) : 'nan';
}

export function buildOperatorExactDedupeKey(input: {
  sessionId: string;
  capturedAt: string;
  lat: number;
  lng: number;
}): string {
  return [
    input.sessionId,
    input.capturedAt,
    normalizeCoord(input.lat),
    normalizeCoord(input.lng),
  ].join('|');
}

/**
 * Set para búsqueda O(1) + cola FIFO para expiración determinista.
 * Al superar la capacidad se retira la clave más antigua.
 */
export class BoundedExactDedupe {
  private readonly keys = new Set<string>();
  private readonly order: string[] = [];
  readonly capacity: number;

  constructor(capacity: number = OPERATOR_DEDUPE_CAPACITY) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  has(key: string): boolean {
    return this.keys.has(key);
  }

  /** true si la clave era nueva; false si ya existía (duplicado exacto). */
  add(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.order.push(key);
    while (this.order.length > this.capacity) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.keys.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.keys.size;
  }

  /** Solo para diagnóstico/tests: clave más antigua retenida. */
  peekOldest(): string | null {
    return this.order.length ? this.order[0] : null;
  }

  clear(): void {
    this.keys.clear();
    this.order.length = 0;
  }
}
