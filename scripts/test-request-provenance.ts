/**
 * TOv2-A — request_source de la suscripción Rutafy.
 * Ejecutar: npm run test:request-provenance
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';

import { OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS } from '@/services/operatorTrackingService';
import { TRACKING_REQUEST_SOURCE } from '@/types/trackingRequestSource';
import type { TrackingPointInput } from '@/types/tracking';
import {
  clearOperatorIngestion,
  ingestOperatorLocations,
} from '@/utils/operatorIngestionCoordinator';
import {
  resetOperatorBackgroundOwnership,
  setOperatorBackgroundOwnership,
} from '@/utils/operatorIngestionOwnership';
import { readTemporalProvenance } from '@/utils/temporalProvenance';
import { mapTrackingPointPure } from '@/utils/trackingPointMapper';
import { isLegacyTrackingPointShape } from '@/utils/trackingTelemetryEnrichment';
import * as Location from 'expo-location';

const SESSION = '22222222-2222-4222-8222-222222222222';
const SESSION_STARTED = Date.parse('2026-10-03T18:00:00.000Z');
const NOW = Date.parse('2026-10-03T18:10:00.000Z');

function loc(atMs: number) {
  return {
    coords: {
      latitude: 4.6512,
      longitude: -74.0834,
      accuracy: 6.5,
      speed: 3.25,
      heading: 12,
    },
    timestamp: atMs,
  };
}

function temporalKeys(point: TrackingPointInput): string[] {
  const temporal = readTemporalProvenance(point);
  assert.ok(temporal);
  return Object.keys(temporal);
}

beforeEach(() => {
  clearOperatorIngestion();
  resetOperatorBackgroundOwnership();
});

describe('TOv2-A request_source', () => {
  it('A. el background High declara operator_background_high fuera de temporal', async () => {
    const result = await ingestOperatorLocations({
      sessionId: SESSION,
      locations: [loc(SESSION_STARTED + 8_000)],
      channel: 'background',
      metadata: {
        source: 'android_background',
        request_source: TRACKING_REQUEST_SOURCE.operatorBackgroundHigh,
      },
      sessionStartedAtMs: SESSION_STARTED,
      nowMs: NOW,
    });

    assert.equal(result.role, 'authoritative');
    assert.equal(result.points.length, 1);
    const point = result.points[0];
    assert.equal(point.metadata?.source, 'android_background');
    assert.equal(point.metadata?.request_source, 'operator_background_high');
    assert.equal(temporalKeys(point).includes('request_source'), false);
    assert.equal(point.metadata?.tracking_telemetry_version, 1);
    assert.equal(point.lat, 4.6512);
    assert.equal(point.lng, -74.0834);
    assert.equal(point.accuracy_m, 6.5);
    assert.equal(point.speed_mps, 3.25);
    assert.equal(point.heading, 12);
    const temporal = readTemporalProvenance(point);
    assert.equal(temporal?.measurement_timestamp_source, 'NATIVE_LOCATION_TIMESTAMP');
    assert.equal(temporal?.measurement_at, point.captured_at);
    assert.equal(temporal?.callback_size, 1);
    assert.equal(temporal?.callback_index, 0);
  });

  it('B. el foreground Balanced declara operator_foreground_balanced cuando es autoritativo', async () => {
    const result = await ingestOperatorLocations({
      sessionId: SESSION,
      locations: [loc(SESSION_STARTED + 9_000)],
      channel: 'foreground',
      metadata: {
        source: 'android_mvp',
        request_source: TRACKING_REQUEST_SOURCE.operatorForegroundBalanced,
      },
      sessionStartedAtMs: SESSION_STARTED,
      nowMs: NOW,
    });

    assert.equal(result.role, 'authoritative');
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0].metadata?.request_source, 'operator_foreground_balanced');
    assert.equal(result.points[0].metadata?.source, 'android_mvp');
    assert.equal(temporalKeys(result.points[0]).includes('request_source'), false);
  });

  it('el foreground no entra al lote autoritativo cuando el background ya es dueño', async () => {
    setOperatorBackgroundOwnership(true);
    const result = await ingestOperatorLocations({
      sessionId: SESSION,
      locations: [loc(SESSION_STARTED + 10_000)],
      channel: 'foreground',
      metadata: {
        source: 'android_mvp',
        request_source: TRACKING_REQUEST_SOURCE.operatorForegroundBalanced,
      },
      sessionStartedAtMs: SESSION_STARTED,
      nowMs: NOW,
    });

    assert.equal(result.role, 'observe');
    assert.equal(result.points.length, 0);
    assert.equal(result.observed.length, 1);
    assert.equal(
      result.observed[0]?.metadata?.request_source,
      'operator_foreground_balanced',
    );
  });

  it('F/G. request_source no altera el fix y un punto sin ella sigue siendo válido', () => {
    const atMs = SESSION_STARTED + 11_000;
    const context = { sessionStartedAtMs: SESSION_STARTED, nowMs: NOW };
    const labeled = mapTrackingPointPure(
      loc(atMs),
      'background',
      {
        source: 'android_background',
        request_source: TRACKING_REQUEST_SOURCE.operatorBackgroundHigh,
      },
      context,
    );
    const historical = mapTrackingPointPure(
      loc(atMs),
      'background',
      { source: 'android_background' },
      context,
    );

    assert.equal(labeled.ok, true);
    assert.equal(historical.ok, true);
    if (!labeled.ok || !historical.ok) return;

    assert.equal(historical.point.metadata?.request_source, undefined);
    assert.equal(isLegacyTrackingPointShape(historical.point), true);
    assert.equal(isLegacyTrackingPointShape(labeled.point), true);
    assert.equal(labeled.point.lat, historical.point.lat);
    assert.equal(labeled.point.lng, historical.point.lng);
    assert.equal(labeled.point.accuracy_m, historical.point.accuracy_m);
    assert.equal(labeled.point.speed_mps, historical.point.speed_mps);
    assert.equal(labeled.point.heading, historical.point.heading);
    assert.equal(labeled.point.captured_at, historical.point.captured_at);
    assert.deepEqual(readTemporalProvenance(labeled.point), readTemporalProvenance(historical.point));
  });

  it('los productores declaran la suscripción y no cambian la cadencia', () => {
    const task = readFileSync(
      new URL('../src/services/operatorTrackingTask.ts', import.meta.url),
      'utf8',
    );
    const hook = readFileSync(
      new URL('../src/hooks/useOperatorTrackingSession.ts', import.meta.url),
      'utf8',
    );

    assert.match(task, /request_source: TRACKING_REQUEST_SOURCE\.operatorBackgroundHigh/);
    assert.match(task, /metadata: BG_POINT_METADATA/);
    assert.match(hook, /request_source: TRACKING_REQUEST_SOURCE\.operatorForegroundBalanced/);
    assert.match(hook, /metadata: FG_POINT_METADATA/);

    const observeAt = hook.indexOf("if (ingestion.role === 'observe')");
    const bufferAt = hook.indexOf('bufferRef.current.push');
    assert.ok(observeAt > 0 && bufferAt > observeAt);

    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.accuracy, Location.Accuracy.High);
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.timeInterval, 20000);
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.distanceInterval, 10);
    assert.match(hook, /accuracy: Location\.Accuracy\.Balanced/);
    assert.match(hook, /timeInterval: WATCH_TIME_INTERVAL_MS/);
    assert.match(hook, /const WATCH_TIME_INTERVAL_MS = 20000/);
    assert.equal(task.includes('tracking_telemetry_version'), false);
    assert.equal(hook.includes('messenger_background_balanced'), false);
    assert.equal(hook.includes('one_shot_highest'), false);
  });
});
