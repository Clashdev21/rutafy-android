/**
 * Clasificador puro de actividad inercial — Speed 2B.1.
 * Experimental / observacional. NO = STATIONARY/MOVING.
 */

import type {
  MotionActivityClassification,
  MotionActivityLevel,
} from '@/types/motionActivity';
import {
  MOTION_LOW_MAX_RMS_G,
  MOTION_MEDIUM_MAX_RMS_G,
} from '@/types/motionActivityThresholds';

export type MotionWindowMetrics = {
  dynamicAccelRmsG: number | null;
  p95DynamicAccelG?: number | null;
  peakDynamicAccelG?: number | null;
};

/**
 * Clasifica una ventana por RMS (primario).
 * p95 se menciona en reason si está disponible; no cambia el nivel salvo
 * que RMS sea inválido.
 */
export function classifyMotionActivity(
  metrics: MotionWindowMetrics,
): MotionActivityClassification {
  const rmsG =
    typeof metrics.dynamicAccelRmsG === 'number' && Number.isFinite(metrics.dynamicAccelRmsG)
      ? metrics.dynamicAccelRmsG
      : null;
  const p95G =
    typeof metrics.p95DynamicAccelG === 'number' && Number.isFinite(metrics.p95DynamicAccelG)
      ? metrics.p95DynamicAccelG
      : null;
  const peakG =
    typeof metrics.peakDynamicAccelG === 'number' && Number.isFinite(metrics.peakDynamicAccelG)
      ? metrics.peakDynamicAccelG
      : null;

  if (rmsG == null) {
    return {
      activityLevel: null,
      reason: 'invalid_rms',
      rmsG: null,
      p95G,
      peakG,
    };
  }

  let activityLevel: MotionActivityLevel;
  let reason: string;

  if (rmsG <= MOTION_LOW_MAX_RMS_G) {
    activityLevel = 'low';
    reason = `rms<=${MOTION_LOW_MAX_RMS_G}`;
  } else if (rmsG <= MOTION_MEDIUM_MAX_RMS_G) {
    activityLevel = 'medium';
    reason = `rms<=${MOTION_MEDIUM_MAX_RMS_G}`;
  } else {
    activityLevel = 'high';
    reason = `rms>${MOTION_MEDIUM_MAX_RMS_G}`;
  }

  if (p95G != null) {
    reason = `${reason};p95=${p95G.toFixed(4)}`;
  }

  return { activityLevel, reason, rmsG, p95G, peakG };
}

export function dominantActivityLevel(
  low: number,
  medium: number,
  high: number,
): MotionActivityLevel | null {
  const total = low + medium + high;
  if (total <= 0) return null;
  if (high >= medium && high >= low) return 'high';
  if (medium >= low) return 'medium';
  return 'low';
}
