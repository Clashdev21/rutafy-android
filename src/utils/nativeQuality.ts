/**
 * Calidad nativa del mismo android.location.Location que produjo el fix.
 * No es proveedor GPS/red/fused y no altera coordenadas ni speed_mps.
 */

export const NATIVE_QUALITY_VERSION = 1 as const;

export type NativeQualityV1 = {
  native_quality_version: typeof NATIVE_QUALITY_VERSION;
  has_accuracy: boolean | null;
  has_speed: boolean | null;
  speed_accuracy_mps: number | null;
  has_bearing: boolean | null;
  bearing_accuracy_deg: number | null;
  elapsed_realtime_nanos: string | null;
  mocked: boolean | null;
};

type NativeQualitySource = {
  hasAccuracy?: unknown;
  hasSpeed?: unknown;
  speedAccuracyMetersPerSecond?: unknown;
  hasBearing?: unknown;
  bearingAccuracyDegrees?: unknown;
  elapsedRealtimeNanos?: unknown;
  mocked?: unknown;
};

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function decimalStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function readNativeQualityV1(location: object): NativeQualityV1 {
  const source = location as NativeQualitySource;
  return {
    native_quality_version: NATIVE_QUALITY_VERSION,
    has_accuracy: booleanOrNull(source.hasAccuracy),
    has_speed: booleanOrNull(source.hasSpeed),
    speed_accuracy_mps: finiteOrNull(source.speedAccuracyMetersPerSecond),
    has_bearing: booleanOrNull(source.hasBearing),
    bearing_accuracy_deg: finiteOrNull(source.bearingAccuracyDegrees),
    elapsed_realtime_nanos: decimalStringOrNull(source.elapsedRealtimeNanos),
    mocked: booleanOrNull(source.mocked),
  };
}
