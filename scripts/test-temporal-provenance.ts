/**
 * Procedencia temporal v2 — evidencia de cliente.
 * Ejecutar: npm run test:temporal-provenance
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS } from '@/services/operatorTrackingService';
import {
  operatorTrackingPendingQueue,
  __resetOperatorPendingQueueMutationChainForTests,
} from '@/storage/operatorTrackingPendingQueue';
import type { TrackingPointInput } from '@/types/tracking';
import {
  clearOperatorIngestion,
  ingestOperatorLocations,
} from '@/utils/operatorIngestionCoordinator';
import { createTechnicalUuid } from '@/utils/technicalUuid';
import { mapTrackingPointPure } from '@/utils/trackingPointMapper';
import {
  admitQueueProvenance,
  buildTrackingPointsBatchRequest,
  QUEUE_ADMISSION_DURABLE,
  QUEUE_ADMISSION_FOREGROUND,
  readTemporalProvenance,
} from '@/utils/temporalProvenance';

const SESSION = '11111111-1111-4111-8111-111111111111';
const SESSION_STARTED = Date.parse('2026-10-03T18:00:00.000Z');
const NOW = Date.parse('2026-10-03T18:10:00.000Z');
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loc(atMs: number, patch?: { lat?: number; speed?: number; accuracy?: number }) {
  return {
    coords: {
      latitude: patch?.lat ?? 4.65,
      longitude: -74.08,
      accuracy: patch?.accuracy ?? 6.5,
      speed: patch?.speed ?? 3.25,
      heading: 12,
    },
    timestamp: atMs,
    mocked: false,
  };
}

function temporalOf(point: TrackingPointInput) {
  const temporal = readTemporalProvenance(point);
  assert.ok(temporal, 'metadata.temporal presente');
  return temporal;
}

async function ingest(locations: unknown[], channel: 'background' | 'foreground' = 'background') {
  return ingestOperatorLocations({
    sessionId: SESSION,
    locations,
    channel,
    metadata: { source: channel === 'background' ? 'android_background' : 'android_mvp' },
    role: 'authoritative',
    sessionStartedAtMs: SESSION_STARTED,
    nowMs: NOW,
  });
}

beforeEach(async () => {
  clearOperatorIngestion();
  __resetOperatorPendingQueueMutationChainForTests();
  await AsyncStorage.clear();
});

describe('medición nativa', () => {
  it('captured_at y measurement_at representan el mismo timestamp nativo', () => {
    const atMs = SESSION_STARTED + 5_000;
    const mapped = mapTrackingPointPure(loc(atMs, { speed: 3.25, accuracy: 6.5 }), 'background', {
      source: 'android_background',
    }, {
      sessionStartedAtMs: SESSION_STARTED,
      nowMs: NOW,
      callback: {
        callback_at: new Date(NOW).toISOString(),
        callback_batch_id: createTechnicalUuid(),
        callback_index: 0,
        callback_size: 1,
      },
    });
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    const expected = new Date(atMs).toISOString();
    assert.equal(mapped.point.captured_at, expected);
    assert.equal(temporalOf(mapped.point).measurement_at, expected);
    assert.equal(temporalOf(mapped.point).measurement_timestamp_source, 'NATIVE_LOCATION_TIMESTAMP');
    assert.equal(mapped.point.lat, 4.65);
    assert.equal(mapped.point.lng, -74.08);
    assert.equal(mapped.point.accuracy_m, 6.5);
    assert.equal(mapped.point.speed_mps, 3.25);
    assert.equal(mapped.point.metadata?.source, 'android_background');
    assert.match(mapped.point.fix_id ?? '', UUID_RE);
  });

  it('el fallback legítimo no inventa measurement_at', () => {
    const mapped = mapTrackingPointPure(
      { coords: { latitude: 4.7, longitude: -74.1, accuracy: 9, speed: 1 } },
      'background',
      undefined,
      { nowMs: NOW },
    );
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(mapped.point.captured_at, new Date(NOW).toISOString());
    assert.equal(temporalOf(mapped.point).measurement_at, null);
    assert.equal(
      temporalOf(mapped.point).measurement_timestamp_source,
      'FALLBACK_CLIENT_WALL_CLOCK',
    );
  });
});

describe('callback', () => {
  it('tres locations comparten callback y conservan el índice original', async () => {
    const result = await ingest([
      loc(SESSION_STARTED + 30_000, { lat: 4.63 }),
      loc(SESSION_STARTED + 10_000, { lat: 4.61 }),
      loc(SESSION_STARTED + 20_000, { lat: 4.62 }),
    ]);
    assert.equal(result.points.length, 3);
    const ids = result.points.map((point) => temporalOf(point).callback_batch_id);
    assert.equal(new Set(ids).size, 1);
    assert.match(String(ids[0]), UUID_RE);
    const at = result.points.map((point) => temporalOf(point).callback_at);
    assert.deepEqual(at, [new Date(NOW).toISOString(), new Date(NOW).toISOString(), new Date(NOW).toISOString()]);
    assert.deepEqual(
      result.points.map((point) => temporalOf(point).callback_size),
      [3, 3, 3],
    );
    assert.deepEqual(
      result.points.map((point) => temporalOf(point).callback_index),
      [1, 2, 0],
    );
    assert.deepEqual(
      result.points.map((point) => Date.parse(point.captured_at)),
      [SESSION_STARTED + 10_000, SESSION_STARTED + 20_000, SESSION_STARTED + 30_000],
    );
    const fixIds = result.points.map((point) => point.fix_id);
    assert.equal(new Set(fixIds).size, 3);
  });

  it('un rechazo no renumera los índices supervivientes', async () => {
    const result = await ingest([
      loc(SESSION_STARTED + 10_000, { lat: 4.61 }),
      { coords: { latitude: Number.NaN, longitude: -74.08, accuracy: 5, speed: 1 }, timestamp: SESSION_STARTED + 15_000 },
      loc(SESSION_STARTED + 20_000, { lat: 4.62 }),
    ]);
    assert.equal(result.points.length, 2);
    assert.equal(result.invalid, 1);
    assert.equal(temporalOf(result.points[0]).callback_index, 0);
    assert.equal(temporalOf(result.points[1]).callback_index, 2);
    assert.equal(temporalOf(result.points[0]).callback_size, 3);
    assert.equal(temporalOf(result.points[1]).callback_size, 3);
    assert.equal(
      temporalOf(result.points[0]).callback_batch_id,
      temporalOf(result.points[1]).callback_batch_id,
    );
  });
});

describe('cola durable y retry', () => {
  it('serializa y restaura la procedencia sin cambiarla', async () => {
    const ingested = await ingest([loc(SESSION_STARTED + 10_000)]);
    const original = ingested.points[0];
    const queuedAt = SESSION_STARTED + 12_000;
    await operatorTrackingPendingQueue.enqueue(SESSION, [original], { nowMs: queuedAt });
    const raw = await AsyncStorage.getItem('rutafy_operator_tracking_pending_points');
    assert.ok(raw);
    await operatorTrackingPendingQueue.clear();
    await AsyncStorage.setItem('rutafy_operator_tracking_pending_points', raw!);
    const restored = await operatorTrackingPendingQueue.get(SESSION);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].fix_id, original.fix_id);
    assert.equal(restored[0].captured_at, original.captured_at);
    assert.equal(restored[0].lat, original.lat);
    assert.equal(restored[0].lng, original.lng);
    assert.equal(restored[0].speed_mps, original.speed_mps);
    assert.equal(restored[0].accuracy_m, original.accuracy_m);
    const temporal = temporalOf(restored[0]);
    assert.equal(temporal.measurement_at, temporalOf(original).measurement_at);
    assert.equal(temporal.measurement_timestamp_source, 'NATIVE_LOCATION_TIMESTAMP');
    assert.equal(temporal.callback_batch_id, temporalOf(original).callback_batch_id);
    assert.equal(temporal.callback_index, 0);
    assert.equal(temporal.callback_size, 1);
    assert.equal(temporal.queued_at, new Date(queuedAt).toISOString());
    assert.equal(temporal.queue_admission, QUEUE_ADMISSION_DURABLE);
    assert.equal(JSON.stringify(restored[0]).includes('upload_batch_id'), false);
  });

  it('un punto legado sin procedencia se restaura y no se inventa', async () => {
    const legacy: TrackingPointInput = {
      lat: 4.6,
      lng: -74.1,
      captured_at: '2026-10-03T18:01:00.000Z',
      accuracy_m: 12,
      speed_mps: 0,
      app_state: 'background',
    };
    await AsyncStorage.setItem(
      'rutafy_operator_tracking_pending_points',
      JSON.stringify({ sessionId: SESSION, points: [legacy] }),
    );
    const restored = await operatorTrackingPendingQueue.get(SESSION);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].fix_id, undefined);
    assert.equal(restored[0].metadata, undefined);
    assert.equal(readTemporalProvenance(restored[0]), null);
    assert.equal(restored[0].captured_at, legacy.captured_at);
  });

  it('el retry genera otro upload y no toca la observación', async () => {
    const ingested = await ingest([loc(SESSION_STARTED + 10_000, { lat: 4.61 })]);
    await operatorTrackingPendingQueue.enqueue(SESSION, ingested.points, {
      nowMs: SESSION_STARTED + 11_000,
    });
    const firstBatch = await operatorTrackingPendingQueue.dequeueBatch(SESSION, 25);
    const attempt1 = buildTrackingPointsBatchRequest(firstBatch, SESSION_STARTED + 13_000);
    await operatorTrackingPendingQueue.requeueFront(SESSION, firstBatch);
    const requeued = await operatorTrackingPendingQueue.get(SESSION);
    const attempt2 = buildTrackingPointsBatchRequest(requeued, SESSION_STARTED + 14_000);

    assert.notEqual(attempt1.upload_batch_id, attempt2.upload_batch_id);
    assert.notEqual(attempt1.upload_attempt_at, attempt2.upload_attempt_at);
    assert.equal(requeued[0].fix_id, firstBatch[0].fix_id);
    assert.equal(requeued[0].captured_at, firstBatch[0].captured_at);
    assert.equal(requeued[0].lat, firstBatch[0].lat);
    assert.equal(requeued[0].lng, firstBatch[0].lng);
    assert.deepEqual(readTemporalProvenance(requeued[0]), readTemporalProvenance(firstBatch[0]));
    assert.equal(JSON.stringify(requeued[0]).includes(attempt1.upload_batch_id), false);
    assert.deepEqual(Object.keys(attempt1).sort(), ['points', 'upload_attempt_at', 'upload_batch_id']);
  });

  it('varias callbacks viajan en un solo intento HTTP', async () => {
    const first = await ingest([loc(SESSION_STARTED + 10_000, { lat: 4.61 })]);
    const second = await ingest([loc(SESSION_STARTED + 20_000, { lat: 4.62 })]);
    await operatorTrackingPendingQueue.enqueue(SESSION, [...first.points, ...second.points], {
      nowMs: SESSION_STARTED + 21_000,
    });
    const batch = await operatorTrackingPendingQueue.dequeueBatch(SESSION, 25);
    const request = buildTrackingPointsBatchRequest(batch, SESSION_STARTED + 22_000);
    assert.equal(request.points.length, 2);
    assert.notEqual(
      temporalOf(request.points[0]).callback_batch_id,
      temporalOf(request.points[1]).callback_batch_id,
    );
    assert.match(request.upload_batch_id, UUID_RE);
    assert.equal(request.upload_attempt_at, new Date(SESSION_STARTED + 22_000).toISOString());
    assert.equal(temporalOf(request.points[0]).callback_index, 0);
    assert.equal(temporalOf(request.points[1]).callback_index, 0);
  });
});

describe('foreground', () => {
  it('admite el buffer en memoria y arma el mismo cuerpo de upload', async () => {
    const result = await ingest([loc(SESSION_STARTED + 8_000, { lat: 4.64 })], 'foreground');
    assert.equal(result.points[0].app_state, 'foreground');
    const admitted = admitQueueProvenance(
      result.points[0],
      QUEUE_ADMISSION_FOREGROUND,
      SESSION_STARTED + 9_000,
    );
    const again = admitQueueProvenance(admitted, QUEUE_ADMISSION_FOREGROUND, SESSION_STARTED + 50_000);
    assert.equal(temporalOf(again).queued_at, new Date(SESSION_STARTED + 9_000).toISOString());
    assert.equal(temporalOf(again).queue_admission, 'FOREGROUND_MEMORY_BUFFER');
    assert.equal(again.fix_id, result.points[0].fix_id);
    const request = buildTrackingPointsBatchRequest([again], SESSION_STARTED + 9_500);
    assert.equal(request.points[0].fix_id, again.fix_id);
    assert.match(request.upload_batch_id, UUID_RE);
    assert.equal(temporalOf(request.points[0]).measurement_timestamp_source, 'NATIVE_LOCATION_TIMESTAMP');
  });
});

describe('contrato y congelación', () => {
  it('los ids técnicos no codifican persona, dispositivo ni reloj', () => {
    const samples = Array.from({ length: 20 }, () => createTechnicalUuid());
    assert.equal(new Set(samples).size, 20);
    for (const id of samples) {
      assert.match(id, UUID_RE);
      assert.equal(id.includes('313'), false);
      assert.equal(id.includes('@'), false);
      assert.equal(id.includes('rutafy'), false);
    }
  });

  it('la tarea background conserva la cadencia congelada', () => {
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.accuracy, Location.Accuracy.High);
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.timeInterval, 20000);
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.distanceInterval, 10);
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.deferredUpdatesInterval, 20000);
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.deferredUpdatesDistance, 10);
    assert.equal(OPERATOR_BACKGROUND_LOCATION_TASK_OPTIONS.pausesUpdatesAutomatically, false);
    const source = readFileSync(new URL('../src/services/operatorTrackingService.ts', import.meta.url), 'utf8');
    assert.equal(source.includes('elapsedRealtime'), false);
    assert.equal(source.includes('200 km'), false);
  });

  it('la procedencia no añade compuerta de velocidad ni reloj monotónico', () => {
    const source = readFileSync(new URL('../src/utils/temporalProvenance.ts', import.meta.url), 'utf8');
    assert.equal(source.includes('elapsedRealtime'), false);
    assert.equal(source.includes('speed_gate'), false);
    assert.equal(source.includes('NATIVE_LOCATION_TIMESTAMP'), true);
    assert.equal(source.includes('FALLBACK_CLIENT_WALL_CLOCK'), true);
  });
});
