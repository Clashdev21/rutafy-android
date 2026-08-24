/**
 * Contrato telemetría aditiva Android → backend (Tracking 3D.1).
 * Vive en metadata; NO altera speed_mps ni campos top-level legacy.
 */

import type {
  EffectiveSpeedConfidence,
  EffectiveSpeedDecision,
  EffectiveSpeedReason,
  EffectiveSpeedSource,
} from '@/types/effectiveSpeed';
import type { MotionState, MotionStateReason } from '@/types/motionState';

/** Versión del contrato de telemetría en metadata. */
export const TRACKING_TELEMETRY_VERSION = 1;

/**
 * Snapshot asociado a un fix concreto (post fusion + motion state).
 * Unidades: effectiveSpeedKmh en km/h; speed_mps del punto permanece en m/s.
 */
export type TrackingEnrichedTelemetry = {
  effectiveSpeedKmh: number | null;
  effectiveSpeedSource: EffectiveSpeedSource;
  effectiveSpeedConfidence: EffectiveSpeedConfidence | null;
  effectiveSpeedReason: EffectiveSpeedReason;
  motionState: MotionState;
  motionStateReason: MotionStateReason | null;
};

export type TrackingTelemetryMetadataFields = {
  tracking_telemetry_version: typeof TRACKING_TELEMETRY_VERSION;
  effective_speed_kmh: number | null;
  effective_speed_source: EffectiveSpeedSource;
  effective_speed_confidence: EffectiveSpeedConfidence | null;
  effective_speed_reason: EffectiveSpeedReason;
  motion_state: MotionState;
  motion_state_reason: MotionStateReason | null;
};

export function telemetryFromDecisions(
  effectiveSpeed: EffectiveSpeedDecision,
  motionState: MotionState,
  motionStateReason: MotionStateReason | null = null,
): TrackingEnrichedTelemetry {
  const unavailable = effectiveSpeed.source === 'unavailable';
  const kmh =
    !unavailable &&
    typeof effectiveSpeed.speedKmh === 'number' &&
    Number.isFinite(effectiveSpeed.speedKmh)
      ? effectiveSpeed.speedKmh
      : null;

  return {
    effectiveSpeedKmh: kmh,
    effectiveSpeedSource: effectiveSpeed.source,
    effectiveSpeedConfidence: unavailable ? null : effectiveSpeed.confidence,
    effectiveSpeedReason: effectiveSpeed.reason,
    motionState,
    motionStateReason,
  };
}
