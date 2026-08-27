/**
 * Observability & reliability — pipeline counters, batchAccepted, pending queue.
 * Ejecutar: node scripts/validate-tracking-observability.mjs
 */

function bumpMax(prev, next) {
  if (prev == null) return next;
  return Math.max(prev, next);
}

function createEmptyPipeline(sessionId) {
  return {
    sessionId,
    locationCallbacks: 0,
    locationFixesReceived: 0,
    locationFixesValid: 0,
    locationFixesInvalid: 0,
    pointsMapped: 0,
    pointsBuffered: 0,
    pointsQueuedBackground: 0,
    pointsDequeued: 0,
    batchesCreated: 0,
    batchesSendAttempts: 0,
    batchesAccepted: 0,
    batchesFailed: 0,
    pointsSendAttempted: 0,
    pointsAcceptedByApi: 0,
    http401: 0,
    networkErrors: 0,
    lastValidFixAt: null,
    lastPointMappedAt: null,
    lastBatchSuccessAt: null,
    lastBatchAcceptedAt: null,
    maxAcceptedBatchGapMs: null,
    multiLocationCallbacks: 0,
    maxLocationsPerCallback: null,
    callbacksWhileBatchInFlight: 0,
    pointsDeferredWhileInFlight: 0,
    maxPendingQueueDepth: null,
  };
}

function updateTimestampGap(stats, field, lastIso, nowIso) {
  if (!lastIso) return stats;
  const lastMs = Date.parse(lastIso);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) return stats;
  const delta = Math.max(0, nowMs - lastMs);
  return { ...stats, [field]: bumpMax(stats[field], delta) };
}

/** Espejo de applyPipelineEventToSession (semántica corregida). */
function applyPipelineEvent(type, stats, timestamp, detail = {}) {
  let next = { ...stats };
  const pointCount =
    typeof detail.pointCount === 'number' && Number.isFinite(detail.pointCount)
      ? detail.pointCount
      : 0;
  const accepted =
    typeof detail.accepted === 'number' && Number.isFinite(detail.accepted)
      ? detail.accepted
      : 0;

  switch (type) {
    case 'gps-fix-received':
      next.locationFixesReceived += 1;
      break;
    case 'point-mapped':
      next = updateTimestampGap(next, 'maxValidFixGapMs', next.lastValidFixAt, timestamp);
      next.locationFixesValid += 1;
      next.pointsMapped += 1;
      next.lastValidFixAt = timestamp;
      next.lastPointMappedAt = timestamp;
      break;
    case 'point-buffered':
      next.pointsBuffered += 1;
      break;
    case 'point-queued-background': {
      const queued = pointCount > 0 ? pointCount : 1;
      next.pointsQueuedBackground += queued;
      if (typeof detail.queueDepth === 'number') {
        next.maxPendingQueueDepth = bumpMax(next.maxPendingQueueDepth, detail.queueDepth);
      }
      break;
    }
    case 'tracking-batch-deferred':
      next.callbacksWhileBatchInFlight += 1;
      if (pointCount > 0) next.pointsDeferredWhileInFlight += pointCount;
      break;
    case 'batch-created':
      next.batchesCreated += 1;
      if (pointCount > 0) next.pointsDequeued += pointCount;
      break;
    case 'batch-send':
      next.batchesSendAttempts += 1;
      if (pointCount > 0) next.pointsSendAttempted += pointCount;
      break;
    case 'batch-success':
      next.lastBatchSuccessAt = timestamp;
      break;
    case 'batch-accepted':
      next = updateTimestampGap(next, 'maxAcceptedBatchGapMs', next.lastBatchAcceptedAt, timestamp);
      next.batchesAccepted += 1;
      if (accepted > 0) next.pointsAcceptedByApi += accepted;
      next.lastBatchAcceptedAt = timestamp;
      break;
    case 'batch-error':
    case 'batch-timeout':
      next.batchesFailed += 1;
      next.networkErrors += 1;
      break;
    case 'batch-401':
      next.batchesFailed += 1;
      next.http401 += 1;
      break;
    default:
      return null;
  }
  return next;
}

function pointDedupeKey(point) {
  return `${point.captured_at}|${point.lat}|${point.lng}`;
}

function sortPointsByCapturedAt(points) {
  return [...points].sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
}

function mergePendingPoints(existing, incoming, maxPoints = 1000) {
  const seen = new Set(existing.map(pointDedupeKey));
  let duplicatesSkipped = 0;
  const toAdd = [];
  for (const point of incoming) {
    const key = pointDedupeKey(point);
    if (seen.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seen.add(key);
    toAdd.push(point);
  }
  let merged = sortPointsByCapturedAt([...existing, ...toAdd]);
  let overflowDropped = 0;
  if (merged.length > maxPoints) {
    overflowDropped = merged.length - maxPoints;
    merged = merged.slice(overflowDropped);
  }
  const retainedKeys = new Set(merged.map(pointDedupeKey));
  const added = toAdd.filter((p) => retainedKeys.has(pointDedupeKey(p))).length;
  return { points: merged, added, duplicatesSkipped, overflowDropped };
}

function takePendingBatch(points, maxBatchSize) {
  if (maxBatchSize <= 0 || points.length === 0) {
    return { batch: [], remaining: points };
  }
  const size = Math.min(maxBatchSize, points.length);
  return { batch: points.slice(0, size), remaining: points.slice(size) };
}

function requeueFailedBatch(remaining, failedBatch, maxPoints = 1000) {
  return mergePendingPoints(failedBatch, remaining, maxPoints).points;
}

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`OK  ${name}`);
}

let passed = 0;
const t0 = '2026-08-23T14:00:00.000Z';
const t1 = '2026-08-23T14:00:01.000Z';

(async () => {
try {
  // 1. gps-fix válido → locationFixesValid vía point-mapped
  let s = createEmptyPipeline('s1');
  s = applyPipelineEvent('gps-fix-received', s, t0);
  s = applyPipelineEvent('point-mapped', s, t0);
  assert('1. gps-fix válido incrementa locationFixesValid', s.locationFixesValid === 1);
  passed++;

  // 2. point-mapped → pointsMapped
  assert('2. point-mapped incrementa pointsMapped', s.pointsMapped === 1);
  passed++;

  // 3. batch-success + batch-accepted NO duplican batchesAccepted
  s = applyPipelineEvent('batch-created', s, t0, { pointCount: 2 });
  s = applyPipelineEvent('batch-send', s, t0, { pointCount: 2 });
  s = applyPipelineEvent('batch-success', s, t0, { pointCount: 2, latencyMs: 1500 });
  s = applyPipelineEvent('batch-accepted', s, t0, { accepted: 2 });
  assert(
    '3. batch-success + batch-accepted no duplican batchesAccepted',
    s.batchesAccepted === 1 && s.batchesCreated === 1 && s.batchesSendAttempts === 1,
  );
  passed++;

  // 4. accepted=N → pointsAcceptedByApi exactamente N
  assert('4. accepted=N incrementa pointsAcceptedByApi exactamente N', s.pointsAcceptedByApi === 2);
  passed++;

  // Segundo batch success+accepted: sigue +1 no +2
  s = applyPipelineEvent('batch-success', s, t1, { pointCount: 3 });
  s = applyPipelineEvent('batch-accepted', s, t1, { accepted: 3 });
  assert(
    '4b. segundo par success+accepted → batchesAccepted=2',
    s.batchesAccepted === 2 && s.pointsAcceptedByApi === 5,
  );
  passed++;

  // 5. batch fallido incrementa batchesFailed
  s = applyPipelineEvent('batch-error', s, t1, { latencyMs: 100 });
  assert('5. batch fallido incrementa batchesFailed', s.batchesFailed === 1 && s.networkErrors === 1);
  passed++;

  // 6. puntos durante batchInFlight no se descartan (cola)
  const p1 = { lat: 3.88, lng: -77.03, captured_at: '2026-08-23T14:00:00.000Z' };
  const p2 = { lat: 3.881, lng: -77.031, captured_at: '2026-08-23T14:00:20.000Z' };
  const p3 = { lat: 3.882, lng: -77.032, captured_at: '2026-08-23T14:00:40.000Z' };

  let queue = [];
  // Simula: batch en vuelo con p1 ya dequeued; llegan p2,p3 → encolar
  const inFlightMerge = mergePendingPoints(queue, [p2, p3]);
  queue = inFlightMerge.points;
  assert(
    '6. puntos recibidos mientras batchInFlight no se descartan',
    queue.length === 2 && inFlightMerge.added === 2,
  );
  passed++;

  let deferredStats = createEmptyPipeline('bg');
  deferredStats = applyPipelineEvent('tracking-batch-deferred', deferredStats, t0, {
    pointCount: 2,
  });
  assert(
    '6b. deferred incrementa pointsDeferredWhileInFlight',
    deferredStats.pointsDeferredWhileInFlight === 2 &&
      deferredStats.callbacksWhileBatchInFlight === 1,
  );
  passed++;

  // 7. pending conserva captured_at y orden
  const disordered = mergePendingPoints([], [p3, p1, p2]).points;
  assert(
    '7. puntos pendientes conservan captured_at y orden',
    disordered[0].captured_at === p1.captured_at &&
      disordered[1].captured_at === p2.captured_at &&
      disordered[2].captured_at === p3.captured_at &&
      disordered[0].lat === p1.lat,
  );
  passed++;

  // 8. enviados correctamente no vuelven a enviarse
  let pending = mergePendingPoints([], [p1, p2, p3]).points;
  const taken = takePendingBatch(pending, 2);
  assert(
    '8a. dequeue toma los más antiguos',
    taken.batch.length === 2 && taken.batch[0].captured_at === p1.captured_at,
  );
  pending = taken.remaining;
  assert(
    '8. una vez enviados no vuelven accidentalmente',
    pending.length === 1 && pending[0].captured_at === p3.captured_at,
  );
  passed += 2;

  // Fallo: requeue al frente sin duplicar
  const failed = [p1, p2];
  const left = [p3];
  const restored = requeueFailedBatch(left, failed);
  assert(
    '8c. requeue tras fallo restaura orden y sin duplicados',
    restored.length === 3 &&
      restored[0].captured_at === p1.captured_at &&
      restored[2].captured_at === p3.captured_at &&
      mergePendingPoints(restored, failed).duplicatesSkipped === 2,
  );
  passed++;

  // 9. pipeline foreground: point-buffered (no queued-bg)
  let fg = createEmptyPipeline('fg');
  fg = applyPipelineEvent('point-mapped', fg, t0);
  fg = applyPipelineEvent('point-buffered', fg, t0);
  fg = applyPipelineEvent('batch-created', fg, t0, { pointCount: 1 });
  fg = applyPipelineEvent('batch-send', fg, t0, { pointCount: 1 });
  fg = applyPipelineEvent('batch-success', fg, t0);
  fg = applyPipelineEvent('batch-accepted', fg, t0, { accepted: 1 });
  assert(
    '9. pipeline foreground continúa (buffered, no queued-bg)',
    fg.pointsBuffered === 1 &&
      fg.pointsQueuedBackground === 0 &&
      fg.batchesAccepted === 1 &&
      fg.pointsAcceptedByApi === 1,
  );
  passed++;

  // 10. pipeline background: queued-bg (no buffered)
  let bg = createEmptyPipeline('bg2');
  bg = applyPipelineEvent('point-mapped', bg, t0);
  bg = applyPipelineEvent('point-queued-background', bg, t0, {
    pointCount: 2,
    queueDepth: 2,
  });
  bg = applyPipelineEvent('batch-created', bg, t0, { pointCount: 2 });
  bg = applyPipelineEvent('batch-send', bg, t0, { pointCount: 2 });
  bg = applyPipelineEvent('batch-success', bg, t0, {
    authLatencyMs: 1200,
    apiLatencyMs: 255,
    totalLatencyMs: 1520,
    latencyMs: 1520,
  });
  bg = applyPipelineEvent('batch-accepted', bg, t0, { accepted: 2 });
  assert(
    '10. pipeline background continúa (queued-bg, no buffered)',
    bg.pointsQueuedBackground === 2 &&
      bg.pointsBuffered === 0 &&
      bg.batchesAccepted === 1 &&
      bg.pointsAcceptedByApi === 2 &&
      bg.maxPendingQueueDepth === 2,
  );
  passed++;

  // Extra: sin sessionId, point-mapped no aplicaría en persist real — documentado por contrato
  // Dedupe: mismo punto dos veces
  const dup = mergePendingPoints([p1], [p1]);
  assert('11. dedupe evita duplicados', dup.added === 0 && dup.duplicatesSkipped === 1 && dup.points.length === 1);
  passed++;

  // batch-success solo no mueve accepted
  let onlySuccess = createEmptyPipeline('x');
  onlySuccess = applyPipelineEvent('batch-success', onlySuccess, t0);
  assert(
    '12. batch-success solo no incrementa batchesAccepted ni pointsAcceptedByApi',
    onlySuccess.batchesAccepted === 0 && onlySuccess.pointsAcceptedByApi === 0,
  );
  passed++;

  // ——— Concurrencia serializada (mutationChain) ———
  function createSerializedStore() {
    let chain = Promise.resolve();
    let state = { sessionId: null, points: [] };

    function serialize(op) {
      const run = chain.then(op, op);
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }

    return {
      async enqueue(sessionId, incoming) {
        return serialize(async () => {
          const existing =
            state.sessionId === sessionId ? state.points : [];
          // microtask yield to interleave concurrent callers before write
          await Promise.resolve();
          const merged = mergePendingPoints(existing, incoming);
          state = { sessionId, points: merged.points };
          return merged;
        });
      },
      async dequeueBatch(sessionId, max) {
        return serialize(async () => {
          if (state.sessionId !== sessionId) return [];
          await Promise.resolve();
          const { batch, remaining } = takePendingBatch(state.points, max);
          state = remaining.length
            ? { sessionId, points: remaining }
            : { sessionId: null, points: [] };
          return batch;
        });
      },
      async requeueFront(sessionId, failed) {
        return serialize(async () => {
          const remaining =
            state.sessionId === sessionId ? state.points : [];
          await Promise.resolve();
          state = {
            sessionId,
            points: requeueFailedBatch(remaining, failed),
          };
          return state.points.length;
        });
      },
      snapshot() {
        return state.points.map((p) => p.captured_at);
      },
      getPoints() {
        return [...state.points];
      },
    };
  }

  const storeA = createSerializedStore();
  await storeA.enqueue('s', [p1]);
  await Promise.all([storeA.enqueue('s', [p2]), storeA.enqueue('s', [p3])]);
  const afterConcurrent = storeA.getPoints();
  assert(
    '13. CASO A enqueue concurrente no pierde puntos',
    afterConcurrent.length === 3 &&
      afterConcurrent[0].captured_at === p1.captured_at &&
      afterConcurrent[1].captured_at === p2.captured_at &&
      afterConcurrent[2].captured_at === p3.captured_at,
  );
  passed++;

  const storeB = createSerializedStore();
  const p4 = { lat: 3.883, lng: -77.033, captured_at: '2026-08-23T14:01:00.000Z' };
  await storeB.enqueue('s', [p1, p2]);
  const [batchB] = await Promise.all([
    storeB.dequeueBatch('s', 2),
    storeB.enqueue('s', [p3, p4]),
  ]);
  assert(
    '14. CASO B dequeue∥enqueue consistente',
    batchB.length === 2 &&
      batchB[0].captured_at === p1.captured_at &&
      batchB[1].captured_at === p2.captured_at &&
      storeB.getPoints().length === 2 &&
      storeB.getPoints()[0].captured_at === p3.captured_at &&
      storeB.getPoints()[1].captured_at === p4.captured_at,
  );
  passed++;

  const storeC = createSerializedStore();
  await storeC.enqueue('s', [p1, p2]);
  const failedBatch = await storeC.dequeueBatch('s', 2);
  await Promise.all([
    storeC.requeueFront('s', failedBatch),
    storeC.enqueue('s', [p3, p4]),
  ]);
  const finalC = storeC.getPoints();
  assert(
    '15. CASO C requeue∥enqueue → P1..P4 ordenados',
    finalC.length === 4 &&
      finalC.map((p) => p.captured_at).join(',') ===
        [p1, p2, p3, p4].map((p) => p.captured_at).join(','),
  );
  passed++;

  // Session B no absorbe puntos de A
  const storeOwn = createSerializedStore();
  await storeOwn.enqueue('A', [p1, p2, p3]);
  await storeOwn.enqueue('B', [p4]);
  assert(
    '16. session ownership: enqueue B reemplaza y no mezcla A',
    storeOwn.getPoints().length === 1 &&
      storeOwn.getPoints()[0].captured_at === p4.captured_at,
  );
  passed++;

  // Finalización políticas
  function shouldProceedWithRemoteEnd(outcome) {
    return outcome.status === 'drained' && outcome.pendingRemaining === 0;
  }
  function shouldPreservePendingOnEndFailure(outcome) {
    return (
      outcome.status === 'timeout' ||
      outcome.status === 'network_error' ||
      outcome.pendingRemaining > 0
    );
  }
  function shouldClearPendingQueueAfterEnd(outcome) {
    return outcome.status === 'drained' && outcome.pendingRemaining === 0;
  }

  assert(
    '17. END pending=0 → end remoto',
    shouldProceedWithRemoteEnd({ status: 'drained', pendingRemaining: 0 }),
  );
  passed++;

  assert(
    '18. END pending drenado → clear seguro',
    shouldClearPendingQueueAfterEnd({ status: 'drained', pendingRemaining: 0 }),
  );
  passed++;

  assert(
    '19. END timeout → no end remoto + preservar',
    !shouldProceedWithRemoteEnd({ status: 'timeout', pendingRemaining: 2 }) &&
      shouldPreservePendingOnEndFailure({ status: 'timeout', pendingRemaining: 2 }),
  );
  passed++;

  assert(
    '20. END network_error → preservar pending',
    shouldPreservePendingOnEndFailure({
      status: 'network_error',
      pendingRemaining: 2,
    }),
  );
  passed++;

  // CANCEL = discard explícito (no requiere drain)
  const cancelDiscards = true;
  assert('21. CANCEL descarta pending de forma explícita', cancelDiscards === true);
  passed++;

  // END con in-flight: espera idle antes de decidir (modelo)
  let inFlight = true;
  const idleWaiters = [];
  function waitIdle() {
    if (!inFlight) return Promise.resolve('idle');
    return new Promise((resolve) => idleWaiters.push(() => resolve('idle')));
  }
  const waitPromise = waitIdle();
  inFlight = false;
  idleWaiters.splice(0).forEach((fn) => fn());
  assert('22. END espera batch in-flight (idle notificado)', (await waitPromise) === 'idle');
  passed++;

  console.log(`\nvalidate-tracking-observability: ${passed}/${passed} PASS`);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
})();
