/**
 * Operational Speed and Motion Estimator V1 — Fase A.
 *
 * Estas pruebas importan los MÓDULOS PRODUCTIVOS REALES (src/), no copias de la
 * lógica. Los hooks de scripts/test-hooks resuelven el alias @/ y stubbean solo
 * los paquetes nativos hoja de Expo/React Native.
 *
 * Ejecutar: npm run test:operator-ingestion
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

// Módulos productivos reales bajo prueba.
import {
  clearOperatorIngestion,
  getOperatorDedupeCapacity,
  getOperatorDedupeSize,
  getOperatorIngestionMetrics,
  getOperatorLastAcceptedFix,
  ingestOperatorLocations,
  resetOperatorIngestionForSession,
} from '@/utils/operatorIngestionCoordinator';
import {
  isOperatorBackgroundAuthoritative,
  resetOperatorBackgroundOwnership,
  resolveOperatorIngestionRole,
  setOperatorBackgroundOwnership,
} from '@/utils/operatorIngestionOwnership';
import {
  BoundedExactDedupe,
  buildOperatorExactDedupeKey,
  OPERATOR_DEDUPE_CAPACITY,
} from '@/utils/operatorIngestionDedupe';
import {
  drainOperatorIngestionChain,
  resetOperatorIngestionChain,
  runOnOperatorIngestionChain,
} from '@/utils/operatorIngestionChain';
import { mapTrackingPointPure } from '@/utils/trackingPointMapper';
import {
  getSpeedTelemetryPreviousFixForDiagnostics,
  resetSpeedTelemetryForNewSession,
  resetSpeedTelemetryPreviousFix,
} from '@/utils/speedTelemetryObserver';
import {
  endSessionSpeedStatistics,
  endSessionTrackingPipelineStatistics,
  getSessionSpeedStatistics,
  getSessionTrackingPipelineStatistics,
  getTrackingDiagnosticEvents,
} from '@/services/trackingDiagnostics';
import { resetTrackingPipelineForNewSession } from '@/utils/trackingPipelineObserver';

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';
/** Sesión propia: el bucket de speed stats se conserva por sessionId. */
const SESSION_C = '33333333-3333-4333-8333-333333333333';
/** Sesiones propias para diagnósticos de mapeo (pipeline stats por sessionId). */
const SESSION_D = '44444444-4444-4444-8444-444444444444';
const SESSION_E = '55555555-5555-4555-8555-555555555555';
const SESSION_F = '66666666-6666-4666-8666-666666666666';
const SESSION_G = '77777777-7777-4777-8777-777777777777';
const SESSION_H = '88888888-8888-4888-8888-888888888888';

const T0 = Date.parse('2026-09-16T12:00:00.000Z');
const SESSION_STARTED_AT_MS = T0 - 60_000;
const SESSION_STARTED_AT = new Date(SESSION_STARTED_AT_MS).toISOString();
/** now fijo y muy posterior evita que el guard temporal marque future_fix. */
const NOW_MS = T0 + 10 * 60_000;

type Fix = {
  atMs: number;
  lat?: number;
  lng?: number;
  speed?: number | null;
  accuracy?: number | null;
};

function loc(fix: Fix) {
  return {
    coords: {
      latitude: fix.lat ?? 10.9,
      longitude: fix.lng ?? -74.8,
      accuracy: fix.accuracy ?? 5,
      speed: fix.speed === undefined ? 3 : fix.speed,
      heading: 90,
    },
    timestamp: fix.atMs,
    mocked: false,
  };
}

async function ingest(
  sessionId: string,
  fixes: Fix[],
  options?: {
    channel?: 'foreground' | 'background';
    role?: 'authoritative' | 'observe';
  },
) {
  return ingestOperatorLocations({
    sessionId,
    locations: fixes.map(loc),
    channel: options?.channel ?? 'background',
    metadata: { source: 'test' },
    role: options?.role,
    sessionStartedAtMs: SESSION_STARTED_AT_MS,
    sessionStartedAt: SESSION_STARTED_AT,
    nowMs: NOW_MS,
  });
}

async function ingestLocations(
  sessionId: string,
  locations: unknown[],
  options?: {
    channel?: 'foreground' | 'background';
    role?: 'authoritative' | 'observe';
  },
) {
  return ingestOperatorLocations({
    sessionId,
    locations,
    channel: options?.channel ?? 'background',
    metadata: { source: 'test' },
    role: options?.role,
    sessionStartedAtMs: SESSION_STARTED_AT_MS,
    sessionStartedAt: SESSION_STARTED_AT,
    nowMs: NOW_MS,
  });
}

function freshSession(sessionId = SESSION_A): void {
  clearOperatorIngestion();
  resetOperatorIngestionChain();
  resetOperatorBackgroundOwnership();
  resetSpeedTelemetryPreviousFix();
  resetSpeedTelemetryForNewSession(sessionId);
  resetTrackingPipelineForNewSession(sessionId);
  resetOperatorIngestionForSession(sessionId);
}

beforeEach(() => {
  freshSession();
});

describe('TEST 1 — duplicado exacto FG/BG produce una sola mutación', () => {
  it('el mismo fix por ambos canales genera un único punto operacional', async () => {
    // BG autoritativo primero.
    const bg = await ingest(SESSION_A, [{ atMs: T0 }], { channel: 'background' });
    assert.equal(bg.points.length, 1);
    assert.equal(bg.role, 'authoritative');

    // Mismo fix reintroducido por el canal autoritativo → duplicado exacto.
    const again = await ingest(SESSION_A, [{ atMs: T0 }], { channel: 'background' });
    assert.equal(again.points.length, 0);
    assert.deepEqual(
      again.rejected.map((r) => r.reason),
      ['exact_duplicate'],
    );

    const metrics = getOperatorIngestionMetrics();
    assert.equal(metrics.operationalPointsMapped, 1);
    assert.equal(metrics.authoritativeSamples, 1);
    assert.equal(metrics.exactDuplicateSamples, 1);

    // Una sola mutación del estimador real.
    const previous = getSpeedTelemetryPreviousFixForDiagnostics();
    assert.equal(previous?.capturedAtMs, T0);
  });

  it('con BG autoritativo el mismo fix por FG no muta ni transporta', async () => {
    await ingest(SESSION_A, [{ atMs: T0 }], { channel: 'background' });
    const before = getSpeedTelemetryPreviousFixForDiagnostics();

    setOperatorBackgroundOwnership(true);
    const fg = await ingest(SESSION_A, [{ atMs: T0 + 5_000 }], { channel: 'foreground' });

    assert.equal(fg.role, 'observe');
    assert.equal(fg.points.length, 0);
    assert.equal(fg.observed.length, 1);

    const after = getSpeedTelemetryPreviousFixForDiagnostics();
    assert.deepEqual(after, before);
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 1);
  });
});

describe('TEST 2 — mismo timestamp y mismas coordenadas', () => {
  it('clasifica exact_duplicate y no genera invalid_delta_time ni commit doble', async () => {
    freshSession(SESSION_C);
    await ingest(SESSION_C, [{ atMs: T0, lat: 10.9, lng: -74.8 }]);

    const dup = await ingest(SESSION_C, [{ atMs: T0, lat: 10.9, lng: -74.8 }]);
    assert.deepEqual(
      dup.rejected.map((r) => r.reason),
      ['exact_duplicate'],
    );
    assert.equal(dup.points.length, 0);

    // Un tercer fix distinguible: si el duplicado hubiera llegado al estimador
    // con deltaT = 0, el estimador habría registrado un rechazo por delta.
    // Desplazamiento plausible: ~100 m en 10 s (~36 km/h), para que el propio
    // estimador no descarte el derived por implausible.
    const third = await ingest(SESSION_C, [
      { atMs: T0 + 10_000, lat: 10.9009, lng: -74.8, speed: 10 },
    ]);
    assert.equal(third.points.length, 1);

    const metrics = getOperatorIngestionMetrics();
    assert.equal(metrics.exactDuplicateSamples, 1);
    assert.equal(metrics.timestampCollisionSamples, 0);
    assert.equal(metrics.outOfOrderSamples, 0);
    assert.equal(metrics.authoritativeSamples, 2, 'solo dos commits reales');
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics()?.capturedAtMs, T0 + 10_000);

    // Estadísticas reales del estimador productivo: exactamente dos muestras
    // nativas y ningún rechazo por delta temporal inválido.
    // endSessionSpeedStatistics espera la cadena de persistencia, así que sirve
    // de drain determinista para las escrituras fire-and-forget.
    await endSessionSpeedStatistics();
    const stats = await getSessionSpeedStatistics();
    assert.ok(stats, 'las estadísticas de velocidad se materializaron');
    assert.equal(stats!.sessionId, SESSION_C);
    assert.equal(stats!.nativeSpeedSamples, 2, 'el estimador vio solo dos fixes');
    assert.equal(stats!.rejectedSpeedSamples, 0, 'sin invalid_delta_time');
    assert.equal(stats!.derivedRejectedSamples, 0, 'sin derived rechazado por delta');
  });
});

describe('TEST 3 — mismo timestamp con coordenadas diferentes', () => {
  it('clasifica timestamp_collision, no ejecuta derived y deja lastAccepted intacto', async () => {
    await ingest(SESSION_A, [{ atMs: T0, lat: 10.9, lng: -74.8 }]);
    const lastAcceptedBefore = getOperatorLastAcceptedFix();
    const previousBefore = getSpeedTelemetryPreviousFixForDiagnostics();

    const collision = await ingest(SESSION_A, [{ atMs: T0, lat: 10.95, lng: -74.85 }]);

    assert.deepEqual(
      collision.rejected.map((r) => r.reason),
      ['timestamp_collision'],
    );
    assert.equal(collision.points.length, 0);
    assert.equal(getOperatorIngestionMetrics().timestampCollisionSamples, 1);

    assert.deepEqual(getOperatorLastAcceptedFix(), lastAcceptedBefore);
    assert.deepEqual(getSpeedTelemetryPreviousFixForDiagnostics(), previousBefore);
  });
});

describe('TEST 4 — callback desordenado', () => {
  it('procesa en orden ascendente por capturedAt', async () => {
    const result = await ingest(SESSION_A, [
      { atMs: T0 + 20_000 },
      { atMs: T0 },
      { atMs: T0 + 10_000 },
    ]);

    assert.equal(result.sortedCallback, true);
    assert.equal(result.points.length, 3);
    assert.deepEqual(
      result.points.map((p) => Date.parse(p.captured_at)),
      [T0, T0 + 10_000, T0 + 20_000],
    );
    assert.equal(getOperatorIngestionMetrics().sortedMultiLocationCallbacks, 1);
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0 + 20_000);
  });

  it('un callback ya ordenado no cuenta como reordenado', async () => {
    const result = await ingest(SESSION_A, [{ atMs: T0 }, { atMs: T0 + 5_000 }]);
    assert.equal(result.sortedCallback, false);
    assert.equal(getOperatorIngestionMetrics().sortedMultiLocationCallbacks, 0);
  });
});

describe('TEST 5 — callback acumulado de 3 ubicaciones con span ~65 s', () => {
  it('mantiene orden estable y no invierte emparejamientos', async () => {
    const result = await ingest(SESSION_A, [
      { atMs: T0 + 65_000, lat: 10.92 },
      { atMs: T0, lat: 10.9 },
      { atMs: T0 + 30_000, lat: 10.91 },
    ]);

    assert.equal(result.points.length, 3);
    const times = result.points.map((p) => Date.parse(p.captured_at));
    assert.deepEqual(times, [T0, T0 + 30_000, T0 + 65_000]);
    assert.equal(times[2] - times[0], 65_000);

    // Monotonía estricta: ningún par invertido.
    for (let i = 1; i < times.length; i += 1) {
      assert.ok(times[i] > times[i - 1], `par invertido en índice ${i}`);
    }
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0 + 65_000);
  });
});

describe('TEST 6 — punto residual fuera de orden', () => {
  it('incrementa la métrica y no altera lastAccepted', async () => {
    await ingest(SESSION_A, [{ atMs: T0 }, { atMs: T0 + 30_000 }]);
    const lastAcceptedBefore = getOperatorLastAcceptedFix();
    const previousBefore = getSpeedTelemetryPreviousFixForDiagnostics();

    const residual = await ingest(SESSION_A, [{ atMs: T0 + 10_000, lat: 10.99 }]);

    assert.deepEqual(
      residual.rejected.map((r) => r.reason),
      ['out_of_order'],
    );
    assert.equal(residual.points.length, 0);
    assert.equal(getOperatorIngestionMetrics().outOfOrderSamples, 1);
    assert.deepEqual(getOperatorLastAcceptedFix(), lastAcceptedBefore);
    assert.deepEqual(getSpeedTelemetryPreviousFixForDiagnostics(), previousBefore);
  });
});

describe('TEST 7 — permanencia legítima', () => {
  it('conserva coordenadas iguales con timestamp posterior', async () => {
    await ingest(SESSION_A, [{ atMs: T0, lat: 10.9, lng: -74.8, speed: 0 }]);

    const stationary = await ingest(SESSION_A, [
      { atMs: T0 + 30_000, lat: 10.9, lng: -74.8, speed: 0 },
    ]);

    assert.equal(stationary.points.length, 1);
    assert.equal(stationary.rejected.length, 0);
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0 + 30_000);
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 2);
    assert.equal(getOperatorIngestionMetrics().exactDuplicateSamples, 0);
  });
});

describe('TEST 8 — ownership', () => {
  it('BG activo → FG no muta el estimador', async () => {
    setOperatorBackgroundOwnership(true);
    assert.equal(isOperatorBackgroundAuthoritative(), true);
    assert.equal(resolveOperatorIngestionRole('foreground'), 'observe');
    assert.equal(resolveOperatorIngestionRole('background'), 'authoritative');

    const fg = await ingest(SESSION_A, [{ atMs: T0 }], { channel: 'foreground' });
    assert.equal(fg.role, 'observe');
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics(), null);
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 0);
    assert.equal(getOperatorIngestionMetrics().observeOnlySamples, 1);
  });

  it('BG inactivo → FG es autoritativo', async () => {
    setOperatorBackgroundOwnership(false);
    assert.equal(resolveOperatorIngestionRole('foreground'), 'authoritative');

    const fg = await ingest(SESSION_A, [{ atMs: T0 }], { channel: 'foreground' });
    assert.equal(fg.role, 'authoritative');
    assert.equal(fg.points.length, 1);
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics()?.capturedAtMs, T0);
  });

  it('cambio de ownership no produce doble commit del mismo fix', async () => {
    setOperatorBackgroundOwnership(false);
    await ingest(SESSION_A, [{ atMs: T0 }], { channel: 'foreground' });
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 1);

    // BG toma ownership y reintroduce exactamente el mismo fix.
    setOperatorBackgroundOwnership(true);
    const bg = await ingest(SESSION_A, [{ atMs: T0 }], { channel: 'background' });

    assert.equal(bg.points.length, 0);
    assert.deepEqual(
      bg.rejected.map((r) => r.reason),
      ['exact_duplicate'],
    );
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 1);
  });
});

describe('TEST 9 — callbacks concurrentes', () => {
  it('la promise chain conserva el orden y el estado final es determinista', async () => {
    const first = ingest(SESSION_A, [{ atMs: T0 }, { atMs: T0 + 1_000 }]);
    const second = ingest(SESSION_A, [{ atMs: T0 + 2_000 }, { atMs: T0 + 3_000 }]);
    const third = ingest(SESSION_A, [{ atMs: T0 + 4_000 }]);

    const [r1, r2, r3] = await Promise.all([first, second, third]);

    assert.equal(r1.points.length, 2);
    assert.equal(r2.points.length, 2);
    assert.equal(r3.points.length, 1);
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 5);
    assert.equal(getOperatorIngestionMetrics().outOfOrderSamples, 0);
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0 + 4_000);
  });

  it('la cadena serializa incluso si las operaciones llegan invertidas', async () => {
    const later = ingest(SESSION_A, [{ atMs: T0 + 50_000 }]);
    const earlier = ingest(SESSION_A, [{ atMs: T0 + 10_000 }]);
    const [a, b] = await Promise.all([later, earlier]);

    // La primera encolada gana; la segunda queda fuera de orden, no intercalada.
    assert.equal(a.points.length, 1);
    assert.equal(b.points.length, 0);
    assert.deepEqual(
      b.rejected.map((r) => r.reason),
      ['out_of_order'],
    );
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0 + 50_000);
  });
});

describe('TEST 10 — cambio de sesión', () => {
  it('no reutiliza previousFix ni claves de la sesión anterior', async () => {
    await ingest(SESSION_A, [{ atMs: T0, lat: 10.9, lng: -74.8 }]);
    assert.equal(getOperatorDedupeSize(), 1);
    assert.equal(getOperatorLastAcceptedFix()?.sessionId, SESSION_A);

    // Nueva sesión: mismo instante y coordenadas que la anterior.
    resetSpeedTelemetryForNewSession(SESSION_B);
    const next = await ingest(SESSION_B, [{ atMs: T0, lat: 10.9, lng: -74.8 }]);

    assert.equal(next.points.length, 1, 'el fix de la nueva sesión debe aceptarse');
    assert.equal(next.rejected.length, 0);
    assert.equal(getOperatorLastAcceptedFix()?.sessionId, SESSION_B);
    assert.equal(getOperatorDedupeSize(), 1, 'claves anteriores eliminadas');
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics()?.sessionId, SESSION_B);
  });

  it('clearOperatorIngestion deja el estado vacío', async () => {
    await ingest(SESSION_A, [{ atMs: T0 }]);
    clearOperatorIngestion();
    assert.equal(getOperatorLastAcceptedFix(), null);
    assert.equal(getOperatorDedupeSize(), 0);
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 0);
  });
});

describe('TEST 11 — capacidad del dedupe', () => {
  it('la capacidad configurada está en el rango aprobado 512–1024', () => {
    assert.ok(OPERATOR_DEDUPE_CAPACITY >= 512, 'capacidad mínima 512');
    assert.ok(OPERATOR_DEDUPE_CAPACITY <= 1024, 'capacidad máxima 1024');
    assert.equal(getOperatorDedupeCapacity(), OPERATOR_DEDUPE_CAPACITY);
  });

  it('no supera el límite y expulsa las claves más antiguas (FIFO)', () => {
    const bounded = new BoundedExactDedupe(4);
    for (const n of [1, 2, 3, 4]) bounded.add(`k${n}`);
    assert.equal(bounded.size, 4);
    assert.equal(bounded.peekOldest(), 'k1');

    bounded.add('k5');
    assert.equal(bounded.size, 4, 'no crece por encima de la capacidad');
    assert.equal(bounded.has('k1'), false, 'la más antigua fue expulsada');
    assert.equal(bounded.has('k5'), true);
    assert.equal(bounded.peekOldest(), 'k2');

    bounded.clear();
    assert.equal(bounded.size, 0);
  });

  it('el dedupe del coordinador se mantiene acotado con carga real', async () => {
    const capacity = getOperatorDedupeCapacity();
    const total = capacity + 50;
    const fixes: Fix[] = [];
    for (let i = 0; i < total; i += 1) {
      fixes.push({ atMs: T0 + i * 1_000, lat: 10.9 + i * 1e-5 });
    }
    // nowMs posterior al último fix: el guard temporal real rechazaría como
    // future_fix cualquier captura por delante del reloj.
    const lastAtMs = T0 + (total - 1) * 1_000;
    const result = await ingestOperatorLocations({
      sessionId: SESSION_A,
      locations: fixes.map(loc),
      channel: 'background',
      metadata: { source: 'test' },
      role: 'authoritative',
      sessionStartedAtMs: SESSION_STARTED_AT_MS,
      nowMs: lastAtMs + 60_000,
    });

    assert.equal(result.points.length, total, 'todos los fixes válidos se aceptan');
    assert.ok(
      getOperatorDedupeSize() <= capacity,
      `dedupe ${getOperatorDedupeSize()} excede capacidad ${capacity}`,
    );
    assert.equal(getOperatorDedupeSize(), capacity, 'se estabiliza en la capacidad');
  });

  it('la clave exacta incluye sesión, timestamp y coordenadas', () => {
    const base = { sessionId: SESSION_A, capturedAt: '2026-09-16T12:00:00.000Z', lat: 10.9, lng: -74.8 };
    const key = buildOperatorExactDedupeKey(base);
    assert.equal(key, `${SESSION_A}|2026-09-16T12:00:00.000Z|10.9|-74.8`);
    assert.notEqual(key, buildOperatorExactDedupeKey({ ...base, lat: 10.90001 }));
    assert.notEqual(key, buildOperatorExactDedupeKey({ ...base, sessionId: SESSION_B }));
    assert.notEqual(
      key,
      buildOperatorExactDedupeKey({ ...base, capturedAt: '2026-09-16T12:00:01.000Z' }),
    );
  });
});

describe('TEST 12 — speed_mps conserva la semántica nativa', () => {
  it('el punto transportado mantiene exactamente el valor nativo en m/s', async () => {
    const nativeSpeed = 7.25;
    const result = await ingest(SESSION_A, [{ atMs: T0, speed: nativeSpeed }]);

    assert.equal(result.points.length, 1);
    assert.equal(result.points[0].speed_mps, nativeSpeed);
  });

  it('tras dos fixes con derived disponible, speed_mps sigue siendo el nativo', async () => {
    await ingest(SESSION_A, [{ atMs: T0, lat: 10.9, speed: 0 }]);
    const second = await ingest(SESSION_A, [{ atMs: T0 + 10_000, lat: 10.91, speed: 4.5 }]);

    assert.equal(second.points[0].speed_mps, 4.5);
    // La telemetría derivada/efectiva vive en metadata, nunca en speed_mps.
    const metadata = second.points[0].metadata as Record<string, unknown> | undefined;
    assert.ok(metadata, 'metadata presente');
    assert.equal(Object.hasOwn(metadata!, 'speed_mps'), false);
  });

  it('speed nativo ausente se conserva como null, no se sustituye', async () => {
    const result = await ingest(SESSION_A, [{ atMs: T0, speed: null }]);
    assert.equal(result.points[0].speed_mps, null);
  });

  it('el mapeo puro no muta el estimador', () => {
    freshSession();
    const mapped = mapTrackingPointPure(loc({ atMs: T0, speed: 6 }), 'foreground', undefined, {
      sessionStartedAtMs: SESSION_STARTED_AT_MS,
      nowMs: NOW_MS,
    });
    assert.equal(mapped.ok, true);
    if (mapped.ok) assert.equal(mapped.point.speed_mps, 6);
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics(), null);
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 0);
  });
});

describe('TEST 13 — un error no rompe la cadena', () => {
  it('la siguiente operación todavía se ejecuta tras un rechazo', async () => {
    const failing = runOnOperatorIngestionChain(SESSION_A, async () => {
      throw new Error('fallo deliberado');
    });
    await assert.rejects(failing, /fallo deliberado/);

    const after = await ingest(SESSION_A, [{ atMs: T0 }]);
    assert.equal(after.points.length, 1);
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0);
  });

  it('la cadena sigue ordenando después de varios errores', async () => {
    for (let i = 0; i < 3; i += 1) {
      await assert.rejects(
        runOnOperatorIngestionChain(SESSION_A, async () => {
          throw new Error(`boom-${i}`);
        }),
        /boom-/,
      );
    }

    const a = ingest(SESSION_A, [{ atMs: T0 }]);
    const b = ingest(SESSION_A, [{ atMs: T0 + 5_000 }]);
    const [r1, r2] = await Promise.all([a, b]);

    assert.equal(r1.points.length, 1);
    assert.equal(r2.points.length, 1);
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0 + 5_000);
    await drainOperatorIngestionChain(SESSION_A);
  });
});

const INVALID_COORDS_LOCATION = {
  coords: { latitude: Number.NaN, longitude: -74.8, accuracy: 5, speed: 0, heading: 0 },
  timestamp: T0,
  mocked: false,
};

const PRE_SESSION_AT_MS = SESSION_STARTED_AT_MS - 60_000;

async function drainPipelineDiagnostics() {
  await endSessionTrackingPipelineStatistics();
}

async function eventsOfType(type: string, sessionId: string) {
  const events = await getTrackingDiagnosticEvents(500);
  return events.filter((event) => event.type === type && event.sessionId === sessionId);
}

describe('TEST 14 — diagnósticos de mapeo solo en canal autoritativo', () => {
  it('invalid_coords autoritativo emite un tracking-fix-invalid y no muta previousFix', async () => {
    freshSession(SESSION_D);
    const before = getSpeedTelemetryPreviousFixForDiagnostics();

    const result = await ingestLocations(SESSION_D, [INVALID_COORDS_LOCATION], {
      channel: 'background',
      role: 'authoritative',
    });

    assert.equal(result.invalid, 1);
    assert.equal(result.points.length, 0);
    assert.equal(result.role, 'authoritative');
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics(), before);
    assert.equal(getOperatorLastAcceptedFix(), null);

    await drainPipelineDiagnostics();
    const events = await eventsOfType('tracking-fix-invalid', SESSION_D);
    assert.equal(events.length, 1, 'exactamente un tracking-fix-invalid');
    assert.equal(events[0].detail?.reason, 'invalid_coords');
    assert.equal(events[0].detail?.channel, 'background');

    const pipeline = await getSessionTrackingPipelineStatistics();
    assert.ok(pipeline, 'bucket de pipeline materializado');
    assert.equal(pipeline!.sessionId, SESSION_D);
    assert.equal(pipeline!.locationFixesInvalid, 1);
    assert.equal(pipeline!.pointsMapped, 0);
  });

  it('rechazo temporal autoritativo conserva reason/detalles y no muta previousFix', async () => {
    freshSession(SESSION_E);
    const before = getSpeedTelemetryPreviousFixForDiagnostics();

    const result = await ingest(SESSION_E, [{ atMs: PRE_SESSION_AT_MS }], {
      channel: 'background',
      role: 'authoritative',
    });

    assert.equal(result.invalid, 1);
    assert.equal(result.points.length, 0);
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics(), before);
    assert.equal(getOperatorLastAcceptedFix(), null);

    await drainPipelineDiagnostics();
    const events = await eventsOfType('tracking-fix-temporal-rejected', SESSION_E);
    assert.equal(events.length, 1, 'exactamente un tracking-fix-temporal-rejected');
    assert.equal(events[0].detail?.reason, 'pre_session_fix');
    assert.equal(events[0].detail?.sessionId, SESSION_E);
    assert.equal(events[0].detail?.capturedAt, new Date(PRE_SESSION_AT_MS).toISOString());
    assert.equal(events[0].detail?.sessionStartedAt, SESSION_STARTED_AT);
    assert.equal(events[0].detail?.deltaMs, PRE_SESSION_AT_MS - SESSION_STARTED_AT_MS);
    assert.equal(events[0].detail?.ageRelativeToSessionMs, PRE_SESSION_AT_MS - SESSION_STARTED_AT_MS);
    assert.equal(events[0].detail?.fixAgeMs, NOW_MS - PRE_SESSION_AT_MS);
    assert.equal(events[0].detail?.channel, 'background');

    const pipeline = await getSessionTrackingPipelineStatistics();
    assert.ok(pipeline);
    assert.equal(pipeline!.sessionId, SESSION_E);
    assert.equal(pipeline!.locationFixesInvalid, 1);
    assert.equal(pipeline!.preSessionFixRejected, 1);
    assert.equal(pipeline!.pointsMapped, 0);
  });

  it('el mismo rechazo por canal observe no emite diagnóstico ni muta estado', async () => {
    freshSession(SESSION_F);
    setOperatorBackgroundOwnership(true);

    const result = await ingestLocations(SESSION_F, [INVALID_COORDS_LOCATION], {
      channel: 'foreground',
      role: 'observe',
    });

    assert.equal(result.role, 'observe');
    assert.equal(result.invalid, 1);
    assert.equal(result.points.length, 0);
    assert.equal(result.observed.length, 0);
    assert.equal(getSpeedTelemetryPreviousFixForDiagnostics(), null);
    assert.equal(getOperatorLastAcceptedFix(), null);
    assert.equal(getOperatorIngestionMetrics().operationalPointsMapped, 0);

    await drainPipelineDiagnostics();
    const invalidEvents = await eventsOfType('tracking-fix-invalid', SESSION_F);
    const temporalEvents = await eventsOfType('tracking-fix-temporal-rejected', SESSION_F);
    assert.equal(invalidEvents.length, 0, 'observe no emite tracking-fix-invalid');
    assert.equal(temporalEvents.length, 0, 'observe no emite tracking-fix-temporal-rejected');

    const pipeline = await getSessionTrackingPipelineStatistics();
    assert.ok(pipeline);
    assert.equal(pipeline!.sessionId, SESSION_F);
    assert.equal(pipeline!.locationFixesInvalid, 0);
    assert.equal(pipeline!.pointsMapped, 0);
  });

  it('un rechazo visto por FG observe y BG authoritative genera un solo evento', async () => {
    freshSession(SESSION_G);
    setOperatorBackgroundOwnership(true);

    const fg = await ingestLocations(SESSION_G, [INVALID_COORDS_LOCATION], {
      channel: 'foreground',
      role: 'observe',
    });
    const bg = await ingestLocations(SESSION_G, [INVALID_COORDS_LOCATION], {
      channel: 'background',
      role: 'authoritative',
    });

    assert.equal(fg.invalid, 1);
    assert.equal(bg.invalid, 1);
    assert.equal(fg.points.length, 0);
    assert.equal(bg.points.length, 0);

    await drainPipelineDiagnostics();
    const events = await eventsOfType('tracking-fix-invalid', SESSION_G);
    assert.equal(events.length, 1, 'un solo evento operacional total');
    assert.equal(events[0].detail?.channel, 'background');

    const pipeline = await getSessionTrackingPipelineStatistics();
    assert.ok(pipeline);
    assert.equal(pipeline!.sessionId, SESSION_G);
    assert.equal(pipeline!.locationFixesInvalid, 1);
  });

  it('ingestion.invalid refleja el recuento y esos puntos no llegan al transporte', async () => {
    freshSession(SESSION_H);
    const mixed = await ingestLocations(
      SESSION_H,
      [INVALID_COORDS_LOCATION, loc({ atMs: T0 }), loc({ atMs: PRE_SESSION_AT_MS })],
      { channel: 'background', role: 'authoritative' },
    );

    assert.equal(mixed.invalid, 2);
    assert.equal(mixed.points.length, 1, 'solo el fix válido entra al transporte');
    assert.equal(Date.parse(mixed.points[0].captured_at), T0);
    assert.equal(getOperatorLastAcceptedFix()?.capturedAtMs, T0);
  });
});
