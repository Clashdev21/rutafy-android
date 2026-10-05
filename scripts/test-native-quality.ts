/**
 * TOv2-B — native_quality del mismo fix, sin cambiar el punto.
 * Ejecutar: npm run test:native-quality
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { TRACKING_REQUEST_SOURCE } from '@/types/trackingRequestSource';
import { isValidUuid } from '@/utils/isValidUuid';
import {
  clearOperatorIngestion,
  ingestOperatorLocations,
} from '@/utils/operatorIngestionCoordinator';
import { mapTrackingPointPure } from '@/utils/trackingPointMapper';
import { readTemporalProvenance } from '@/utils/temporalProvenance';
import { verifyNativeQualityPatch } from './verify-native-quality-patch.js';

const SESSION_STARTED = Date.parse('2026-10-03T18:00:00.000Z');
const NOW = Date.parse('2026-10-03T18:10:00.000Z');
const ELAPSED = '12345678901234567890';

function loc(extra: Record<string, unknown> = {}) {
  return {
    coords: {
      latitude: 4.6512,
      longitude: -74.0834,
      accuracy: 6.5,
      speed: 0,
      heading: 12,
    },
    timestamp: SESSION_STARTED + 8_000,
    ...extra,
  };
}

function map(location: object, metadata?: Record<string, unknown>) {
  const result = mapTrackingPointPure(location, 'background', metadata, {
    sessionStartedAtMs: SESSION_STARTED,
    nowMs: NOW,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('expected mapped point');
  return result.point;
}

const SESSION = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  clearOperatorIngestion();
});

describe('TOv2-B native_quality', () => {
  it('speed 0 con hasSpeed true conserva speed_mps y has_speed true', () => {
    const point = map(loc({ hasSpeed: true, hasAccuracy: true, hasBearing: false }));
    assert.equal(point.speed_mps, 0);
    assert.equal(point.metadata?.native_quality?.has_speed, true);
    assert.equal(point.metadata?.native_quality?.has_accuracy, true);
    assert.equal(point.metadata?.native_quality?.has_bearing, false);
  });

  it('speed 0 con hasSpeed false conserva speed_mps y has_speed false', () => {
    const point = map(loc({ hasSpeed: false }));
    assert.equal(point.speed_mps, 0);
    assert.equal(point.metadata?.native_quality?.has_speed, false);
  });

  it('sin campos nativos el punto sigue válido y la calidad queda en null', () => {
    const point = map(loc());
    const quality = point.metadata?.native_quality;
    assert.equal(point.lat, 4.6512);
    assert.equal(point.lng, -74.0834);
    assert.equal(quality?.native_quality_version, 1);
    assert.equal(quality?.has_accuracy, null);
    assert.equal(quality?.has_speed, null);
    assert.equal(quality?.speed_accuracy_mps, null);
    assert.equal(quality?.has_bearing, null);
    assert.equal(quality?.bearing_accuracy_deg, null);
    assert.equal(quality?.elapsed_realtime_nanos, null);
    assert.equal(quality?.mocked, null);
  });

  it('preserva speed accuracy finita y deja null si falta o no es finita', () => {
    const present = map(loc({ speedAccuracyMetersPerSecond: 1.25 }));
    const missing = map(loc());
    const bad = map(loc({ speedAccuracyMetersPerSecond: Number.POSITIVE_INFINITY }));
    assert.equal(present.metadata?.native_quality?.speed_accuracy_mps, 1.25);
    assert.equal(missing.metadata?.native_quality?.speed_accuracy_mps, null);
    assert.equal(bad.metadata?.native_quality?.speed_accuracy_mps, null);
  });

  it('preserva bearing accuracy finita', () => {
    const point = map(loc({ bearingAccuracyDegrees: 8.5 }));
    assert.equal(point.metadata?.native_quality?.bearing_accuracy_deg, 8.5);
  });

  it('conserva elapsedRealtimeNanos como string decimal exacto', () => {
    const point = map(loc({ elapsedRealtimeNanos: ELAPSED }));
    const value = point.metadata?.native_quality?.elapsed_realtime_nanos;
    assert.equal(typeof value, 'string');
    assert.equal(value, ELAPSED);
    assert.notEqual(value, String(Number(ELAPSED)));
  });

  it('preserva mocked true y false, y null si falta', () => {
    assert.equal(map(loc({ mocked: true })).metadata?.native_quality?.mocked, true);
    assert.equal(map(loc({ mocked: false })).metadata?.native_quality?.mocked, false);
    assert.equal(map(loc()).metadata?.native_quality?.mocked, null);
  });

  it('conserva request_source, temporal, versión 1, coordenadas, speed y fix_id', async () => {
    const plain = loc();
    const labeled = map(
      {
        ...plain,
        hasSpeed: true,
        speedAccuracyMetersPerSecond: 0.4,
        elapsedRealtimeNanos: ELAPSED,
        mocked: false,
      },
      {
        source: 'android_background',
        request_source: TRACKING_REQUEST_SOURCE.operatorBackgroundHigh,
      },
    );
    const historical = map(plain, {
      source: 'android_background',
      request_source: TRACKING_REQUEST_SOURCE.operatorBackgroundHigh,
    });
    const foreground = map(plain, {
      source: 'android_mvp',
      request_source: TRACKING_REQUEST_SOURCE.operatorForegroundBalanced,
    });

    assert.equal(labeled.metadata?.request_source, 'operator_background_high');
    assert.equal(foreground.metadata?.request_source, 'operator_foreground_balanced');
    assert.equal(Object.hasOwn(labeled.metadata?.temporal ?? {}, 'native_quality'), false);
    assert.equal(Object.hasOwn(labeled.metadata?.temporal ?? {}, 'request_source'), false);
    assert.equal(labeled.metadata?.native_quality?.native_quality_version, 1);
    assert.notEqual(labeled.metadata?.tracking_telemetry_version, 2);

    const ingested = await ingestOperatorLocations({
      sessionId: SESSION,
      locations: [
        {
          ...plain,
          hasSpeed: true,
          elapsedRealtimeNanos: ELAPSED,
          mocked: true,
        },
      ],
      channel: 'background',
      metadata: {
        source: 'android_background',
        request_source: TRACKING_REQUEST_SOURCE.operatorBackgroundHigh,
      },
      sessionStartedAtMs: SESSION_STARTED,
      nowMs: NOW,
    });
    assert.equal(ingested.points.length, 1);
    assert.equal(ingested.points[0].metadata?.tracking_telemetry_version, 1);
    assert.equal(ingested.points[0].metadata?.request_source, 'operator_background_high');
    assert.equal(ingested.points[0].metadata?.native_quality?.has_speed, true);
    assert.equal(ingested.points[0].metadata?.native_quality?.elapsed_realtime_nanos, ELAPSED);
    assert.equal(ingested.points[0].speed_mps, 0);
    assert.deepEqual(readTemporalProvenance(labeled), readTemporalProvenance(historical));
    assert.equal(labeled.lat, historical.lat);
    assert.equal(labeled.lng, historical.lng);
    assert.equal(labeled.accuracy_m, historical.accuracy_m);
    assert.equal(labeled.speed_mps, historical.speed_mps);
    assert.equal(labeled.heading, historical.heading);
    assert.equal(labeled.captured_at, historical.captured_at);
    assert.equal(isValidUuid(labeled.fix_id ?? ''), true);
    assert.equal(isValidUuid(historical.fix_id ?? ''), true);
    assert.notEqual(labeled.fix_id, ELAPSED);
  });
});

describe('TOv2-B patch guard', () => {
  const validSource = [
    'TOv2-B: native quality from the same android.location.Location',
    'location.hasAccuracy()',
    'location.hasSpeed()',
    'location.hasBearing()',
    'location.hasSpeedAccuracy()',
    'location.hasBearingAccuracy()',
    'location.elapsedRealtimeNanos.toString()',
    'putString("elapsedRealtimeNanos"',
    'putBoolean("hasSpeed"',
    'putBoolean("hasAccuracy"',
    'putBoolean("hasBearing"',
  ].join('\n');

  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      expoLocationVersion: '56.0.18',
      locationResultsSource: validSource,
      buildFromSource: ['expo-location'],
      ...overrides,
    };
  }

  it('acepta el contrato instalado esperado', () => {
    assert.equal(verifyNativeQualityPatch(validInput()).ok, true);
  });

  it('falla si la versión de expo-location cambia', () => {
    const result = verifyNativeQualityPatch(validInput({ expoLocationVersion: '56.0.19' }));
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /reviewed for the new expo-location version/);
  });

  it('falla si falta un marcador del parche', () => {
    const result = verifyNativeQualityPatch(
      validInput({ locationResultsSource: validSource.replace('location.hasSpeed()', '') }),
    );
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /missing native patch marker/);
  });

  it('falla si elapsedRealtimeNanos cruza como número', () => {
    const result = verifyNativeQualityPatch(
      validInput({
        locationResultsSource: `${validSource}\nputDouble("elapsedRealtimeNanos", value)`,
      }),
    );
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /unsafely/);
  });

  it('falla si buildFromSource no incluye expo-location', () => {
    const result = verifyNativeQualityPatch(validInput({ buildFromSource: [] }));
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /buildFromSource must include expo-location/);
  });
});
