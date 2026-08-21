/**
 * Matemática pura Motion Telemetry — Speed 2B.0.
 *
 * Expo Accelerometer entrega x,y,z en g (1 g ≈ 9.80665 m/s²).
 * NO integrar a → velocidad. NO calcular km/h.
 */

/** Gravedad estándar (documentación). Cálculos 2B.0 usan 1 g como referencia. */
export const STANDARD_GRAVITY_MPS2 = 9.80665;

export type AccelSampleG = {
  x: number;
  y: number;
  z: number;
};

export function isFiniteAccelSample(sample: AccelSampleG): boolean {
  return (
    Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.z)
  );
}

/** Magnitud del vector de aceleración en g. */
export function calculateMagnitudeG(x: number, y: number, z: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Aceleración dinámica orientacionalmente aproximada:
 * |magnitudeG − 1|. En reposo ideal ≈ 0.
 */
export function calculateDynamicAccelG(magnitudeG: number): number | null {
  if (!Number.isFinite(magnitudeG)) return null;
  return Math.abs(magnitudeG - 1);
}

export function parseAccelSampleG(
  x: unknown,
  y: unknown,
  z: unknown,
): { ok: true; x: number; y: number; z: number; magnitudeG: number; dynamicAccelG: number } | {
  ok: false;
  reason: 'invalid';
} {
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return { ok: false, reason: 'invalid' };
  }
  const magnitudeG = calculateMagnitudeG(x, y, z);
  if (magnitudeG == null) return { ok: false, reason: 'invalid' };
  const dynamicAccelG = calculateDynamicAccelG(magnitudeG);
  if (dynamicAccelG == null) return { ok: false, reason: 'invalid' };
  return { ok: true, x, y, z, magnitudeG, dynamicAccelG };
}
