/**
 * Contadores Speed observacionales (lifetime y por sesión).
 * Speed 2A.2.1 — bucket de sesión aislado para análisis de captura.
 */

export type SpeedStatCounters = {
  nativeSpeedSamples: number;
  derivedSpeedSamples: number;
  nativeSpeedUnavailable: number;
  derivedSpeedUnavailable: number;
  rejectedSpeedSamples: number;
  lastNativeSpeedKmh: number | null;
  lastDerivedSpeedKmh: number | null;
  maxNativeSpeedKmh: number | null;
  maxDerivedSpeedKmh: number | null;
  avgNativeAvailableSpeedKmh: number | null;
  avgDerivedAvailableSpeedKmh: number | null;
  nativeZeroSamples: number;
  nativeZeroWhileMoving: number;
  nativeZeroWhileMovingRate: number | null;
  derivedGoodSamples: number;
  derivedWeakSamples: number;
  derivedRejectedSamples: number;
  poorAccuracySamples: number;
  longGapSpeedSamples: number;
  implausibleSpeedSamples: number;
  staleFixSamples: number;
  mockedFixes: number;
  lastDisplacementQualityRatio: number | null;
  lastCombinedAccuracyM: number | null;
  lastFixAgeMs: number | null;
  lastFixMocked: boolean | null;
  maxFixAgeMs: number | null;
  avgGoodDerivedSpeedKmh: number | null;
  maxGoodDerivedSpeedKmh: number | null;

  effectiveSpeedSamples: number;
  effectiveSpeedUnavailable: number;
  effectiveNativeSamples: number;
  effectiveDerivedSamples: number;
  effectiveHighConfidence: number;
  effectiveMediumConfidence: number;
  effectiveLowConfidence: number;
  nativeZeroRecoveredByDerived: number;
  nativeImplausibleRejected: number;
  speedDisagreementSamples: number;
  lastEffectiveSpeedKmh: number | null;
  lastEffectiveSpeedSource: string | null;
  lastEffectiveSpeedConfidence: string | null;
  lastEffectiveSpeedReason: string | null;
  avgEffectiveSpeedKmh: number | null;
  maxEffectiveSpeedKmh: number | null;
  lastDisagreementKmh: number | null;
  maxDisagreementKmh: number | null;
  avgDisagreementKmh: number | null;
};

/** Stats Speed de la sesión activa o última finalizada (export post-cierre). */
export type SessionSpeedStatistics = SpeedStatCounters & {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
};

export const EMPTY_SPEED_STAT_COUNTERS: SpeedStatCounters = {
  nativeSpeedSamples: 0,
  derivedSpeedSamples: 0,
  nativeSpeedUnavailable: 0,
  derivedSpeedUnavailable: 0,
  rejectedSpeedSamples: 0,
  lastNativeSpeedKmh: null,
  lastDerivedSpeedKmh: null,
  maxNativeSpeedKmh: null,
  maxDerivedSpeedKmh: null,
  avgNativeAvailableSpeedKmh: null,
  avgDerivedAvailableSpeedKmh: null,
  nativeZeroSamples: 0,
  nativeZeroWhileMoving: 0,
  nativeZeroWhileMovingRate: null,
  derivedGoodSamples: 0,
  derivedWeakSamples: 0,
  derivedRejectedSamples: 0,
  poorAccuracySamples: 0,
  longGapSpeedSamples: 0,
  implausibleSpeedSamples: 0,
  staleFixSamples: 0,
  mockedFixes: 0,
  lastDisplacementQualityRatio: null,
  lastCombinedAccuracyM: null,
  lastFixAgeMs: null,
  lastFixMocked: null,
  maxFixAgeMs: null,
  avgGoodDerivedSpeedKmh: null,
  maxGoodDerivedSpeedKmh: null,
  effectiveSpeedSamples: 0,
  effectiveSpeedUnavailable: 0,
  effectiveNativeSamples: 0,
  effectiveDerivedSamples: 0,
  effectiveHighConfidence: 0,
  effectiveMediumConfidence: 0,
  effectiveLowConfidence: 0,
  nativeZeroRecoveredByDerived: 0,
  nativeImplausibleRejected: 0,
  speedDisagreementSamples: 0,
  lastEffectiveSpeedKmh: null,
  lastEffectiveSpeedSource: null,
  lastEffectiveSpeedConfidence: null,
  lastEffectiveSpeedReason: null,
  avgEffectiveSpeedKmh: null,
  maxEffectiveSpeedKmh: null,
  lastDisagreementKmh: null,
  maxDisagreementKmh: null,
  avgDisagreementKmh: null,
};
