/**
 * Agregador de ventanas Motion — Speed 2B.0 (experimental).
 *
 * Sample interval ≈ 100 ms (10 Hz)
 * Window duration ≈ 3000 ms (3 s)
 *
 * Solo agregados; no raw ilimitado.
 */

import { parseAccelSampleG } from '@/utils/motionTelemetry';

/** Intervalo deseado Accelerometer.setUpdateInterval — experimental. */
export const MOTION_SAMPLE_INTERVAL_MS = 100;

/** Duración de ventana de agregación — experimental. */
export const MOTION_WINDOW_DURATION_MS = 3000;

export type MotionWindowSummary = {
  sampleCount: number;
  validSampleCount: number;
  invalidSampleCount: number;
  meanMagnitudeG: number | null;
  dynamicAccelMeanG: number | null;
  dynamicAccelRmsG: number | null;
  peakDynamicAccelG: number | null;
  p95DynamicAccelG: number | null;
  windowStartedAt: string;
  windowEndedAt: string;
  midpointTimestamp: string;
};

type WindowAccum = {
  startedAtMs: number;
  sampleCount: number;
  validSampleCount: number;
  invalidSampleCount: number;
  sumMagnitudeG: number;
  sumDynamicG: number;
  sumDynamicSqG: number;
  peakDynamicG: number;
  /** Dinámicas válidas para p95 (acotado a ventana ~30 samples). */
  dynamics: number[];
};

function createAccum(startedAtMs: number): WindowAccum {
  return {
    startedAtMs,
    sampleCount: 0,
    validSampleCount: 0,
    invalidSampleCount: 0,
    sumMagnitudeG: 0,
    sumDynamicG: 0,
    sumDynamicSqG: 0,
    peakDynamicG: 0,
    dynamics: [],
  };
}

function percentileNearestRank(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx];
}

function finalizeWindow(accum: WindowAccum, endedAtMs: number): MotionWindowSummary {
  const n = accum.validSampleCount;
  const meanMagnitudeG = n > 0 ? accum.sumMagnitudeG / n : null;
  const dynamicAccelMeanG = n > 0 ? accum.sumDynamicG / n : null;
  const dynamicAccelRmsG = n > 0 ? Math.sqrt(accum.sumDynamicSqG / n) : null;
  const peakDynamicAccelG = n > 0 ? accum.peakDynamicG : null;
  const sorted = [...accum.dynamics].sort((a, b) => a - b);
  const p95DynamicAccelG = percentileNearestRank(sorted, 95);

  const windowStartedAt = new Date(accum.startedAtMs).toISOString();
  const windowEndedAt = new Date(endedAtMs).toISOString();
  const midpointTimestamp = new Date(
    Math.floor((accum.startedAtMs + endedAtMs) / 2),
  ).toISOString();

  return {
    sampleCount: accum.sampleCount,
    validSampleCount: accum.validSampleCount,
    invalidSampleCount: accum.invalidSampleCount,
    meanMagnitudeG,
    dynamicAccelMeanG,
    dynamicAccelRmsG,
    peakDynamicAccelG,
    p95DynamicAccelG,
    windowStartedAt,
    windowEndedAt,
    midpointTimestamp,
  };
}

/**
 * Agregador stateful puro (sin I/O).
 * Usar una instancia por sesión de captura de motion.
 */
export class MotionWindowAggregator {
  private accum: WindowAccum | null = null;
  private readonly windowDurationMs: number;

  constructor(windowDurationMs = MOTION_WINDOW_DURATION_MS) {
    this.windowDurationMs = windowDurationMs;
  }

  reset(): void {
    this.accum = null;
  }

  /**
   * Añade una muestra. Si la ventana cierra, devuelve el resumen.
   * Muestras inválidas se cuentan y no entran en métricas.
   */
  pushSample(
    x: unknown,
    y: unknown,
    z: unknown,
    nowMs = Date.now(),
  ): MotionWindowSummary | null {
    if (!this.accum) {
      this.accum = createAccum(nowMs);
    }

    const elapsed = nowMs - this.accum.startedAtMs;
    let closed: MotionWindowSummary | null = null;

    if (elapsed >= this.windowDurationMs) {
      closed = finalizeWindow(this.accum, nowMs);
      this.accum = createAccum(nowMs);
    }

    this.accum.sampleCount += 1;
    const parsed = parseAccelSampleG(x, y, z);
    if (!parsed.ok) {
      this.accum.invalidSampleCount += 1;
      return closed;
    }

    this.accum.validSampleCount += 1;
    this.accum.sumMagnitudeG += parsed.magnitudeG;
    this.accum.sumDynamicG += parsed.dynamicAccelG;
    this.accum.sumDynamicSqG += parsed.dynamicAccelG * parsed.dynamicAccelG;
    this.accum.peakDynamicG = Math.max(this.accum.peakDynamicG, parsed.dynamicAccelG);
    this.accum.dynamics.push(parsed.dynamicAccelG);

    return closed;
  }

  /** Fuerza cierre de ventana parcial (p.ej. al pausar/stop). */
  flush(nowMs = Date.now()): MotionWindowSummary | null {
    if (!this.accum || this.accum.sampleCount === 0) {
      this.accum = null;
      return null;
    }
    const summary = finalizeWindow(this.accum, nowMs);
    this.accum = null;
    return summary;
  }

  /** Ventana vacía explícita (tests / edge). */
  static emptyWindow(startedAtMs: number, endedAtMs: number): MotionWindowSummary {
    return finalizeWindow(createAccum(startedAtMs), endedAtMs);
  }
}
