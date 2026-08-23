/**
 * Speed Fusion v1 (Tracking 3B) — señal diagnóstica effectiveSpeed.
 * NO altera speed_mps ni payload al backend.
 */

import type { SpeedQuality } from '@/types/speedQuality';

export type EffectiveSpeedSource = 'native' | 'derived' | 'unavailable';

export type EffectiveSpeedConfidence = 'high' | 'medium' | 'low';

export type EffectiveSpeedReason =
  | 'native_confirmed'
  | 'native_only'
  | 'native_derived_disagreement'
  | 'derived_recovery_native_zero'
  | 'derived_only'
  | 'native_implausible_derived_used'
  | 'insufficient_evidence'
  | 'derived_weak'
  | 'derived_rejected'
  | 'both_unavailable';

export type EffectiveSpeedDecision = {
  speedKmh: number | null;
  source: EffectiveSpeedSource;
  confidence: EffectiveSpeedConfidence | null;
  reason: EffectiveSpeedReason;

  nativeSpeedKmh: number | null;
  derivedSpeedKmh: number | null;
  derivedQuality: SpeedQuality | null;

  disagreementKmh: number | null;
};

export type FuseEffectiveSpeedInput = {
  nativeSpeedKmh: number | null;
  nativeAvailable: boolean;
  derivedSpeedKmh: number | null;
  derivedQuality: SpeedQuality | null;
};
