import type { SpeedQuality, SpeedQualityReason } from '@/types/speedQuality';

/** Fuente de velocidad observada (telemetría local; no se envía al backend en 2A). */
export type SpeedTelemetrySource = 'native' | 'derived' | 'unavailable';

/** Muestra de telemetría de velocidad (diagnóstico / preparación 2B). */
export type SpeedTelemetrySample = {
  speedNativeMps: number | null;
  speedNativeKmh: number | null;
  speedDerivedKmh: number | null;
  speedSource: SpeedTelemetrySource;
  accuracyM: number | null;
  heading: number | null;
  distanceFromPreviousM: number | null;
  deltaTimeMs: number | null;
  quality?: SpeedQuality | null;
  qualityReason?: SpeedQualityReason | null;
  combinedAccuracyM?: number | null;
  displacementQualityRatio?: number | null;
  /** Reservado Speed 2B — no usado en 2A */
  mapSpeedKmh?: number | null;
  filteredSpeedKmh?: number | null;
  speedConfidence?: number | null;
  motionState?: string | null;
};

export type SpeedTelemetryDerivedSample = {
  speedDerivedKmh: number;
  distanceFromPreviousM: number;
  deltaTimeMs: number;
  previousAccuracyM?: number | null;
  currentAccuracyM?: number | null;
  combinedAccuracyM?: number | null;
  displacementQualityRatio?: number | null;
  quality?: SpeedQuality | null;
  qualityReason?: SpeedQualityReason | null;
};

export type SpeedTelemetryPreviousFix = {
  sessionId: string;
  lat: number;
  lng: number;
  capturedAtMs: number;
  /** Accuracy del fix anterior (solo diagnóstico local). */
  accuracyM: number | null;
};

/** Contexto observacional separado del payload TrackingPointInput/backend. */
export type SpeedTelemetryObserveContext = {
  fixAgeMs?: number | null;
  mocked?: boolean | null;
  locationTimestampMs?: number | null;
};

export type NativeSpeedParseResult =
  | { ok: true; speedNativeMps: number; speedNativeKmh: number }
  | { ok: false; reason: 'native_null' | 'native_invalid' };

export type DerivedSpeedRejectReason =
  | 'no_previous'
  | 'session_changed'
  | 'invalid_coords'
  | 'invalid_timestamp'
  | 'invalid_delta_time'
  | 'invalid_distance'
  | 'invalid_result';

export type DerivedSpeedCalculateResult =
  | ({ ok: true } & SpeedTelemetryDerivedSample)
  | { ok: false; reason: DerivedSpeedRejectReason };
