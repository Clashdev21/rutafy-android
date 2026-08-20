/**
 * Lógica pura Session Speed Statistics (2A.2.1).
 * Persistencia AsyncStorage vive en trackingDiagnostics.
 */

import type {
  SessionSpeedStatistics,
  SpeedStatCounters,
} from '@/types/sessionSpeedStatistics';
import { EMPTY_SPEED_STAT_COUNTERS } from '@/types/sessionSpeedStatistics';

export function createEmptySessionSpeedStatistics(
  sessionId: string,
  startedAt = new Date().toISOString(),
): SessionSpeedStatistics {
  return {
    ...EMPTY_SPEED_STAT_COUNTERS,
    sessionId,
    startedAt,
    endedAt: null,
  };
}

/**
 * ¿Hay que reiniciar el bucket?
 * Misma sessionId → continuar (restore).
 * SessionId distinta o ausente → bucket nuevo.
 */
export function shouldResetSessionSpeedBucket(
  existing: SessionSpeedStatistics | null,
  sessionId: string,
): boolean {
  if (!existing) return true;
  return existing.sessionId !== sessionId;
}

/**
 * Resuelve bucket al iniciar/restaurar sesión.
 * - misma sessionId: conserva contadores; limpia endedAt si se reabre
 * - distinta: crea desde cero
 */
export function resolveSessionSpeedBucket(
  existing: SessionSpeedStatistics | null,
  sessionId: string,
  startedAt?: string,
): { stats: SessionSpeedStatistics; reset: boolean } {
  if (!shouldResetSessionSpeedBucket(existing, sessionId) && existing) {
    return {
      stats: {
        ...existing,
        endedAt: null,
      },
      reset: false,
    };
  }
  return {
    stats: createEmptySessionSpeedStatistics(
      sessionId,
      startedAt ?? new Date().toISOString(),
    ),
    reset: true,
  };
}

export function markSessionSpeedEnded(
  stats: SessionSpeedStatistics,
  endedAt = new Date().toISOString(),
): SessionSpeedStatistics {
  return {
    ...stats,
    endedAt: stats.endedAt ?? endedAt,
  };
}

function incrementRunningAvg(
  prevAvg: number | null,
  count: number,
  value: number,
): number {
  if (count <= 1) return value;
  const base = prevAvg ?? value;
  return base + (value - base) / count;
}

/**
 * Aplica un evento speed-stat-* / speed-* normalizado a contadores.
 * Pure — usable por lifetime y session bucket.
 * Devuelve null si el evento no es de speed counters.
 */
export function applySpeedStatEventToCounters<T extends SpeedStatCounters>(
  type: string,
  stats: T,
  detail?: Record<string, unknown>,
): T | null {
  const next = { ...stats };

  switch (type) {
    case 'speed-native':
    case 'speed-stat-native': {
      const kmh =
        typeof detail?.speedNativeKmh === 'number' && Number.isFinite(detail.speedNativeKmh)
          ? detail.speedNativeKmh
          : null;
      if (kmh == null) return null;
      next.nativeSpeedSamples += 1;
      next.lastNativeSpeedKmh = kmh;
      next.maxNativeSpeedKmh =
        next.maxNativeSpeedKmh == null ? kmh : Math.max(next.maxNativeSpeedKmh, kmh);
      next.avgNativeAvailableSpeedKmh = incrementRunningAvg(
        next.avgNativeAvailableSpeedKmh,
        next.nativeSpeedSamples,
        kmh,
      );
      return next;
    }
    case 'speed-derived':
    case 'speed-stat-derived': {
      const kmh =
        typeof detail?.speedDerivedKmh === 'number' && Number.isFinite(detail.speedDerivedKmh)
          ? detail.speedDerivedKmh
          : null;
      if (kmh == null) return null;
      next.derivedSpeedSamples += 1;
      next.lastDerivedSpeedKmh = kmh;
      next.maxDerivedSpeedKmh =
        next.maxDerivedSpeedKmh == null ? kmh : Math.max(next.maxDerivedSpeedKmh, kmh);
      next.avgDerivedAvailableSpeedKmh = incrementRunningAvg(
        next.avgDerivedAvailableSpeedKmh,
        next.derivedSpeedSamples,
        kmh,
      );
      if (typeof detail?.displacementQualityRatio === 'number') {
        next.lastDisplacementQualityRatio = detail.displacementQualityRatio;
      }
      if (typeof detail?.combinedAccuracyM === 'number') {
        next.lastCombinedAccuracyM = detail.combinedAccuracyM;
      }
      return next;
    }
    case 'speed-unavailable':
    case 'speed-stat-unavailable': {
      const reason = typeof detail?.reason === 'string' ? detail.reason : '';
      if (reason === 'native_null' || reason === 'native_invalid') {
        next.nativeSpeedUnavailable += 1;
        return next;
      }
      if (reason.startsWith('derived_')) {
        next.derivedSpeedUnavailable += 1;
        return next;
      }
      return null;
    }
    case 'speed-sample-rejected':
    case 'speed-stat-rejected':
      next.rejectedSpeedSamples += 1;
      return next;
    case 'speed-stat-native-zero':
      next.nativeZeroSamples += 1;
      next.nativeZeroWhileMovingRate =
        next.nativeZeroSamples > 0
          ? next.nativeZeroWhileMoving / next.nativeZeroSamples
          : null;
      return next;
    case 'speed-stat-native-zero-moving':
      next.nativeZeroWhileMoving += 1;
      next.nativeZeroWhileMovingRate =
        next.nativeZeroSamples > 0
          ? next.nativeZeroWhileMoving / next.nativeZeroSamples
          : null;
      return next;
    case 'speed-stat-quality-good': {
      next.derivedGoodSamples += 1;
      const kmh =
        typeof detail?.speedDerivedKmh === 'number' && Number.isFinite(detail.speedDerivedKmh)
          ? detail.speedDerivedKmh
          : null;
      if (kmh != null) {
        next.maxGoodDerivedSpeedKmh =
          next.maxGoodDerivedSpeedKmh == null
            ? kmh
            : Math.max(next.maxGoodDerivedSpeedKmh, kmh);
        next.avgGoodDerivedSpeedKmh = incrementRunningAvg(
          next.avgGoodDerivedSpeedKmh,
          next.derivedGoodSamples,
          kmh,
        );
      }
      if (typeof detail?.displacementQualityRatio === 'number') {
        next.lastDisplacementQualityRatio = detail.displacementQualityRatio;
      }
      if (typeof detail?.combinedAccuracyM === 'number') {
        next.lastCombinedAccuracyM = detail.combinedAccuracyM;
      }
      return next;
    }
    case 'speed-stat-quality-weak':
      next.derivedWeakSamples += 1;
      return next;
    case 'speed-stat-quality-rejected':
      next.derivedRejectedSamples += 1;
      return next;
    case 'speed-stat-poor-accuracy':
      next.poorAccuracySamples += 1;
      return next;
    case 'speed-stat-long-gap':
      next.longGapSpeedSamples += 1;
      return next;
    case 'speed-stat-implausible':
      next.implausibleSpeedSamples += 1;
      return next;
    case 'speed-stat-fix-age': {
      const age =
        typeof detail?.fixAgeMs === 'number' && Number.isFinite(detail.fixAgeMs)
          ? detail.fixAgeMs
          : null;
      if (age == null) return null;
      next.lastFixAgeMs = age;
      next.maxFixAgeMs =
        next.maxFixAgeMs == null ? age : Math.max(next.maxFixAgeMs, age);
      if (detail?.stale === true) {
        next.staleFixSamples += 1;
      }
      return next;
    }
    case 'speed-stat-mocked':
      next.mockedFixes += 1;
      next.lastFixMocked = true;
      return next;
    default:
      return null;
  }
}
