/**
 * Speed Fusion v1 — decisión pura effectiveSpeed (Tracking 3B).
 * Sin I/O, sin React, sin recalcular Quality Gate.
 */

import type {
  EffectiveSpeedConfidence,
  EffectiveSpeedDecision,
  EffectiveSpeedReason,
  FuseEffectiveSpeedInput,
} from '@/types/effectiveSpeed';
import {
  MAX_PLAUSIBLE_ROAD_SPEED_KMH,
  NATIVE_ZERO_MOVING_MIN_DERIVED_KMH,
} from '@/types/speedQuality';
import {
  SPEED_DISAGREEMENT_HIGH_KMH,
  SPEED_DISAGREEMENT_LOW_KMH,
} from '@/utils/effectiveSpeedThresholds';

function isPlausibleSpeedKmh(kmh: number): boolean {
  return Number.isFinite(kmh) && kmh >= 0 && kmh <= MAX_PLAUSIBLE_ROAD_SPEED_KMH;
}

function unavailable(
  reason: EffectiveSpeedReason,
  input: FuseEffectiveSpeedInput,
): EffectiveSpeedDecision {
  return {
    speedKmh: null,
    source: 'unavailable',
    confidence: null,
    reason,
    nativeSpeedKmh: input.nativeAvailable ? input.nativeSpeedKmh : null,
    derivedSpeedKmh: input.derivedSpeedKmh,
    derivedQuality: input.derivedQuality,
    disagreementKmh: null,
  };
}

function available(
  speedKmh: number,
  source: 'native' | 'derived',
  confidence: EffectiveSpeedConfidence,
  reason: EffectiveSpeedReason,
  input: FuseEffectiveSpeedInput,
  disagreementKmh: number | null = null,
): EffectiveSpeedDecision {
  return {
    speedKmh,
    source,
    confidence,
    reason,
    nativeSpeedKmh: input.nativeAvailable ? input.nativeSpeedKmh : null,
    derivedSpeedKmh: input.derivedSpeedKmh,
    derivedQuality: input.derivedQuality,
    disagreementKmh,
  };
}

function derivedGoodAndPlausible(input: FuseEffectiveSpeedInput): boolean {
  return (
    input.derivedQuality === 'good' &&
    input.derivedSpeedKmh != null &&
    isPlausibleSpeedKmh(input.derivedSpeedKmh)
  );
}

function nativePositivePlausible(input: FuseEffectiveSpeedInput): boolean {
  return (
    input.nativeAvailable &&
    input.nativeSpeedKmh != null &&
    Number.isFinite(input.nativeSpeedKmh) &&
    input.nativeSpeedKmh > 0 &&
    isPlausibleSpeedKmh(input.nativeSpeedKmh)
  );
}

function nativeImplausible(input: FuseEffectiveSpeedInput): boolean {
  return (
    input.nativeAvailable &&
    input.nativeSpeedKmh != null &&
    Number.isFinite(input.nativeSpeedKmh) &&
    input.nativeSpeedKmh > MAX_PLAUSIBLE_ROAD_SPEED_KMH
  );
}

function nativeZero(input: FuseEffectiveSpeedInput): boolean {
  return input.nativeAvailable && input.nativeSpeedKmh === 0;
}

/**
 * Fusiona native + derived (post Quality Gate) en effectiveSpeed diagnóstico.
 */
export function fuseEffectiveSpeed(input: FuseEffectiveSpeedInput): EffectiveSpeedDecision {
  const derivedGood = derivedGoodAndPlausible(input);

  if (nativeImplausible(input)) {
    if (derivedGood && input.derivedSpeedKmh != null) {
      return available(
        input.derivedSpeedKmh,
        'derived',
        'medium',
        'native_implausible_derived_used',
        input,
      );
    }
    if (input.derivedQuality === 'rejected') {
      return unavailable('derived_rejected', input);
    }
    return unavailable('insufficient_evidence', input);
  }

  if (nativePositivePlausible(input) && input.nativeSpeedKmh != null) {
    if (derivedGood && input.derivedSpeedKmh != null) {
      const disagreementKmh = Math.abs(input.nativeSpeedKmh - input.derivedSpeedKmh);
      if (disagreementKmh <= SPEED_DISAGREEMENT_LOW_KMH) {
        return available(
          input.nativeSpeedKmh,
          'native',
          'high',
          'native_confirmed',
          input,
          disagreementKmh,
        );
      }
      if (disagreementKmh <= SPEED_DISAGREEMENT_HIGH_KMH) {
        return available(
          input.nativeSpeedKmh,
          'native',
          'medium',
          'native_derived_disagreement',
          input,
          disagreementKmh,
        );
      }
      return available(
        input.nativeSpeedKmh,
        'native',
        'low',
        'native_derived_disagreement',
        input,
        disagreementKmh,
      );
    }

    const confidence: EffectiveSpeedConfidence =
      input.derivedQuality === 'weak' ? 'medium' : 'high';
    return available(input.nativeSpeedKmh, 'native', confidence, 'native_only', input);
  }

  if (nativeZero(input)) {
    if (derivedGood && input.derivedSpeedKmh != null) {
      if (input.derivedSpeedKmh >= NATIVE_ZERO_MOVING_MIN_DERIVED_KMH) {
        return available(
          input.derivedSpeedKmh,
          'derived',
          'medium',
          'derived_recovery_native_zero',
          input,
        );
      }
      return unavailable('insufficient_evidence', input);
    }
    if (input.derivedQuality === 'weak') {
      return unavailable('derived_weak', input);
    }
    if (input.derivedQuality === 'rejected') {
      return unavailable('derived_rejected', input);
    }
    return unavailable('insufficient_evidence', input);
  }

  if (!input.nativeAvailable) {
    if (derivedGood && input.derivedSpeedKmh != null) {
      return available(input.derivedSpeedKmh, 'derived', 'medium', 'derived_only', input);
    }
    if (input.derivedQuality === 'weak') {
      return unavailable('derived_weak', input);
    }
    if (input.derivedQuality === 'rejected') {
      return unavailable('derived_rejected', input);
    }
    return unavailable('both_unavailable', input);
  }

  return unavailable('both_unavailable', input);
}
